import { Capacitor } from '@capacitor/core'
import type { AppRuntime, CapacitorPlatform } from './types'

function hasTauriBridge(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__)
}

export function getAppRuntime(): AppRuntime {
  if (typeof window === 'undefined') return 'web'
  if (Capacitor.isNativePlatform()) return 'capacitor'
  if (hasTauriBridge()) return 'tauri'
  return 'web'
}

export function isCapacitorNative(): boolean {
  return getAppRuntime() === 'capacitor'
}

export function isTauriDesktop(): boolean {
  return getAppRuntime() === 'tauri'
}

export function isWebBrowser(): boolean {
  return getAppRuntime() === 'web'
}

export function isNativeShell(): boolean {
  return isCapacitorNative() || isTauriDesktop()
}

export function getCapacitorPlatform(): CapacitorPlatform {
  if (!isCapacitorNative()) return 'unknown'
  const p = Capacitor.getPlatform()
  if (p === 'android' || p === 'ios') return p
  return 'unknown'
}

export function isCapacitorAndroid(): boolean {
  return isCapacitorNative() && getCapacitorPlatform() === 'android'
}

/** Tablet Capacitor: lado corto ≥ 600px (landscape y portrait). */
export function isTabletCapacitorDevice(): boolean {
  if (typeof window === 'undefined' || !isCapacitorNative()) return false
  const minSide = Math.min(window.innerWidth, window.innerHeight)
  return minSide >= 600
}
