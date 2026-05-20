import { getTodayPeru } from '@/utils/datesPeru'

/** Días de calendario hasta el próximo cobro (negativo = vencido). Fechas YYYY-MM-DD (Perú). */
export function daysUntilNextPayment(nextBillingIso: string): number {
  const a = getTodayPeru()
  const b = (nextBillingIso || '').slice(0, 10)
  if (b.length < 10) return NaN
  const da = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))
  const db = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)))
  return Math.round((db - da) / 86400000)
}

export function membershipPaymentTrafficClass(days: number): string {
  if (!Number.isFinite(days)) return 'bg-gray-100 text-gray-600'
  if (days < 0) return 'bg-red-100 text-red-800'
  if (days === 0) return 'bg-red-100 text-red-800'
  if (days <= 3) return 'bg-orange-100 text-orange-900'
  if (days <= 7) return 'bg-amber-100 text-amber-900'
  return 'bg-emerald-100 text-emerald-900'
}

/** Dígitos para wa.me (Perú: 51 + 9 móviles). */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length < 9) return null
  if (d.startsWith('51') && d.length >= 11) return d
  if (d.startsWith('0')) return '51' + d.slice(1)
  if (d.length === 9) return '51' + d
  if (d.length === 11 && d.startsWith('51')) return d
  return d.length >= 10 ? d : null
}

export function buildMembershipWhatsAppUrl(
  phone: string,
  opts: { clientName: string; concept: string; amount: string; dueDate: string },
): string | null {
  const n = normalizePhoneForWhatsApp(phone)
  if (!n) return null
  const name = (opts.clientName || 'Cliente').trim()
  const concept = (opts.concept || 'su cuota').trim()
  const text = `Hola ${name}, le recordamos el próximo pago (${concept}) por ${opts.amount}, con fecha de cobro ${opts.dueDate}. Gracias.`
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}
