import type { SupportConfig } from '@/services/subscription.service'
import { isTauriDesktop } from '@/lib/platform/detect'

const PERU_COUNTRY_CODE = '51'

export function normalizePeruWhatsAppNumber(phone: string | undefined | null): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00')) digits = digits.slice(2)

  if (digits.startsWith(PERU_COUNTRY_CODE) && digits.length >= 11) return digits
  if (digits.startsWith('0')) return PERU_COUNTRY_CODE + digits.slice(1)
  if (digits.length === 9) return PERU_COUNTRY_CODE + digits
  if (digits.length === 11 && digits.startsWith(PERU_COUNTRY_CODE)) return digits

  return digits.length >= 10 ? digits : null
}

export function buildSupportWhatsAppHref(
  support?: Pick<SupportConfig, 'whatsapp'> | null,
  message?: string,
): string | null {
  const wa = normalizePeruWhatsAppNumber(support?.whatsapp)
  if (!wa) return null
  const base = `https://wa.me/${wa}`
  const text = (message ?? '').trim()
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

export const DEFAULT_SUPPORT_WHATSAPP_MESSAGE =
  'Hola, necesito ayuda con mi panel Tukifac.'

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return

  if (isTauriDesktop()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
      return
    } catch {
      // Fallback si el plugin no está disponible.
    }
  }

  // Sin fallback a la pestaña actual: `window.open` devolviendo null/undefined no significa de
  // forma confiable que el popup se bloqueó (varía por navegador) — usarlo como señal para
  // redirigir la pestaña actual causaba que, cuando SÍ se abría la pestaña nueva, la actual
  // igual terminara navegando a la misma URL. Si el navegador bloquea el popup, que muestre su
  // propio aviso; no vale la pena arriesgar sacar al tenant de la app por eso.
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function openSupportWhatsApp(
  support?: Pick<SupportConfig, 'whatsapp'> | null,
  message?: string,
): Promise<void> {
  const href = buildSupportWhatsAppHref(support, message)
  if (href) await openExternalUrl(href)
}
