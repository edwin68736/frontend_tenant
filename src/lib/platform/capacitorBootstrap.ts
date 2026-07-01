import { App } from '@capacitor/app'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isCapacitorAndroid, isCapacitorNative } from './detect'
import { applyOrientationPolicy, startOrientationPolicyWatcher } from './orientationPolicy'

let bootstrapped = false
let stopOrientationWatcher: (() => void) | null = null

function setPlatformHtmlClass(): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.remove('platform-web', 'platform-tauri', 'platform-capacitor', 'platform-android')
  if (!isCapacitorNative()) {
    html.classList.add('platform-web')
    return
  }
  html.classList.add('platform-capacitor')
  if (isCapacitorAndroid()) html.classList.add('platform-android')
}

export async function bootstrapCapacitor(): Promise<void> {
  if (!isCapacitorNative() || bootstrapped) return
  bootstrapped = true
  setPlatformHtmlClass()
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Light })
    if (isCapacitorAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#16a34a' })
    }
  } catch (e) {
    console.warn('[Tukifac] StatusBar', e)
  }
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body })
  } catch (e) {
    console.warn('[Tukifac] Keyboard', e)
  }
  stopOrientationWatcher = startOrientationPolicyWatcher()
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void applyOrientationPolicy()
  }).catch(() => {})
}

export function teardownCapacitor(): void {
  stopOrientationWatcher?.()
  stopOrientationWatcher = null
}
