import api from './api'
import type { SaleBillingStatus } from '@/constants/billingStatus'
import type { LinkedFiscalDocSummary } from '@/services/billing.service'

export type { SaleBillingStatus }

export interface Sale {
  id: number
  doc_type: string
  series: string
  number: string
  issue_date: string
  contact_id: number | null
  contact_name?: string
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  operation_type_code?: string
  exchange_rate?: number | null
  payment_method?: string
  status: string
  billing_status: SaleBillingStatus
  branch_id: number
  created_at: string
  /** Si es NOTA_CREDITO: ID de la venta que se anuló */
  original_sale_id?: number | null
  /** Si esta NV ya generó factura/boleta electrónica (backend). */
  electronic_issue_sale_id?: number | null
  electronic_issue_doc_type?: string | null
  electronic_issue_series?: string | null
  electronic_issue_number?: string | null
  /** registrado | convertida | anulada */
  nv_status?: string | null
  display_sale_id?: number | null
  display_doc_type?: string | null
  display_series?: string | null
  display_number?: string | null
  /** Factura 1001: datos de detracción en listados/reportes. */
  has_detraccion?: boolean
  detraccion_amount?: number
  net_payable?: number
  detraccion_rate_percent?: number
  linked_perception?: LinkedFiscalDocSummary | null
}

export interface SaleItem {
  product_id: number
  code: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  igv_affectation_type: string
  price_includes_igv: boolean
  subtotal: number
  tax_amount: number
  total: number
}

export interface SalePayment {
  id: number
  method: string
  amount: number
  reference: string
}

export interface SaleDetraccionDetail {
  good_code: string
  payment_method_code: string
  bank_account: string
  rate_percent: number
  base_amount_pen: number
  detraction_amount_pen: number
  invoice_total_pen: number
  net_payable_pen: number
}

export interface SaleDetail {
  sale: Sale
  items: SaleItem[]
  payments?: SalePayment[]
  detraccion?: SaleDetraccionDetail
  contact?: {
    id: number
    doc_type: string
    doc_number: string
    business_name?: string
    trade_name?: string
    phone?: string
    address?: string
    ubigeo?: string
  }
  print_data?: import('@/types/printData').PrintData
  fiscal_context?: SaleFiscalContextResponse
  invoice?: {
    xml_url: string
    pdf_url: string
    cdr_url: string
    sunat_response?: string
    sunat_message?: string
    sunat_status: string
    sunat_cdr_code?: string
    sunat_cdr_notes?: string
    sunat_hash?: string
  }
  linked_perception?: import('@/components/billing/LinkedFiscalDocPanel').LinkedFiscalDoc | null
}

export interface PaymentInput {
  method: string
  amount: number
}

export interface SaleFiscalReferenceInput {
  reference_kind: string
  referenced_sunat_type?: string
  referenced_full_number?: string
  referenced_series?: string
  referenced_number?: string
  sort_order?: number
}

export interface SaleFiscalContextInput {
  has_igv_retention?: boolean
  igv_retention_manual_override?: boolean
  show_terms_conditions?: boolean
  fiscal_observations?: string
  purchase_order_number?: string
  seller_user_id?: number | null
  references?: SaleFiscalReferenceInput[]
}

export interface SaleFiscalSummary {
  sale_total: number
  retention_amount: number
  net_collectible: number
  retention_applied: boolean
}

export interface SaleFiscalContextResponse {
  profile: {
    sale_id: number
    has_igv_retention: boolean
    igv_retention_manual_override: boolean
    show_terms_conditions: boolean
    fiscal_observations: string
    purchase_order_number: string
    seller_user_id?: number | null
  }
  references?: SaleFiscalReferenceInput[]
  obligations?: Array<{
    obligation_kind: string
    obligation_amount: number
    applicability_status: string
    applicability_reason: string
  }>
  summary: SaleFiscalSummary
}

export interface CreateSaleInput {
  branch_id: number
  contact_id?: number | null
  doc_type: string
  series_id: number
  currency: string
  operation_type_code?: string
  exchange_rate?: number | null
  cash_session_id?: number | null
  issue_date?: string
  due_date?: string
  payment_method?: string
  payments?: PaymentInput[]
  notes?: string
  /** Al registrar venta desde cotización (opción B). */
  from_quotation_id?: number
  fiscal_context?: SaleFiscalContextInput
  detraccion?: { good_code: string; payment_method_code?: string }
  global_discount_mode?: 'percent' | 'amount'
  global_discount_value?: number
  items: {
    product_id?: number | null
    code: string
    description: string
    unit: string
    quantity: number
    unit_price: number
    discount?: number
    line_discount_mode?: 'percent' | 'amount'
    line_discount_value?: number
    igv_affectation_type: string
    price_includes_igv: boolean
    modifiers_json?: string
    serials?: string[]
  }[]
}

