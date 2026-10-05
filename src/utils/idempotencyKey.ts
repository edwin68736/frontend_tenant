/**
 * Claves de idempotencia para el cobro.
 *
 * Problema: el POS manda el cobro, el servidor lo guarda, pero la respuesta no llega (red lenta,
 * timeout, WebView). La pantalla muestra un error y conserva el carrito; el cajero vuelve a cobrar
 * y el servidor, sin forma de distinguir el reintento, registra una segunda venta con otro
 * correlativo.
 *
 * Solución: cada intento de cobro lleva una clave (UUID). Mientras el contenido del cobro no
 * cambie, los reintentos reutilizan la MISMA clave y el servidor devuelve la venta ya creada. Si
 * el cajero cambia algo (carrito, pagos, cliente, descuento) el contenido ya no es el mismo cobro:
 * se genera una clave nueva. La clave se libera al terminar con éxito, de modo que la siguiente
 * venta —aunque sea idéntica— es una venta nueva.
 */

interface Slot {
  fingerprint: string
  key: string
}

const slots = new Map<string, Slot>()

function newKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* contexto no seguro: se usa el respaldo */
  }
  // Respaldo (HTTP en LAN, WebViews antiguos): 128 bits aleatorios con formato UUID v4.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}

/**
 * Devuelve la clave del cobro `scope` para este contenido. `payload` NO debe incluir la clave.
 * `scope` separa flujos que pueden coexistir (p. ej. 'pos-checkout' y 'bill:123').
 */
export function idempotencyKeyFor(scope: string, payload: unknown): string {
  const fingerprint = JSON.stringify(payload)
  const slot = slots.get(scope)
  if (slot && slot.fingerprint === fingerprint) return slot.key
  const key = newKey()
  slots.set(scope, { fingerprint, key })
  return key
}

/** Libera la clave de `scope`: el cobro terminó bien, el siguiente es una venta nueva. */
export function releaseIdempotencyKey(scope: string): void {
  slots.delete(scope)
}
