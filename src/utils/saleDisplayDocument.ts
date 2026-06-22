import { formatSaleDocumentNumber } from '@/utils/format'

export type SaleNvDisplayFields = {
  id: number
  doc_type: string
  series: string
  number: string
  status?: string
  electronic_issue_sale_id?: number | null
  electronic_issue_doc_type?: string | null
  electronic_issue_series?: string | null
  electronic_issue_number?: string | null
  nv_status?: string | null
  display_sale_id?: number | null
  display_doc_type?: string | null
  display_series?: string | null
  display_number?: string | null
}

export function formatElectronicIssueDocument(sale: SaleNvDisplayFields): string | null {
  if (sale.electronic_issue_series || sale.electronic_issue_number) {
    return formatSaleDocumentNumber(
      sale.electronic_issue_series ?? '',
      sale.electronic_issue_number ?? '',
    )
  }
  if (sale.electronic_issue_sale_id) {
    return `#${sale.electronic_issue_sale_id}`
  }
  return null
}

/** Documento comercial vigente (boleta/factura si NV convertida). */
export function commercialDisplayDocument(sale: SaleNvDisplayFields) {
  const docType = sale.display_doc_type || sale.doc_type
  const series = sale.display_series ?? sale.series
  const number = sale.display_number ?? sale.number
  const saleId = sale.display_sale_id ?? sale.id
  return {
    docType,
    series,
    number,
    formatted: formatSaleDocumentNumber(series, number),
    saleId,
  }
}

export type NvStatusKey = 'registrado' | 'convertida' | 'anulada'

export function nvStatusKey(sale: SaleNvDisplayFields): NvStatusKey | null {
  const s = (sale.nv_status || '').trim().toLowerCase()
  if (s === 'convertida' || s === 'anulada') return s
  if (s === 'registrado' || s === 'pendiente') return 'registrado'
  if (sale.status === 'cancelled') return 'anulada'
  if (sale.electronic_issue_sale_id) return 'convertida'
  return 'registrado'
}

export function nvStatusLabel(status: NvStatusKey | null): string {
  switch (status) {
    case 'convertida':
      return 'Convertida'
    case 'anulada':
      return 'Anulada'
    default:
      return 'Registrado'
  }
}

export function nvStatusBadgeClass(status: NvStatusKey | null): string {
  switch (status) {
    case 'convertida':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'anulada':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
}

export function nvStatusEmoji(status: NvStatusKey | null): string {
  switch (status) {
    case 'convertida':
      return '🔄'
    case 'anulada':
      return '❌'
    default:
      return '🟢'
  }
}

export function pdfTargetSaleId(sale: SaleNvDisplayFields): number {
  if (sale.nv_status === 'convertida' || sale.electronic_issue_sale_id) {
    return sale.display_sale_id ?? sale.electronic_issue_sale_id ?? sale.id
  }
  return sale.id
}
