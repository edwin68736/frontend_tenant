import { isNativeShell } from '@/lib/platform/detect'
import { isDevelopmentMode, isProductionMode } from '@/lib/runtime/environment'
import { currentBindingEnvironment } from './envStorage'
import {
  clearLegacyLocalStorageBinding,
  clearTenantBindingOnDevice,
  readDevBindingFromLocalStorage,
  readLegacyLocalStorageBinding,
  readTenantBindingFromDevice,
  writeTenantBindingToDevice,
} from './persist'
import {
  isCentralApiHost,
  isValidTenantBinding,
  normalizeBindingApiUrl,
  TENANT_BINDING_VERSION,
  type TenantBinding,
  type TenantByRucResponse,
} from './types'

let cache: TenantBinding | null = null
let initPromise: Promise<TenantBinding | null> | null = null

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function subscribeTenantBinding(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTenantBinding(): TenantBinding | null {
  return cache
}

export function isTenantBound(): boolean {
  if (!isNativeShell()) return true
  return isValidTenantBinding(cache)
}

export async function initTenantBindingStore(): Promise<TenantBinding | null> {
  if (!isNativeShell()) {
    cache = null
    return null
  }

  if (initPromise) return initPromise
  initPromise = (async () => {
    if (isProductionMode()) {
      clearLegacyLocalStorageBinding()
    }

    let binding: TenantBinding | null = null

    if (isDevelopmentMode()) {
      binding = readDevBindingFromLocalStorage()
      if (!binding) {
        binding = readLegacyLocalStorageBinding()
      }
    } else {
      binding = await readTenantBindingFromDevice()
    }

    if (binding && !isValidTenantBinding(binding)) {
      await clearTenantBindingOnDevice()
      binding = null
    }

    cache = binding
    notify()
    return binding
  })()
  return initPromise
}

export function resetTenantBindingInit(): void {
  initPromise = null
}

export async function reloadTenantBindingStore(): Promise<TenantBinding | null> {
  resetTenantBindingInit()
  return initTenantBindingStore()
}

function devTenantApiFallback(): string {
  const central = import.meta.env.VITE_CENTRAL_API_URL || import.meta.env.VITE_API_URL
  if (central && typeof central === 'string' && central.trim()) {
    return normalizeBindingApiUrl(central)
  }
  return 'http://localhost:3000'
}

export async function bindTenantFromRuc(data: TenantByRucResponse, ruc: string): Promise<TenantBinding> {
  const rucNorm = ruc.replace(/\D/g, '').trim()
  const slug = (data.tenant_slug || data.slug).trim()
  let apiUrl = normalizeBindingApiUrl(data.api_url || '')
  if (!apiUrl && isDevelopmentMode()) {
    apiUrl = devTenantApiFallback()
  }

  if (!slug) {
    throw new Error('El servidor no devolvió el identificador de la empresa')
  }
  if (!apiUrl) {
    throw new Error('El servidor no devolvió la URL del tenant. Contacte soporte.')
  }

  const candidate: TenantBinding = {
    version: TENANT_BINDING_VERSION,
    slug,
    apiUrl,
    name: data.name?.trim() ?? '',
    ruc: rucNorm,
    tokenConsultaDatos: data.token_consulta_datos?.trim() ?? '',
    environment: currentBindingEnvironment(),
    boundAt: new Date().toISOString(),
    lastConnectionAt: new Date().toISOString(),
  }

  if (!isValidTenantBinding(candidate)) {
    throw new Error(
      'La URL del tenant no es válida. Debe ser el subdominio de su empresa (no api.tukifac.com).',
    )
  }

  if (isProductionMode() && cache && cache.slug !== slug) {
    throw new Error(
      'Esta instalación ya está vinculada a otra empresa. Desinstale la aplicación para vincular otro RUC.',
    )
  }

  const binding: TenantBinding = {
    ...candidate,
    boundAt: cache?.boundAt ?? candidate.boundAt,
  }

  await writeTenantBindingToDevice(binding)
  clearLegacyLocalStorageBinding()
  cache = binding
  notify()
  return binding
}

export async function wipeTenantBinding(): Promise<void> {
  await clearTenantBindingOnDevice()
  clearLegacyLocalStorageBinding()
  cache = null
  resetTenantBindingInit()
  notify()
}

export async function updateDevTenantApiUrl(apiUrl: string): Promise<TenantBinding> {
  if (!isDevelopmentMode()) {
    throw new Error('Solo disponible en modo desarrollo')
  }
  const normalized = normalizeBindingApiUrl(apiUrl)
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    throw new Error('URL inválida. Use http:// o https://')
  }
  if (isCentralApiHost(normalized)) {
    throw new Error('Use la URL del tenant (subdominio), no la API central.')
  }

  const base: TenantBinding = cache ?? {
    version: TENANT_BINDING_VERSION,
    slug: 'dev',
    apiUrl: normalized,
    name: 'Desarrollo local',
    ruc: '',
    tokenConsultaDatos: '',
    environment: 'development',
    boundAt: new Date().toISOString(),
  }

  const next: TenantBinding = {
    ...base,
    apiUrl: normalized,
    environment: 'development',
    lastConnectionAt: new Date().toISOString(),
  }

  await writeTenantBindingToDevice(next)
  cache = next
  notify()
  return next
}

export function getResolvedTenantApiUrl(): string {
  if (!isNativeShell()) return ''
  const binding = cache
  if (binding?.apiUrl) return normalizeBindingApiUrl(binding.apiUrl)
  if (isDevelopmentMode()) return devTenantApiFallback()
  return ''
}
