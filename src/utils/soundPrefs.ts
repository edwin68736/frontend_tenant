import { useSyncExternalStore } from 'react'

/**
 * Preferencia "sonidos del POS" (beep al agregar/quitar del carrito y caja registradora al vender).
 * Vive en localStorage, por empresa y por usuario: cada cajero silencia o activa en su equipo sin
 * afectar a los demás. Activado por defecto. Se cambia desde el ícono del encabezado.
 */
const EVENT = 'tukifac:sound-pref'

function storageKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: number } | null
    const slug = localStorage.getItem('tenantSlug') || ''
    return `tukifac_pos_sounds::${slug}::${user?.id ?? 'anon'}`
  } catch {
    return 'tukifac_pos_sounds::anon'
  }
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(storageKey()) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(storageKey(), enabled ? 'on' : 'off')
  } catch {
    /* sin localStorage: la preferencia no se conserva */
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isSoundEnabled, () => true)
}
