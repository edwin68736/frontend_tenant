import { useEffect, useState } from 'react'
import { resolvePaymentMethodImagePath } from '@/utils/paymentMethodVisual'

type Props = {
  code: string
  name: string
  /** Logo propio del método (data URL). Si falta o no carga, se usa el icono por defecto según el código. */
  logoUrl?: string | null
  className?: string
}

export function PaymentMethodIcon({ code, name, logoUrl, className = 'h-7 w-7 object-contain' }: Props) {
  const fallback = resolvePaymentMethodImagePath(code, name)
  const [src, setSrc] = useState(logoUrl || fallback)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(logoUrl || fallback)
    setFailed(false)
  }, [logoUrl, fallback])

  if (failed) {
    return <span className="text-2xl leading-none">💳</span>
  }

  return (
    <img
      src={src}
      alt={name}
      className={className}
      onError={() => {
        // Logo propio roto → icono por defecto; si el por defecto también falla, emoji.
        if (src !== fallback) setSrc(fallback)
        else setFailed(true)
      }}
    />
  )
}
