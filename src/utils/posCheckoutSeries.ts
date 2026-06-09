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

/** Series visibles en modal de cobro POS (excluye NC, ND, guías, etc.). */
export function isElectronicBillingSunatCode(code?: string | null): boolean {
  const c = String(code ?? '').trim()
  return c === '01' || c === '03'
}

export const BILLING_NOT_ENABLED_MESSAGE =
  'La facturación electrónica no está habilitada para este tenant. Solo puede emitir notas de venta.'

export function filterPosCheckoutSeriesForModal(
  list: PosSeriesRow[],
  opts?: { sunatEnabled?: boolean; billingModule?: boolean },
): PosSeriesRow[] {
  const sunatEnabled = opts?.sunatEnabled !== false
  const billingModule = opts?.billingModule !== false
  return list.filter((s) => {
    if (s.active === false) return false
    const cat = String((s as { category?: string }).category ?? 'venta').toLowerCase()
    if (cat && cat !== 'venta') return false
    const code = resolveSeriesSunatCode(s)
    if (!billingModule || !sunatEnabled) return code === '00'
    if (code && !CHECKOUT_SUNAT.has(code)) return false
    const d = String(s.doc_type ?? '').toLowerCase()
    if (d.includes('credito') || d.includes('crédito') || d.includes('debito') || d.includes('débito')) {
      return false
    }
    if (d.includes('guia') || d.includes('guía') || d.includes('retencion') || d.includes('percepcion')) {
      return false
    }
    return true
  })
}
