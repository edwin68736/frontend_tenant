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
 * Llamar justo al enviar un comprobante de venta a la ticketera (ver printDocumentAuto en
 * printers.service.ts). Best-effort: nunca debe romper el flujo de impresión ni de venta si el
 * WebView bloquea el audio o no hay altavoz.
 */
export function playSaleReceiptSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (!bufferPromise) bufferPromise = loadBuffer(ctx)
    void bufferPromise.then((buffer) => {
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start()
    })
  } catch {
    /* nunca debe romper la impresión */
  }
}
