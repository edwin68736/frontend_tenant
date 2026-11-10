/**
 * Época de sucursal para las peticiones HTTP.
 *
 * Cada petición de lectura queda atada a la época vigente y a su AbortController. Al cambiar de
 * sucursal `advanceEpoch()` aborta todo lo que seguía en vuelo; el interceptor de axios descarta
 * además cualquier respuesta/reintento cuya época ya no sea la actual.
 */

let epoch = 0
let controller = new AbortController()
let switching = false
/** Marca (ms) hasta la cual un 409 SESSION_UPDATED de una petición vieja se considera "del propio cambio". */
let graceUntil = 0
const GRACE_MS = 5000

let mutationsInFlight = 0
const idleWaiters = new Set<() => void>()

export function currentEpoch(): number {
  return epoch
}

export function currentEpochSignal(): AbortSignal {
  return controller.signal
}

/** Aborta las lecturas en vuelo de la época anterior y abre una nueva. */
export function advanceEpoch(): number {
  const old = controller
  epoch += 1
  controller = new AbortController()
  graceUntil = Date.now() + GRACE_MS
  old.abort()
  return epoch
}

export function isEpochStale(requestEpoch: number | undefined): boolean {
  return requestEpoch !== undefined && requestEpoch !== epoch
}

export function setBranchSwitching(v: boolean): void {
  switching = v
  if (v) graceUntil = Date.now() + GRACE_MS
}

export function isBranchSwitching(): boolean {
  return switching
}

/** true si un SESSION_UPDATED puede ser consecuencia de NUESTRO cambio de sucursal. */
export function isWithinSwitchGrace(): boolean {
  return switching || Date.now() < graceUntil
}

/**
 * Llamadas que NO dependen de la sucursal y nunca se abortan ni se descartan por época:
 * autenticación, contexto/cambio de sesión y la tienda pública.
 */
const GLOBAL_PREFIXES = [
  '/api/login',
  '/api/logout',
  '/api/session/',
  '/api/public/',
  '/api/subscription',
]

export function isGlobalRequestUrl(url: string | undefined): boolean {
  const u = String(url ?? '')
  const path = u.replace(/^https?:\/\/[^/]+/i, '')
  return GLOBAL_PREFIXES.some((p) => path.startsWith(p))
}

/* ---- Mutaciones en vuelo: no se abortan (el servidor ya las recibió), solo se espera a que terminen ---- */

export function trackMutationStart(): void {
  mutationsInFlight += 1
}

export function trackMutationEnd(): void {
  mutationsInFlight = Math.max(0, mutationsInFlight - 1)
  if (mutationsInFlight === 0) {
    idleWaiters.forEach((fn) => fn())
    idleWaiters.clear()
  }
}

export function mutationsPending(): number {
  return mutationsInFlight
}

/** Espera a que no haya escrituras en vuelo (máx. `timeoutMs`). Nunca rechaza. */
export function waitForMutationsIdle(timeoutMs = 8000): Promise<void> {
  if (mutationsInFlight === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t)
      idleWaiters.delete(done)
      resolve()
    }
    const t = setTimeout(done, timeoutMs)
    idleWaiters.add(done)
  })
}

/** Solo para tests. */
export function __resetEpochState(): void {
  controller.abort()
  controller = new AbortController()
  epoch = 0
  switching = false
  graceUntil = 0
  mutationsInFlight = 0
  idleWaiters.clear()
}
