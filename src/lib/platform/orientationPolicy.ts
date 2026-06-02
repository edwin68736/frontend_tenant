import { ScreenOrientation } from '@capacitor/screen-orientation'
import { isCapacitorNative } from './detect'

/**
 * Android: solo portrait (requisito producto). Sin landscape en tablets.
 */
export async function applyOrientationPolicy(): Promise<void> {
  if (!isCapacitorNative()) return
  try {
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch (e) {
    console.warn('[Tukifac] Orientación portrait', e)
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
