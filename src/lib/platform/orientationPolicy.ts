import { ScreenOrientation } from '@capacitor/screen-orientation'
import { isCapacitorNative, isTabletCapacitorDevice } from './detect'

/**
 * Android: portrait en teléfonos; tablets pueden rotar (vertical / horizontal).
 */
export async function applyOrientationPolicy(): Promise<void> {
  if (!isCapacitorNative()) return
  try {
    if (isTabletCapacitorDevice()) {
      await ScreenOrientation.unlock()
    } else {
      await ScreenOrientation.lock({ orientation: 'portrait' })
    }
  } catch (e) {
    console.warn('[Tukifac] Orientación', e)
  }
}

export function startOrientationPolicyWatcher(): () => void {
  if (!isCapacitorNative() || typeof window === 'undefined') return () => {}
  const onChange = () => {
    void applyOrientationPolicy()
  }
  window.addEventListener('orientationchange', onChange)
  void applyOrientationPolicy()
  return () => window.removeEventListener('orientationchange', onChange)
}
