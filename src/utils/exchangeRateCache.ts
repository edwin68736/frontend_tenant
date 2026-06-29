import type { TipoCambioResult } from '@/services/consulta.service'
import { getTodayPlusDaysPeru } from '@/utils/datesPeru'

const STORAGE_KEY = 'tukifac_exchange_rates_v1'

/** Ventana de historial reciente para registros confirmados (días calendario en Lima, hoy inclusive). */
export const LOCAL_CONFIRMED_CACHE_DAYS = 7

/** Expiración rápida para fallback (ms). */
export const LOCAL_FALLBACK_CACHE_TTL_MS = 15 * 60 * 1000

/** Metadatos de ciclo de vida; el resto de campos vienen de TipoCambioResult. */
export type CachedExchangeRateEntry = TipoCambioResult & {
  cached_at?: string
  /** Solo aplica a registros fallback. */
  expires_at?: string
}

type ExchangeRateCacheMap = Record<string, CachedExchangeRateEntry>

type PersistableStatus = 'confirmed' | 'fallback'

function hasValidRate(result: Pick<TipoCambioResult, 'success' | 'venta'>): boolean {
  return Boolean(result.success && result.venta && result.venta > 0)
}

function isPersistableStatus(status?: string): status is PersistableStatus {
  return status === 'confirmed' || status === 'fallback'
}

/** Solo confirmed y fallback deben almacenarse en localStorage. */
export function shouldPersistLocalExchangeRate(result: TipoCambioResult): boolean {
  return hasValidRate(result) && isPersistableStatus(result.status)
}

/** Fecha mínima (inclusive) para conservar un TC confirmado según America/Lima. */
function confirmedRetentionCutoffYmd(): string {
  return getTodayPlusDaysPeru(-(LOCAL_CONFIRMED_CACHE_DAYS - 1))
}

function isConfirmedTooOld(rateDateYmd: string): boolean {
  const date = rateDateYmd.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true
  return date < confirmedRetentionCutoffYmd()
}

function isExpiredEntry(key: string, entry: CachedExchangeRateEntry): boolean {
  if (!isPersistableStatus(entry.status)) return true

  if (entry.status === 'fallback') {
    if (!entry.expires_at) return true
    const exp = Date.parse(entry.expires_at)
    return Number.isFinite(exp) && exp < Date.now()
  }

  const rateDate = (entry.fecha ?? key).trim()
  return isConfirmedTooOld(rateDate)
}

function isRetainedEntry(key: string, entry: CachedExchangeRateEntry): boolean {
  if (!hasValidRate(entry)) return false
  if (!isPersistableStatus(entry.status)) return false
  return !isExpiredEntry(key, entry)
}

/** Elimina entradas expiradas, transitorias o inválidas. */
export function pruneLocalExchangeRateCache(map: ExchangeRateCacheMap): ExchangeRateCacheMap {
  const next: ExchangeRateCacheMap = {}
  for (const [key, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== 'object') continue
    if (!isRetainedEntry(key, entry)) continue
    next[key] = entry
  }
  return next
}

function readRawMap(): ExchangeRateCacheMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ExchangeRateCacheMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: ExchangeRateCacheMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota exceeded — ignore */
  }
}

/**
 * Lee el diccionario, purga expirados y persiste la versión limpia.
 */
function readMap(): ExchangeRateCacheMap {
  const raw = readRawMap()
  const pruned = pruneLocalExchangeRateCache(raw)
  if (Object.keys(pruned).length !== Object.keys(raw).length) {
    writeMap(pruned)
  }
  return pruned
}

export function buildCacheMetadata(
  status: PersistableStatus,
): Pick<CachedExchangeRateEntry, 'cached_at' | 'expires_at'> {
  const cachedAtDate = new Date()
  const cachedAt = cachedAtDate.toISOString()

  if (status === 'fallback') {
    return {
      cached_at: cachedAt,
      expires_at: new Date(cachedAtDate.getTime() + LOCAL_FALLBACK_CACHE_TTL_MS).toISOString(),
    }
  }

  return { cached_at: cachedAt }
}

/** TC cacheado localmente por fecha yyyy-mm-dd. */
export function getLocalExchangeRate(fecha: string): CachedExchangeRateEntry | null {
  const key = fecha.trim()
  if (!key) return null
  const row = readMap()[key]
  if (!row || !isRetainedEntry(key, row)) return null
  return row
}

export function setLocalExchangeRate(fecha: string, result: TipoCambioResult) {
  const key = fecha.trim()
  if (!key || !shouldPersistLocalExchangeRate(result)) return

  const status = result.status as PersistableStatus
  const map = readMap()
  map[key] = {
    ...result,
    fecha: result.fecha ?? key,
    ...buildCacheMetadata(status),
  }
  writeMap(pruneLocalExchangeRateCache(map))
}

export function clearLocalExchangeRateCache() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Indica si el registro local debe revalidarse en segundo plano (solo fallback). */
export function shouldSilentlyRefreshLocalRate(entry: CachedExchangeRateEntry | null): boolean {
  if (!entry?.success) return false
  return entry.status === 'fallback'
}
