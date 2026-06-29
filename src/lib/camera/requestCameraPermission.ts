import { Camera } from '@capacitor/camera'
import { isCapacitorNative } from '@/lib/platform/detect'

export type CameraPermissionResult = 'granted' | 'denied' | 'prompt'

/** Solicita permiso de cámara en Capacitor; en web/Tauri usa Permissions API o getUserMedia. */
export async function requestCameraPermission(): Promise<CameraPermissionResult> {
  if (isCapacitorNative()) {
    const current = await Camera.checkPermissions()
    if (current.camera === 'granted') return 'granted'
    const next = await Camera.requestPermissions({ permissions: ['camera'] })
    if (next.camera === 'granted') return 'granted'
    return next.camera === 'denied' ? 'denied' : 'prompt'
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'denied'
  }

  try {
    const status = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (status?.state === 'granted') return 'granted'
    if (status?.state === 'denied') return 'denied'
  } catch {
    /* Permissions API no disponible en todos los navegadores */
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    stream.getTracks().forEach(t => t.stop())
    return 'granted'
  } catch {
    return 'denied'
  }
}
