import { getTenantSlug } from '@/config/apiBaseUrl'
import { resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import type { CompanyConfig } from '@/services/company.service'

/**
 * Caché de datos del tenant (config de empresa + logo como data URL).
 *
 * Objetivo: al iniciar sesión se cachea la config y el logo se convierte UNA vez
 * a data URL. Todos los comprobantes (impresión directa y PDF) usan ese data URL,
 * sin repetir consultas al backend y sin problemas de CORS al generar el PDF.
 * Solo se refresca cuando los datos del tenant se editan.
 *
 * Persistencia: localStorage (disponible en web, Tauri y Capacitor), por tenant.
 */

const CONFIG_KEY = 'tukifac_company_config_v1'
const LOGO_KEY = 'tukifac_company_logo_v1'

type PersistedLogo = { srcKey: string; dataUrl: string }

let configCache: CompanyConfig | null = null
let logoDataUrl: string | null = null
let logoSrcKey = ''
let logoSeeded = false

function tenantKey(base: string): string {
  return `${base}::${getTenantSlug() || 'default'}`
}

/** Hash estable y corto de la ruta del logo, para saber si cambió. */
function srcKeyFor(raw: string): string {
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (h * 31 + raw.charCodeAt(i)) | 0
  }
  return `${raw.length}-${(h >>> 0).toString(36)}`
}

function safeGet(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    /* cuota llena u otro: ignorar (el caché en memoria sigue funcionando) */
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    /* ignorar */
  }
}

// ---------- Config ----------

export function getCompanyConfigCache(): CompanyConfig | null {
  if (configCache) return configCache
  const raw = safeGet(tenantKey(CONFIG_KEY))
  if (!raw) return null
  try {
    configCache = JSON.parse(raw) as CompanyConfig
    return configCache
  } catch {
    return null
  }
}

export function setCompanyConfigCache(cfg: CompanyConfig | null | undefined): void {
  if (!cfg) return
  configCache = cfg
  safeSet(tenantKey(CONFIG_KEY), JSON.stringify(cfg))
}

// ---------- Logo (data URL) ----------

function readPersistedLogo(): PersistedLogo | null {
  const raw = safeGet(tenantKey(LOGO_KEY))
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as PersistedLogo
    if (data?.srcKey && data?.dataUrl) return data
    return null
  } catch {
    return null
  }
}

function persistLogo(srcKey: string, dataUrl: string): void {
  logoDataUrl = dataUrl
  logoSrcKey = srcKey
  logoSeeded = true
  safeSet(tenantKey(LOGO_KEY), JSON.stringify({ srcKey, dataUrl }))
}

function seedLogoFromStorage(): void {
  if (logoSeeded) return
  logoSeeded = true
  const persisted = readPersistedLogo()
  if (persisted) {
    logoDataUrl = persisted.dataUrl
    logoSrcKey = persisted.srcKey
  }
}

/**
 * Devuelve el data URL del logo cacheado (sincrónico) si corresponde a `logoUrl`.
 * Úsalo al armar datos de impresión/PDF: si hay caché, el PDF incrusta el data URL
 * sin CORS; si no, el llamador debe usar la URL remota como respaldo.
 */
export function getCompanyLogoDataUrlSync(logoUrl?: string | null): string | null {
  const raw = String(logoUrl ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('data:')) return raw
  seedLogoFromStorage()
  if (logoDataUrl && logoSrcKey === srcKeyFor(raw)) return logoDataUrl
  return null
}

/**
 * Asegura que el logo esté cacheado como data URL. Lo descarga una sola vez
 * (probando el API del tenant, same-origin y el servidor central). Idempotente.
 */
export async function ensureCompanyLogoDataUrl(logoUrl?: string | null): Promise<string | null> {
  const raw = String(logoUrl ?? getCompanyConfigCache()?.logo_url ?? '').trim()
  if (!raw) {
    clearCompanyLogoCache()
    return null
  }
  if (raw.startsWith('data:')) {
    persistLogo(srcKeyFor(raw), raw)
    return raw
  }
  const key = srcKeyFor(raw)
  seedLogoFromStorage()
  if (logoDataUrl && logoSrcKey === key) return logoDataUrl

  const asset = await resolveReceiptLogoForPdf(raw)
  if (asset?.dataUrl) {
    persistLogo(key, asset.dataUrl)
    return asset.dataUrl
  }
  return null
}

/** Guarda el logo recién subido a partir del File local (sin red ni CORS). */
export async function setCompanyLogoFromFile(file: File, logoUrl: string): Promise<void> {
  const raw = String(logoUrl ?? '').trim()
  if (!raw || !file) return
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('read error'))
      reader.readAsDataURL(file)
    })
    if (dataUrl.startsWith('data:image/')) persistLogo(srcKeyFor(raw), dataUrl)
  } catch {
    // Si falla la lectura local, se re-descargará luego vía ensureCompanyLogoDataUrl.
    void ensureCompanyLogoDataUrl(raw)
  }
}

export function clearCompanyLogoCache(): void {
  logoDataUrl = null
  logoSrcKey = ''
  logoSeeded = true
  safeRemove(tenantKey(LOGO_KEY))
}

/** Limpia todo (p. ej. al cerrar sesión). */
export function clearCompanyCaches(): void {
  configCache = null
  logoDataUrl = null
  logoSrcKey = ''
  logoSeeded = false
  safeRemove(tenantKey(CONFIG_KEY))
  safeRemove(tenantKey(LOGO_KEY))
}
