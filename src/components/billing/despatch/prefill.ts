import { toTipoDocIdentidadCode } from '@/constants/sunat'
import type { SaleDetail } from '@/services/sales.service'
import { formatSaleDocumentNumber } from '@/utils/format'
import { newKey, type LineItem, type PartyData } from './despatchModel'

/** Datos de un comprobante (factura, boleta o nota de venta) para iniciar una guía de venta. */
export interface DespatchPrefill {
  branchId: number
  sourceSaleId: number
  sourceLabel: string
  party: PartyData
  items: LineItem[]
}

export function buildDespatchPrefillFromSaleDetail(detail: SaleDetail): DespatchPrefill {
  const client = detail.print_data?.client ?? undefined
  const contact = detail.contact
  const tipo = contact?.doc_type ? toTipoDocIdentidadCode(contact.doc_type) : '6'
  return {
    branchId: detail.sale.branch_id,
    sourceSaleId: detail.sale.id,
    sourceLabel: formatSaleDocumentNumber(detail.sale.series, detail.sale.number),
    party: {
      tipo_doc: tipo,
      num_doc: contact?.doc_number ?? client?.doc_number ?? '',
      rzn_social: contact?.business_name ?? client?.business_name ?? '',
      address: contact?.address ?? client?.address ?? '',
      ubigeo: contact?.ubigeo ?? '',
    },
    items: detail.items.map((it) => ({
      key: newKey(),
      product_id: null,
      codigo: it.code,
      descripcion: it.description,
      unidad: it.unit || 'NIU',
      cantidad: it.quantity,
    })),
  }
}
