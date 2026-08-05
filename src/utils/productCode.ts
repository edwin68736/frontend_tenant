/** Mismo alfabeto que el formulario de productos: A–Z y 0–9. */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Código de producto alfanumérico (ej. «UKVE8N»).
 *
 * Es el mismo formato que genera el formulario de productos, para que todo el catálogo —
 * productos, servicios y combos — comparta un solo patrón. No se usan códigos correlativos:
 * un número de secuencia sugiere un orden que no existe y choca con los códigos propios del
 * negocio.
 */
export function generateLocalProductCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return out
}
