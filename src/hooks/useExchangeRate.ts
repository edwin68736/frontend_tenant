import { useCallback, useEffect, useRef, useState } from 'react'
import { consultaService, type TipoCambioResult } from '@/services/consulta.service'
import {
  getLocalExchangeRate,
  setLocalExchangeRate,
  shouldSilentlyRefreshLocalRate,
} from '@/utils/exchangeRateCache'

export interface UseExchangeRateOptions {
  /** Si false, no consulta (p. ej. cotización). */
  enabled?: boolean
}

export interface UseExchangeRateResult {
  loading: boolean
  error: string
  meta: TipoCambioResult | null
  exchangeRate: string
  isFallback: boolean
}

/** Intervalo de revalidación silenciosa cuando el cache local es fallback (ms). */
const FALLBACK_SILENT_REFRESH_MS = 12 * 60 * 1000

/**
 * Autocompleta tipo de cambio: localStorage → backend (cache central).
 * Evita llamadas repetidas al backend para la misma fecha en la sesión/navegador.
 */
export function useExchangeRate(issueDate: string, options: UseExchangeRateOptions = {}): UseExchangeRateResult {
  const { enabled = true } = options
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<TipoCambioResult | null>(null)
  const [exchangeRate, setExchangeRate] = useState('')
  const silentRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const apply = useCallback((res: TipoCambioResult) => {
    setMeta(res)
    if (res.success && res.venta && res.venta > 0) {
      setExchangeRate(String(res.venta))
      setError('')
    } else {
      setExchangeRate('')
      setError(res.error_message ?? res.mensaje ?? 'No se pudo obtener el tipo de cambio.')
    }
  }, [])

  useEffect(() => {
    if (!enabled || !issueDate) {
      setLoading(false)
      setError('')
      setMeta(null)
      setExchangeRate('')
      return
    }

    let cancelled = false

    const cached = getLocalExchangeRate(issueDate)
    if (cached) {
      apply(cached)
      setLoading(false)
      if (!shouldSilentlyRefreshLocalRate(cached)) {
        return
      }
    } else {
      setLoading(true)
      setError('')
      consultaService
        .tipoCambio(issueDate)
        .then((res) => {
          if (cancelled) return
          if (res.success && res.venta && res.venta > 0) {
            setLocalExchangeRate(issueDate, res)
          }
          apply(res)
        })
        .catch(() => {
          if (!cancelled) {
            setError('No se pudo consultar el tipo de cambio.')
            setMeta(null)
            setExchangeRate('')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    return () => {
      cancelled = true
    }
  }, [issueDate, enabled, apply])

  // Revalidación silenciosa solo mientras el formulario está abierto y el cache local es fallback.
  useEffect(() => {
    if (silentRefreshRef.current) {
      clearInterval(silentRefreshRef.current)
      silentRefreshRef.current = null
    }
    if (!enabled || !issueDate) return

    const cached = getLocalExchangeRate(issueDate)
    if (!shouldSilentlyRefreshLocalRate(cached)) return

    const refresh = () => {
      consultaService
        .tipoCambio(issueDate)
        .then((res) => {
          if (res.success && res.status === 'confirmed' && res.venta && res.venta > 0) {
            setLocalExchangeRate(issueDate, res)
            apply(res)
          }
        })
        .catch(() => {
          /* silencioso */
        })
    }

    silentRefreshRef.current = setInterval(refresh, FALLBACK_SILENT_REFRESH_MS)

    return () => {
      if (silentRefreshRef.current) {
        clearInterval(silentRefreshRef.current)
        silentRefreshRef.current = null
      }
    }
  }, [issueDate, enabled, meta?.status, meta?.es_fallback, apply])

  return {
    loading,
    error,
    meta,
    exchangeRate,
    isFallback: Boolean(meta?.es_fallback || meta?.status === 'fallback' || meta?.status === 'pending'),
  }
}
