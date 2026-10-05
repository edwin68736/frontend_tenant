/**
 * Sonido de "caja registradora" al enviar el comprobante de venta a la impresora física
 * (ticketera) — pedido del usuario. Se dispara automáticamente tras la venta (sin clic directo
 * del usuario, ver el useEffect de auto-impresión en ReceiptPrintModal.tsx), así que un
 * `<audio>` normal (HTMLAudioElement.play()) puede quedar bloqueado por la política de autoplay
 * de algunos WebView (Tauri/WebView2, Android/Capacitor) al no venir de un gesto del usuario.
 * Por eso se reproduce con Web Audio API (AudioContext + resume(), que sí logra "desbloquearse"
 * en esos WebView) decodificando el mp3 real en vez de usar <audio> — mismo mecanismo
 * cross-platform de antes, pero con el sonido real en vez de tonos sintetizados.
 */
import cashRegisterUrl from '@/assets/sound/cash-register.mp3'

let audioCtx: AudioContext | null = null
let bufferPromise: Promise<AudioBuffer | null> | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
    return audioCtx
  } catch {
    return null
  }
}

async function loadBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(cashRegisterUrl)
    const data = await res.arrayBuffer()
    return await ctx.decodeAudioData(data)
  } catch {
    return null
  }
}

/**
 * Llamar ANTES de enviar un comprobante de venta a la ticketera (ver printDocumentAuto en
 * printers.service.ts). Devuelve una promesa que se resuelve cuando termina el sonido (con un tope),
 * para que quien imprime la espere: si el sonido sonara a la vez que la ticketera (su pitido y el
 * corte del papel), se taparían entre sí. Best-effort: nunca rechaza ni debe romper el flujo de
 * impresión si el WebView bloquea el audio o no hay altavoz (en ese caso resuelve al instante).
 */
export function playSaleReceiptSound(maxWaitMs = 2500): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return resolve()
      if (!bufferPromise) bufferPromise = loadBuffer(ctx)
      const safety = window.setTimeout(resolve, maxWaitMs)
      void bufferPromise
        .then((buffer) => {
          if (!buffer) {
            window.clearTimeout(safety)
            return resolve()
          }
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)
          source.onended = () => {
            window.clearTimeout(safety)
            resolve()
          }
          source.start()
        })
        .catch(() => {
          window.clearTimeout(safety)
          resolve()
        })
    } catch {
      /* nunca debe romper la impresión */
      resolve()
    }
  })
}
