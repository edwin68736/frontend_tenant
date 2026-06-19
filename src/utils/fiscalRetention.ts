/** Umbrales y reglas alineadas con backend (salecontext). */
export const IGV_RETENTION_RATE = 0.03
export const IGV_RETENTION_THRESHOLD = 700

export type FiscalGuiaKind = 'guia_remitente' | 'guia_transportista'

export type FiscalGuiaRow = {
  id: string
  reference_kind: FiscalGuiaKind
  document_number: string
}

export type RetentionContact = {
  doc_type?: string
  doc_number?: string
  es_agente_de_retencion?: boolean
  es_agente_de_percepcion?: boolean
}

export function autoSuggestIgvRetention(
  sunatCode: string,
  contact: RetentionContact | null | undefined,
  _saleTotal = 0,
  _currency = 'PEN',
  _exchangeRate?: number | null,
): boolean {
  if (sunatCode !== '01') return false
  if (!contact) return false
  if (contact.es_agente_de_percepcion) return false
  const docType = normalizeDocType(contact.doc_type, contact.doc_number)
  if (docType !== '6') return false
  return !!contact.es_agente_de_retencion
}

function normalizeDocType(docType?: string, docNumber?: string): string {
  const dt = (docType ?? '').trim().toUpperCase()
  if (dt === '6' || dt === 'RUC') return '6'
  if (dt === '1' || dt === 'DNI') return '1'
  const num = (docNumber ?? '').trim()
  if (num.length === 11) return '6'
  if (num.length === 8) return '1'
  return dt
}

export type RetentionPreview = {
  applicable: boolean
  reason: string
  retentionAmount: number
  netCollectible: number
}

export function previewIgvRetention(
  hasRetention: boolean,
  sunatCode: string,
  contact: RetentionContact | null | undefined,
  saleTotal: number,
  manualOverride: boolean,
  currency = 'PEN',
  exchangeRate?: number | null,
): RetentionPreview {
  const total = round2(saleTotal)
  const totalPEN = totalInPEN(total, currency, exchangeRate)
  const base: RetentionPreview = {
    applicable: false,
    reason: 'Retención IGV desactivada',
    retentionAmount: 0,
    netCollectible: total,
  }
  if (!hasRetention) return base

  if (sunatCode !== '01') {
    return { ...base, reason: 'La retención IGV aplica principalmente a facturas (01)' }
  }
  if (totalPEN <= IGV_RETENTION_THRESHOLD) {
    const reason =
      currency === 'USD' && (!exchangeRate || exchangeRate <= 0)
        ? `El importe en USD (US$ ${total.toFixed(2)}) requiere tipo de cambio para evaluar el umbral de S/ ${IGV_RETENTION_THRESHOLD.toFixed(2)}`
        : `El importe total equivalente (S/ ${totalPEN.toFixed(2)}) no supera S/ ${IGV_RETENTION_THRESHOLD.toFixed(2)}`
    return { ...base, reason }
  }
  if (!contact) {
    return { ...base, reason: 'Se requiere un cliente para evaluar retención' }
  }
  if (contact.es_agente_de_percepcion) {
    return { ...base, reason: 'Operación excluida: cliente agente de percepción' }
  }
  const docType = normalizeDocType(contact.doc_type, contact.doc_number)
  if (docType !== '6') {
    return { ...base, reason: 'La retención IGV requiere cliente con RUC' }
  }
  if (!contact.es_agente_de_retencion && !manualOverride) {
    return { ...base, reason: 'El cliente no está registrado como agente de retención' }
  }

  const retentionAmount = round2(total * IGV_RETENTION_RATE)
  return {
    applicable: true,
    reason: 'Retención IGV del 3% sobre el importe total de la operación',
    retentionAmount,
    netCollectible: round2(total - retentionAmount),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function totalInPEN(total: number, currency: string, exchangeRate?: number | null): number {
  if (currency !== 'USD') return total
  const rate = exchangeRate ?? 0
  if (rate <= 0) return total
  return round2(total * rate)
}

/** Valida retención IGV al guardar (incluye umbral S/ 700). */
export function validateIgvRetentionAtSave(
  hasRetention: boolean,
  sunatCode: string,
  contact: RetentionContact | null | undefined,
  saleTotal: number,
  manualOverride: boolean,
  currency = 'PEN',
  exchangeRate?: number | null,
): string | null {
  if (!hasRetention || sunatCode !== '01') return null
  const preview = previewIgvRetention(
    true,
    sunatCode,
    contact,
    saleTotal,
    manualOverride,
    currency,
    exchangeRate,
  )
  if (!preview.applicable) return preview.reason
  return null
}

export function buildFiscalReferences(state: { guias?: FiscalGuiaRow[] }) {
  const refs: Array<{
    reference_kind: string
    referenced_sunat_type: string
    referenced_full_number: string
    sort_order: number
  }> = []
  const sunatByKind: Record<FiscalGuiaKind, string> = {
    guia_remitente: '09',
    guia_transportista: '31',
  }
  for (const row of state.guias ?? []) {
    const num = row.document_number.trim()
    if (!num) continue
    refs.push({
      reference_kind: row.reference_kind,
      referenced_sunat_type: sunatByKind[row.reference_kind],
      referenced_full_number: num,
      sort_order: refs.length,
    })
  }
  return refs
}

/** Indica si hay datos fiscales que enviar al API (evita payload vacío en comprobantes simples). */
export function hasFiscalContextContent(state: {
  has_igv_retention: boolean
  igv_retention_manual_override: boolean
  show_terms_conditions: boolean
  fiscal_observations: string
  purchase_order_number: string
  seller_user_id: number | null
  guias: FiscalGuiaRow[]
}): boolean {
  if (state.has_igv_retention || state.igv_retention_manual_override) return true
  if (state.show_terms_conditions) return true
  if (state.fiscal_observations.trim()) return true
  if (state.purchase_order_number.trim()) return true
  if (state.seller_user_id != null && state.seller_user_id > 0) return true
  if ((state.guias ?? []).some((g) => g.document_number.trim())) return true
  return false
}
