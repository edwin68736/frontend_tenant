import { Preferences } from '@capacitor/preferences'
import { invoke } from '@tauri-apps/api/core'
import { isDevelopmentMode } from '@/lib/runtime/environment'
import { isCapacitorNative, isTauriDesktop } from '@/lib/platform/detect'
import { localStorageKeyForEnvironment, prefsKeyForEnvironment } from './envStorage'
import { parseTenantBinding, TENANT_BINDING_VERSION, type TenantBinding } from './types'

export async function readTenantBindingFromDevice(): Promise<TenantBinding | null> {
  if (isDevelopmentMode()) {
    return readDevBindingFromLocalStorage()
  }

  const prefsKey = prefsKeyForEnvironment('production')

  if (isTauriDesktop()) {
    try {
      const raw = await invoke<string | null>('tenant_binding_read')
      return parseTenantBinding(raw ?? undefined)
    } catch (e) {
      console.error('[tenant-binding] tauri read failed', e)
      return null
    }
  }
  if (isCapacitorNative()) {
    try {
      const { value } = await Preferences.get({ key: prefsKey })
      return parseTenantBinding(value)
    } catch (e) {
      console.error('[tenant-binding] preferences read failed', e)
      return null
    }
  }
  return null
}

export async function writeTenantBindingToDevice(binding: TenantBinding): Promise<void> {
  if (isDevelopmentMode()) {
    writeDevBindingToLocalStorage(binding)
    return
  }

  const payload = JSON.stringify(binding)
  if (isTauriDesktop()) {
    await invoke('tenant_binding_write', { payload })
    return
  }
  if (isCapacitorNative()) {
    await Preferences.set({ key: prefsKeyForEnvironment('production'), value: payload })
  }
}

export async function clearTenantBindingOnDevice(): Promise<void> {
  if (isDevelopmentMode()) {
    clearDevBindingFromLocalStorage()
    return
  }

  if (isTauriDesktop()) {
    try {
      await invoke('tenant_binding_clear')
    } catch {
      /* ignore */
    }
    return
  }
  if (isCapacitorNative()) {
    try {
      await Preferences.remove({ key: prefsKeyForEnvironment('production') })
    } catch {
      /* ignore */
    }
  }
}

export function readDevBindingFromLocalStorage(): TenantBinding | null {
  if (typeof localStorage === 'undefined') return null
  return parseTenantBinding(localStorage.getItem(localStorageKeyForEnvironment('development')))
}

export function writeDevBindingToLocalStorage(binding: TenantBinding): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(localStorageKeyForEnvironment('development'), JSON.stringify(binding))
}

export function clearDevBindingFromLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(localStorageKeyForEnvironment('development'))
}

export function readLegacyLocalStorageBinding(): TenantBinding | null {
  if (typeof localStorage === 'undefined') return null
  const slug = localStorage.getItem('tenantSlug')?.trim()
  const apiUrl = localStorage.getItem('tenantApiUrl')?.trim()
  if (!slug || !apiUrl) return null
  return {
    version: TENANT_BINDING_VERSION,
    slug,
    apiUrl,
    name: localStorage.getItem('tenantName')?.trim() ?? '',
    ruc: localStorage.getItem('tenantRuc')?.trim() ?? '',
    tokenConsultaDatos: localStorage.getItem('tokenConsultaDatos')?.trim() ?? '',
    environment: isDevelopmentMode() ? 'development' : 'production',
    boundAt: new Date().toISOString(),
  }
}

export function clearLegacyLocalStorageBinding(): void {
  if (typeof localStorage === 'undefined') return
  for (const key of ['tenantSlug', 'tenantName', 'tenantRuc', 'tenantApiUrl', 'tokenConsultaDatos']) {
    localStorage.removeItem(key)
  }
}
