/**
 * Resolución única de URL base del backend Go.
 *
 * Web: subdominio del tenant (demo.tukifac.com) — sin vinculación RUC.
 * Windows / Android: vinculación RUC → apiUrl persistida (como Tukichef).
 */

import { isNativeShell } from '@/lib/platform/detect'
import { getResolvedTenantApiUrl, getTenantBinding } from '@/lib/tenantBinding/store'
import { isDevelopmentMode } from '@/lib/runtime/environment'
import { normalizeBindingApiUrl } from '@/lib/tenantBinding/types'

export const RESERVED_SUBDOMAINS = ['api', 'app', 'www', 'admin', 'central'] as const

type ReservedSubdomain = (typeof RESERVED_SUBDOMAINS)[number]

export function normalizeApiOrigin(raw: string): string {
  let base = raw.trim()
  if (!base) return ''
  base = base.replace(/\/+$/, '')
  if (base.endsWith('/api')) base = base.slice(0, -4)
  return base
}

export function getRootDomain(): string {
  const fromEnv = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (fromEnv?.trim()) {
    return fromEnv
      .trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
  }
  return 'tukifac.com'
}

export function isLocalDevHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
}

function hostnameWithoutPort(hostname: string): string {
  const host = hostname.toLowerCase()
  const idx = host.lastIndexOf(':')
  if (idx === -1) return host
  return host.slice(0, idx)
}

export function extractSubdomainFromHost(hostname: string, rootDomain: string): string {
  const host = hostnameWithoutPort(hostname)
  const root = rootDomain.toLowerCase().replace(/^\./, '')

  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length)
    return sub && sub !== 'localhost' ? sub : ''
  }

  const suffix = `.${root}`
  if (!host.endsWith(suffix)) return ''

  const sub = host.slice(0, -suffix.length)
  if (!sub) return ''

  const dot = sub.indexOf('.')
  return dot >= 0 ? sub.slice(0, dot) : sub
}

function isReservedSubdomain(slug: string): slug is ReservedSubdomain {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug.toLowerCase())
}

export function isTenantProductionHost(hostname: string): boolean {
  if (isLocalDevHost(hostname)) return false
  const slug = extractSubdomainFromHost(hostname, getRootDomain())
  if (!slug) return false
  return !isReservedSubdomain(slug)
}

export function getCentralApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_CENTRAL_API_URL as string | undefined
  if (fromEnv?.trim()) return normalizeApiOrigin(fromEnv)
  return `https://api.${getRootDomain()}`
}

/** Base URL para peticiones públicas (tenant-by-ruc) en apps nativas. */
export function getCentralApiRequestBaseUrl(): string {
  if (shouldUseDevApiProxy()) return ''
  return getCentralApiOrigin()
}

export function getTenantApiOriginForSlug(slug: string): string {
  const s = slug.trim().toLowerCase()
  if (!s) return ''
  if (import.meta.env.DEV) {
    const env = import.meta.env.VITE_API_URL as string | undefined
    if (env?.trim()) return normalizeApiOrigin(env)
    return 'http://localhost:3000'
  }
  return `https://${s}.${getRootDomain()}`
}

export function shouldUseDevApiProxy(): boolean {
  return import.meta.env.DEV
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    const env = import.meta.env.VITE_API_URL as string | undefined
    return env?.trim() ? normalizeApiOrigin(env) : 'http://localhost:3000'
  }

  if (isNativeShell()) {
    if (shouldUseDevApiProxy()) return ''
    const url = getResolvedTenantApiUrl()
    if (url) return normalizeApiOrigin(url)
    return ''
  }

  const { hostname, origin } = window.location

  if (isTenantProductionHost(hostname)) {
    return normalizeApiOrigin(origin)
  }

  if (isLocalDevHost(hostname)) {
    const env = import.meta.env.VITE_API_URL as string | undefined
    if (env?.trim()) return normalizeApiOrigin(env)
    return 'http://localhost:3000'
  }

  const slug = extractSubdomainFromHost(hostname, getRootDomain())
  if (slug && isReservedSubdomain(slug)) {
    return getCentralApiOrigin()
  }

  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env?.trim()) return normalizeApiOrigin(env)

  return getCentralApiOrigin()
}

export function getApiPrefixUrl(): string {
  return `${getApiBaseUrl().replace(/\/$/, '')}/api`
}

/**
 * Origen para /uploads y /storage.
 * En release los archivos los sirve el API central (api.tukifac.com), no el host del SPA tenant.
 * En dev, rutas relativas pasan por el proxy Vite (/uploads → backend).
 */
export function getPublicAssetsBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ASSETS_ORIGIN as string | undefined
  if (fromEnv?.trim()) return normalizeApiOrigin(fromEnv)
  if (shouldUseDevApiProxy()) return ''
  return getCentralApiOrigin()
}

export function resolvePublicAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = getPublicAssetsBaseUrl()
  return `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : '/' + url}`
}

/** Slug del tenant: binding en nativo; subdominio o env en web. */
export function getTenantSlug(): string {
  if (isNativeShell()) {
    return getTenantBinding()?.slug?.trim() ?? ''
  }

  if (typeof window === 'undefined') return ''

  const slug = extractSubdomainFromHost(window.location.hostname, getRootDomain())
  if (slug && !isReservedSubdomain(slug)) return slug

  const fromEnv = import.meta.env.VITE_TENANT_SLUG as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim()

  return localStorage.getItem('tenantSlug') ?? ''
}

/** URL del tenant para UI / depuración. */
export function getDisplayedTenantApiUrl(): string {
  if (isNativeShell()) {
    const url = getResolvedTenantApiUrl()
    if (url) return normalizeApiOrigin(url)
    if (isDevelopmentMode()) {
      const central = getCentralApiOrigin()
      return central ? `${central} (proxy dev)` : 'Proxy local (Vite)'
    }
    return '—'
  }
  const base = getApiBaseUrl()
  if (base) return base
  if (shouldUseDevApiProxy()) return 'Proxy local (Vite)'
  return '—'
}
