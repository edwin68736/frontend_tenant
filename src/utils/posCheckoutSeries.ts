/** Series de venta utilizables en checkout POS (SUNAT 00, 03, 01). */
const CHECKOUT_SUNAT = new Set(['00', '01', '03'])

export type PosSeriesRow = {
  id: number
  series: string
  doc_type: string
  sunat_code?: string
  active?: boolean
}

function docTypeToSunatCode(docType: string): string {
  const u = (docType || '').toUpperCase()
  if (u.includes('NOTA') && u.includes('VENTA')) return '00'
  if (u === 'BOLETA') return '03'
  if (u === 'FACTURA') return '01'
  return ''
}

export function resolveSeriesSunatCode(s: PosSeriesRow): string {
  return (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)
}

/** Filtra series según facturación electrónica habilitada. */
export function filterPosCheckoutSeries(
  list: PosSeriesRow[],
  sunatEnabled: boolean,
  billingModule: boolean,
): PosSeriesRow[] {
  return list.filter((s) => {
    if (s.active === false) return false
    const code = resolveSeriesSunatCode(s)
    if (!billingModule || !sunatEnabled) return code === '00'
    return CHECKOUT_SUNAT.has(code)
  })
}

export function hasPosCheckoutSeries(
  list: PosSeriesRow[],
  sunatEnabled: boolean,
  billingModule: boolean,
): boolean {
  return filterPosCheckoutSeries(list, sunatEnabled, billingModule).length > 0
}
