import { formatSaleDocumentNumber } from '@/utils/format'
import { tasaForRegimen, SUNAT_REGIMEN_RETENCION, SUNAT_REGIMEN_PERCEPCION } from '@/constants/sunatRetentionPerception'
import type { PurchaseDetail } from '@/services/purchases.service'
import type { SaleDetail } from '@/services/sales.service'
import { toISOStringPeru } from '@/utils/datesPeru'

export interface FiscalRetentionPerceptionPrefill {
  locked?: boolean
  source_purchase_id?: number
  source_sale_id?: number
  source_doc_label?: string
  branch_id?: number
  contact_id?: number
  regimen?: string
  fecha_emision?: string
  details?: Array<{
    tipo_doc: string
    num_doc: string
    fecha_emision: string
    imp_total: number
    moneda: string
    pagos: Array<{ moneda: string; importe: number; fecha: string }>
    fecha_obligacion: string
    imp_obligacion: number
    imp_neto: number
  }>
}

function normalizePurchaseDocType(docType: string): string {
  const t = (docType || '').trim().toUpperCase()
  if (/^\d{2}$/.test(t)) return t
  if (t.includes('FACTURA')) return '01'
  if (t.includes('BOLETA')) return '03'
  if (t.includes('CREDITO') || t.includes('CRÉDITO') || t === 'NC') return '07'
  if (t.includes('DEBITO') || t.includes('DÉBITO') || t === 'ND') return '08'
  if (t.includes('TICKET')) return '12'
  return '01'
}

function resolveSaleSunatDocType(detail: SaleDetail): string {
  const docUpper = (detail.sale.doc_type || '').trim().toUpperCase()
  if (/^\d{2}$/.test(docUpper)) return docUpper
  if (docUpper.includes('FACTURA') || docUpper === '01') return '01'
  if (docUpper.includes('BOLETA') || docUpper === '03') return '03'
  return '01'
}

function calcDetailAmounts(importe: number, regimen: string, mode: 'retention' | 'perception') {
  const catalog = mode === 'retention' ? SUNAT_REGIMEN_RETENCION : SUNAT_REGIMEN_PERCEPCION
  const tasa = tasaForRegimen(regimen, catalog)
  const obligation = Math.round(importe * (tasa / 100) * 100) / 100
  const net = Math.round((importe - obligation) * 100) / 100
  return { obligation, net, tasa }
}

export function buildRetentionPrefillFromPurchase(detail: PurchaseDetail): FiscalRetentionPerceptionPrefill {
  const p = detail.purchase
  const regimen = '01'
  const fecha = toISOStringPeru()
  const fechaOnly = fecha.slice(0, 10)
  const moneda = (p.currency || 'PEN').trim() || 'PEN'
  const importe = Number(p.total) || 0
  const { obligation, net } = calcDetailAmounts(importe, regimen, 'retention')
  const numDoc = formatSaleDocumentNumber(p.series, p.number)
  const issueDate = p.issue_date?.includes('T') ? p.issue_date : `${p.issue_date}T00:00:00-05:00`
  const payDate = p.issue_date?.slice(0, 10) || fechaOnly

  return {
    locked: true,
    source_purchase_id: p.id,
    source_doc_label: numDoc,
    branch_id: p.branch_id,
    contact_id: p.contact_id,
    regimen,
    fecha_emision: fecha,
    details: [{
      tipo_doc: normalizePurchaseDocType(p.doc_type),
      num_doc: numDoc,
      fecha_emision: issueDate,
      imp_total: importe,
      moneda,
      pagos: [{ moneda, importe, fecha: payDate }],
      fecha_obligacion: fecha,
      imp_obligacion: obligation,
      imp_neto: net,
    }],
  }
}

export function buildPerceptionPrefillFromSale(detail: SaleDetail): FiscalRetentionPerceptionPrefill {
  const s = detail.sale
  const regimen = '01'
  const fecha = toISOStringPeru()
  const fechaOnly = fecha.slice(0, 10)
  const moneda = (s.currency || 'PEN').trim() || 'PEN'
  const importe = Number(s.total) || 0
  const { obligation, net } = calcDetailAmounts(importe, regimen, 'perception')
  const numDoc = formatSaleDocumentNumber(s.series, s.number)
  const issueDate = s.issue_date?.includes('T') ? s.issue_date : `${s.issue_date}T00:00:00-05:00`
  const cobroDate = s.issue_date?.slice(0, 10) || fechaOnly

  return {
    locked: true,
    source_sale_id: s.id,
    source_doc_label: numDoc,
    branch_id: s.branch_id,
    contact_id: detail.contact?.id ?? s.contact_id ?? undefined,
    regimen,
    fecha_emision: fecha,
    details: [{
      tipo_doc: resolveSaleSunatDocType(detail),
      num_doc: numDoc,
      fecha_emision: issueDate,
      imp_total: importe,
      moneda,
      pagos: [{ moneda, importe, fecha: cobroDate }],
      fecha_obligacion: fecha,
      imp_obligacion: obligation,
      imp_neto: net,
    }],
  }
}
