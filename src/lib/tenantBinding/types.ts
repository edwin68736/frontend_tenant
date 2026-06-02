export type TenantByRucResponse = {
  slug: string
  tenant_slug?: string
  name: string
  subdomain?: string
  api_url?: string
  tenant_version?: number
  token_consulta_datos: string
}

import type { AppEnvironment } from '@/lib/runtime/environment'

/** Vinculación única por instalación (RUC → slug + URL del tenant). */
export type TenantBinding = {
  version: 1
  slug: string
  apiUrl: string
  name: string
  ruc: string
  tokenConsultaDatos: string
  environment: AppEnvironment
  boundAt: string
  lastConnectionAt?: string
}

export const TENANT_BINDING_VERSION = 1 as const

export function parseTenantBinding(raw: string | null | undefined): TenantBinding | null {
  if (!raw?.trim()) return null
  try {
    const data = JSON.parse(raw) as TenantBinding
    if (data.version !== TENANT_BINDING_VERSION) return null
    const slug = String(data.slug ?? '').trim()
    const apiUrl = String(data.apiUrl ?? '').trim()
    if (!slug || !apiUrl) return null
    return {
      version: TENANT_BINDING_VERSION,
      slug,
      apiUrl,
      name: String(data.name ?? '').trim(),
      ruc: String(data.ruc ?? '').trim(),
      tokenConsultaDatos: String(data.tokenConsultaDatos ?? '').trim(),
      environment: data.environment === 'development' ? 'development' : 'production',
      boundAt: String(data.boundAt ?? new Date().toISOString()),
      lastConnectionAt: data.lastConnectionAt ? String(data.lastConnectionAt) : undefined,
    }
  } catch {
    return null
  }
}

export function toStoredTenant(binding: TenantBinding) {
  return {
    slug: binding.slug,
    name: binding.name,
    ruc: binding.ruc,
    apiUrl: binding.apiUrl,
    tokenConsultaDatos: binding.tokenConsultaDatos,
  }
}

export function normalizeBindingApiUrl(url: string): string {
  let base = url.trim().replace(/\/+$/, '')
  if (base.endsWith('/api')) base = base.slice(0, -4)
  return base
}

/** URL central (solo bootstrap RUC); no sirve como API del tenant. */
export function isCentralApiHost(url: string): boolean {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`
    const host = new URL(normalized).hostname.toLowerCase()
    const root = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.trim().toLowerCase() || 'tukifac.com'
    return host === `api.${root}` || host.startsWith('api.')
  } catch {
    return /api\.tukifac/i.test(url)
  }
}

export function isValidTenantBinding(binding: TenantBinding | null | undefined): boolean {
  if (!binding?.slug?.trim() || !binding?.apiUrl?.trim()) return false
  const apiUrl = normalizeBindingApiUrl(binding.apiUrl)
  if (!/^https?:\/\//i.test(apiUrl)) return false
  if (isCentralApiHost(apiUrl)) return false
  return true
}
