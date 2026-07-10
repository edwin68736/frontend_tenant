import { Toaster } from 'sonner'

/** Sonner usa position:fixed en el viewport; no hereda el padding safe del body en Capacitor. */
const TOAST_SAFE_OFFSET = {
  top: 'max(0.75rem, var(--safe-top))',
  right: 'max(0.75rem, var(--safe-right))',
  bottom: 'max(0.75rem, var(--safe-bottom))',
  left: 'max(0.75rem, var(--safe-left))',
} as const

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      offset={TOAST_SAFE_OFFSET}
      mobileOffset={TOAST_SAFE_OFFSET}
    />
  )
}