export interface AddPaymentsInput {
  payments: {
    method: string
    amount: number
    reference?: string
  }[]
}

export interface SalesByProductRow {
  product_id: number
  product_code: string
  product_name: string
  category_id?: number | null
  category_name: string
  unit: string
  quantity_sold: number
  total_amount: number
  lines_count: number
  sales_count: number
  avg_line_amount: number
}

export interface SalesByProductSummary {
  total_amount: number
  total_quantity: number
  line_items: number
  distinct_sales: number
  products_count: number
}

/** Totales globales del listado con los mismos filtros (no solo la página actual). */
export interface SaleListSummary {
  sum_total: number
  sum_subtotal: number
  sum_tax: number
  sum_cancelled: number
  sum_active: number
  count_cancelled: number
  count_active: number
  sum_detraccion?: number
  sum_net_payable?: number
  count_detraccion?: number
  spot_total?: number
  payment_totals: Array<{ method: string; total: number }>
}

const emptySaleSummary = (): SaleListSummary => ({
  sum_total: 0,
  sum_subtotal: 0,
  sum_tax: 0,
  sum_cancelled: 0,
  sum_active: 0,
  count_cancelled: 0,
  count_active: 0,
  sum_detraccion: 0,
  sum_net_payable: 0,
  count_detraccion: 0,
  spot_total: 0,
  payment_totals: [],
})

export const salesService = {
  list: (params?: {
    q?: string
    from?: string
    to?: string
    doc_type?: string
    status?: string
    billing_status?: string
    payment_method?: string
    payment_mode?: string
    sunat_code?: string
    contact_id?: number
    branch_id?: number
    page?: number
    per_page?: number
    /** all | active | cancelled — alineado con reporte de ventas */
    sale_status?: string
    /** '1' = devolver todas las filas que cumplan filtros (sin paginar); usar en exportaciones */
    export_all?: string
  }) => {
    const p = params ?? {}
    return api.get<{ data: Sale[]; total?: number; summary?: SaleListSummary }>('/api/sales', { params: p }).then(r => {
      const data = r.data.data ?? []
      const total = r.data.total ?? 0
      const raw = r.data.summary
      const summary: SaleListSummary = raw
        ? {
            ...emptySaleSummary(),
            ...raw,
            payment_totals: raw.payment_totals ?? [],
          }
        : emptySaleSummary()
      return { data, total, summary }
    })
  },

  /** Reporte: ventas agregadas por producto (from, to, branch_id, category_id) + resumen. */
  listByProduct: (params?: { from?: string; to?: string; branch_id?: number; category_id?: number }) =>
    api
      .get<{
        data: SalesByProductRow[]
        summary: SalesByProductSummary
      }>('/api/sales/by-product', { params: params ?? {} })
      .then(r => ({
        data: r.data.data ?? [],
        summary: r.data.summary ?? {
          total_amount: 0,
          total_quantity: 0,
          line_items: 0,
          distinct_sales: 0,
          products_count: 0,
        },
      })),

  get: (id: number): Promise<SaleDetail> =>
    api.get(`/api/sales/${id}`).then((r) => r.data as SaleDetail),

  issueElectronicFromNota: (saleId: number, body: { series_id: number; issue_date?: string; contact_id?: number }) =>
    api.post<{ sale: Sale }>(`/api/sales/${saleId}/issue-electronic`, body).then((r) => r.data),

  create: (data: CreateSaleInput): Promise<{ id: number; doc_type: string; series: string; number: string; total: number; billing_status: string; print_data?: import('@/types/printData').PrintData }> =>
    api.post('/api/sales', data).then(r => {
      const d = r.data as {
        sale?: { id: number; series: string; number: string; total: number; doc_type: string; billing_status: string }
        print_data?: import('@/types/printData').PrintData
        data?: { id: number }
        id?: number
      }
      const sale = (d.sale ?? d.data ?? d) as { id: number; doc_type: string; series: string; number: string; total: number; billing_status: string }
      return { ...sale, print_data: d.print_data }
    }),

  listPayments: (id: number): Promise<SalePayment[]> =>
    api.get(`/api/sales/${id}/payments`).then(r => r.data.data ?? r.data ?? []),

  addPayments: (id: number, data: AddPaymentsInput): Promise<{ success?: boolean; print_data?: import('@/types/printData').PrintData }> =>
    api.post(`/api/sales/${id}/payments`, data).then(r => r.data as { success?: boolean; print_data?: import('@/types/printData').PrintData }),
}
