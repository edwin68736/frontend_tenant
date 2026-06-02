import { useEffect, useState, type ReactNode } from 'react'
import { bootstrapCapacitor, teardownCapacitor } from '@/lib/platform/capacitorBootstrap'
import { isCapacitorNative, isTauriDesktop } from '@/lib/platform/detect'

type Props = { children: ReactNode }

export function NativeShellProvider({ children }: Props) {
  const [ready, setReady] = useState(() => !isCapacitorNative())

  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    html.classList.remove('platform-web', 'platform-tauri', 'platform-capacitor')
    if (isCapacitorNative()) {
      void bootstrapCapacitor().finally(() => setReady(true))
    } else if (isTauriDesktop()) {
      html.classList.add('platform-tauri')
      setReady(true)
    } else {
      html.classList.add('platform-web')
      setReady(true)
    }
    return () => {
      if (isCapacitorNative()) teardownCapacitor()
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
