import { useState } from 'react'
import { resolvePaymentMethodImagePath } from '@/utils/paymentMethodVisual'

type Props = {
  code: string
  name: string
  className?: string
}

export function PaymentMethodIcon({ code, name, className = 'h-7 w-7 object-contain' }: Props) {
  const [failed, setFailed] = useState(false)
  const src = resolvePaymentMethodImagePath(code, name)

  if (failed) {
    return <span className="text-2xl leading-none">💳</span>
  }

  return (
    <img
      src={src}
      alt={name}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
