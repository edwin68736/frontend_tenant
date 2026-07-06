export type ProductExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok'

/** Días hasta vencimiento (negativo = vencido). */
export function daysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(`${expiryDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(exp.getTime())) return 9999
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000)
}

export function getProductExpiryStatus(expiryDate: string): ProductExpiryStatus {
  const days = daysUntilExpiry(expiryDate)
  if (days < 0) return 'expired'
  if (days <= 7) return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

export const PRODUCT_EXPIRY_BADGE_CLASS: Record<ProductExpiryStatus, string> = {
  expired: 'bg-red-100 text-red-800 ring-1 ring-red-200',
  critical: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  warning: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
  ok: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
}

export function formatExpiryDisplay(expiryDate: string): string {
  const d = expiryDate.slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

export function expiryStatusLabel(status: ProductExpiryStatus): string {
  switch (status) {
    case 'expired':
      return 'Vencido'
    case 'critical':
      return 'Vence pronto'
    case 'warning':
      return 'Por vencer'
    default:
      return 'Vigente'
  }
}
