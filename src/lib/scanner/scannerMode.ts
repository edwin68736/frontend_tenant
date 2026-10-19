import { useSyncExternalStore } from 'react'
import { isCapacitorNative } from '@/lib/platform/detect'

/**
 * Preferencia POR DISPOSITIVO (localStorage) para escanear códigos de barras:
 * - `camera`: cámara del equipo (solo existe en la app Capacitor Android/iOS). Es el valor por defecto.
 * - `reader`: lector físico HID (Bluetooth o USB/OTG), que actúa como teclado y termina con Enter.
 *
 * En web y Tauri no hay cámara de escaneo: el modo efectivo es siempre `reader`.
 */
export type ScannerMode = 'camera' | 'reader'

export const SCANNER_MODE_STORAGE_KEY = 'tukifac.scanner.mode'
export const DEFAULT_SCANNER_MODE: ScannerMode = 'camera'

const CHANGE_EVENT = 'tukifac:scanner-mode-change'

export function getScannerModePreference(): ScannerMode {
  try {
    const raw = localStorage.getItem(SCANNER_MODE_STORAGE_KEY)
    if (raw === 'camera' || raw === 'reader') return raw
  } catch {
    /* localStorage no disponible */
  }
  return DEFAULT_SCANNER_MODE
}

export function setScannerModePreference(mode: ScannerMode): void {
  try {
    localStorage.setItem(SCANNER_MODE_STORAGE_KEY, mode)
  } catch {
    /* sin persistencia: el cambio solo vale mientras la app esté abierta */
    memoryMode = mode
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

// Respaldo en memoria si localStorage lanza (modo privado, datos bloqueados).
let memoryMode: ScannerMode | null = null

function readSnapshot(): ScannerMode {
  try {
    const raw = localStorage.getItem(SCANNER_MODE_STORAGE_KEY)
    if (raw === 'camera' || raw === 'reader') return raw
  } catch {
    if (memoryMode) return memoryMode
  }
  return DEFAULT_SCANNER_MODE
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Preferencia guardada, reactiva (se actualiza si cambia en Ajustes u otra pestaña). */
export function useScannerModePreference(): ScannerMode {
  return useSyncExternalStore(subscribe, readSnapshot, () => DEFAULT_SCANNER_MODE)
}

/** Modo realmente usable en este equipo: sin cámara de escaneo (web/Tauri) siempre es lector. */
export function resolveScannerMode(pref: ScannerMode): ScannerMode {
  return isCapacitorNative() && pref === 'camera' ? 'camera' : 'reader'
}
