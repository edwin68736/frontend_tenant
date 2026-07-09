import { useEffect, useState } from 'react'
import {
  DEFAULT_PREPAYMENT_CONFIG,
  normalizePrepaymentConfig,
  prepaymentService,
  type PrepaymentModuleConfig,
} from '@/services/prepayment.service'

export function usePrepaymentConfig(enabled = true) {
  const [config, setConfig] = useState<PrepaymentModuleConfig>(DEFAULT_PREPAYMENT_CONFIG)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    prepaymentService
      .getConfig()
      .then((data) => {
        if (!cancelled) {
          setConfig(normalizePrepaymentConfig(data))
          setError('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(DEFAULT_PREPAYMENT_CONFIG)
          setError('No se pudo cargar la configuración de anticipos.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { config, loading, error }
}
