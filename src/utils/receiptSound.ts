/**
 * Sonido tipo "caja registradora" al enviar el comprobante de venta a la impresora física
 * (ticketera) — pedido del usuario (14-sep-2026): debe sonar igual en Windows/Tauri y en
 * Android/Capacitor. Se sintetiza con Web Audio API en vez de empaquetar un archivo de audio:
 * no depende de licencias de terceros y funciona igual en cualquier WebView (Tauri WebView2,
 * Capacitor Android) sin necesitar un plugin nativo — ver playSaleReceiptSound() más abajo.
 */
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Una campanada corta tipo timbre metálico: dos osciladores triangulares levemente desafinados
 * (6 cents) dan el timbre de "campana" en vez de sonar a tono puro de sintetizador, con una
 * envolvente de ataque rápido y caída exponencial típica de un golpe/campanilla.
 */
function playBellNote(ctx: AudioContext, freq: number, startAt: number, duration: number, gainPeak: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  gain.connect(ctx.destination)

  for (const detune of [0, 6]) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, startAt)
    osc.detune.setValueAtTime(detune, startAt)
    osc.connect(gain)
    osc.start(startAt)
    osc.stop(startAt + duration + 0.05)
  }
}

/**
 * Dos campanadas ascendentes cortas ("cha-ching") — llamar justo al enviar un comprobante de
 * venta a la ticketera (ver printDocumentAuto en printers.service.ts). Best-effort: nunca debe
 * romper el flujo de impresión ni de venta si el navegador bloquea el audio o no hay altavoz.
 */
export function playSaleReceiptSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    playBellNote(ctx, 1046.5, now, 0.16, 0.22) // C6
    playBellNote(ctx, 1568.0, now + 0.1, 0.28, 0.22) // G6
  } catch {
    /* nunca debe romper la impresión */
  }
}
