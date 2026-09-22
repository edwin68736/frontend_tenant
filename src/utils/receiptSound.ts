/**
 * Sonido de "caja registradora" al enviar el comprobante de venta a la impresora física
 * (ticketera) — pedido del usuario. Mismo patrón que cartSounds.ts (Audio real, no sintetizado).
 */
import cashRegisterSrc from '@/assets/sound/cash-register.mp3'

let receiptAudio: HTMLAudioElement | null = null

/**
 * Llamar justo al enviar un comprobante de venta a la ticketera (ver printDocumentAuto en
 * printers.service.ts). Best-effort: nunca debe romper el flujo de impresión ni de venta si el
 * navegador bloquea el audio o no hay altavoz.
 */
export function playSaleReceiptSound(): void {
  try {
    if (!receiptAudio) {
      receiptAudio = new Audio(cashRegisterSrc)
      receiptAudio.volume = 0.6
    }
    receiptAudio.currentTime = 0
    void receiptAudio.play().catch(() => {
      /* autoplay policy o sin altavoz */
    })
  } catch {
    /* nunca debe romper la impresión */
  }
}
