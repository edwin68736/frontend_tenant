/** Variantes del código leído (cámara móvil EAN-13 vs UPC-A 12, caracteres de control). */
export function barcodeLookupCandidates(raw: string): string[] {
  let base = raw.trim().replace(/[\x00-\x1f\x7f]/g, '')
  if (!base) return []

  const seen = new Set<string>()
  const add = (s: string) => {
    const t = s.trim()
    if (t) seen.add(t)
  }

  add(base)
  const digits = base.replace(/\D/g, '')
  if (digits) {
    add(digits)
    if (digits.length === 12) add(`0${digits}`)
    if (digits.length === 13 && digits[0] === '0') add(digits.slice(1))
  }

  return [...seen]
}

export function productMatchesBarcode(storedCode: string, scanned: string): boolean {
  const stored = storedCode.trim()
  if (!stored) return false
  const norm = (s: string) => s.trim().toLowerCase()
  const storedNorm = norm(stored)
  return barcodeLookupCandidates(scanned).some(c => norm(c) === storedNorm)
}

export function findProductByBarcodeInList<T extends { code: string }>(
  products: T[],
  scanned: string,
): T | undefined {
  return products.find(p => productMatchesBarcode(p.code, scanned))
}
