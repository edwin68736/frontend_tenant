/**
 * Resolución única de URL base del backend Go.
 *
 * Convención axios: base = origen sin /api; rutas incluyen /api/...
 * Ej. tenant prod → https://demo.tukifac.com + /api/session/context
 */

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

/** Alineado con backend pkg/utils ExtractSubdomain. */
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

/** Host de producción con subdominio tenant (demo.tukifac.com, no api/app). */
export function isTenantProductionHost(hostname: string): boolean {
  if (isLocalDevHost(hostname)) return false
  const slug = extractSubdomainFromHost(hostname, getRootDomain())
  if (!slug) return false
  return !isReservedSubdomain(slug)
}

/** API central (superadmin / hosts reservados). */
export function getCentralApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_CENTRAL_API_URL as string | undefined
  if (fromEnv?.trim()) return normalizeApiOrigin(fromEnv)
  return `https://api.${getRootDomain()}`
}

/**
 * Origen del backend (scheme + host + port), sin /api al final.
 * Las peticiones axios usan paths `/api/...`.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    const env = import.meta.env.VITE_API_URL as string | undefined
    return env?.trim() ? normalizeApiOrigin(env) : 'http://localhost:3000'
  }

  const { hostname, origin } = window.location

  // Producción tenant: same-origin (Host = {slug}.tukifac.com)
  if (isTenantProductionHost(hostname)) {
    return normalizeApiOrigin(origin)
  }

  // Desarrollo local (localhost, 127.0.0.1, demo.localhost)
  if (isLocalDevHost(hostname)) {
    const env = import.meta.env.VITE_API_URL as string | undefined
    if (env?.trim()) return normalizeApiOrigin(env)
    return 'http://localhost:3000'
  }

  // app.tukifac.com, api.tukifac.com u otro host reservado
  const slug = extractSubdomainFromHost(hostname, getRootDomain())
  if (slug && isReservedSubdomain(slug)) {
    return getCentralApiOrigin()
  }

  // Override explícito (tests, despliegues especiales) — no domina en tenant prod
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env?.trim()) return normalizeApiOrigin(env)

  return getCentralApiOrigin()
}

/** Prefijo /api para SSE, fetch manual o assets bajo /api. */
export function getApiPrefixUrl(): string {
  return `${getApiBaseUrl().replace(/\/$/, '')}/api`
}

export function getTenantSlug(): string {
  if (typeof window === 'undefined') return ''

  const slug = extractSubdomainFromHost(window.location.hostname, getRootDomain())
  if (slug && !isReservedSubdomain(slug)) return slug

  const fromEnv = import.meta.env.VITE_TENANT_SLUG as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim()

  return localStorage.getItem('tenantSlug') ?? ''
}
