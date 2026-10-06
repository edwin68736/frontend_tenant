/**
 * Ejecuta `fn` cuando el navegador está ocioso (o, como mucho, pasados `maxWaitMs`), para sacar del
 * camino crítico de la primera pantalla trabajo que no la necesita (contadores, datos de cobro, etc.).
 * `minDelayMs` evita que arranque en el mismo instante en que se pintan los primeros datos.
 * Devuelve una función que cancela la ejecución pendiente (úsala en el cleanup de useEffect).
 */
export function runWhenIdle(fn: () => void, opts: { minDelayMs?: number; maxWaitMs?: number } = {}): () => void {
  const { minDelayMs = 0, maxWaitMs = 2000 } = opts
  let cancelled = false
  let idleId: number | undefined
  let timerId: ReturnType<typeof setTimeout> | undefined

  const run = () => {
    if (!cancelled) fn()
  }

  timerId = setTimeout(() => {
    timerId = undefined
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    }
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(run, { timeout: Math.max(0, maxWaitMs - minDelayMs) })
    } else {
      run()
    }
  }, minDelayMs)

  return () => {
    cancelled = true
    if (timerId !== undefined) clearTimeout(timerId)
    const w = window as Window & { cancelIdleCallback?: (id: number) => void }
    if (idleId !== undefined && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId)
  }
}
