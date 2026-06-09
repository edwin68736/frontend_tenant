/** Rutas en public/ (mismas que Tukichef antiguo). */
export function resolvePaymentMethodImagePath(code: string, name: string): string {
  const s = `${code} ${name}`.toLowerCase()
  if (s.includes('efectivo') || s.includes('cash')) return '/img/efectivo.png'
  if (s.includes('yape')) return '/img/yape.png'
  if (s.includes('plin')) return '/img/plin.png'
  if (s.includes('tarjeta') || s.includes('card')) return '/img/tarjeta.png'
  if (s.includes('culqi') || s.includes('culqui')) return '/culqi.png'
  if (s.includes('rappi') || s.includes('rapi')) return '/rappi.png'
  if (s.includes('transfer')) return '/transferencia.png'
  return '/otros.png'
}

export function docTypeShortLabel(docType: string, sunatCode?: string): string {
  const code = String(sunatCode ?? '').trim()
  if (code === '00') return 'Nota de venta'
  if (code === '03') return 'Boleta'
  if (code === '01') return 'Factura'
  const d = docType.toLowerCase().replace(/\s+/g, '')
  if (d.includes('credito') || d.includes('crédito')) return 'N. Crédito'
  if (d.includes('debito') || d.includes('débito')) return 'N. Débito'
  if ((d.includes('nota') && d.includes('venta')) || d === 'notadeventa') return 'Nota de venta'
  if (d === 'boleta') return 'Boleta'
  if (d === 'factura') return 'Factura'
  const t = docType.trim()
  return t.length > 14 ? `${t.slice(0, 12)}…` : t
}

export function normalizeDocTypeKey(docType: string): string {
  return docType.toLowerCase().replace(/\s+/g, '')
}
