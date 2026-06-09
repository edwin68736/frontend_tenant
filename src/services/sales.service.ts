import api from './api'
import type { SaleBillingStatus } from '@/constants/billingStatus'

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
  payment_method?: string
  status: string
  billing_status: SaleBillingStatus
  branch_id: number
  created_at: string
  /** Si es NOTA_CREDITO: ID de la venta que se anuló */
  original_sale_id?: number | null
  /** Si esta NV ya generó factura/boleta electrónica (backend). */
  electronic_issue_sale_id?: number | null
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

export interface SaleDetail {
  sale: Sale
  items: SaleItem[]
  payments?: SalePayment[]
  contact?: {
    id: number
    doc_type: string
    doc_number: string
    business_name?: string
    trade_name?: string
    phone?: string
  }
  print_data?: import('@/types/printData').PrintData
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
}

export interface PaymentInput {
  method: string
  amount: number
}

export interface CreateSaleInput {
  branch_id: number
  contact_id?: number | null
  doc_type: string
  series_id: number
  currency: string
  cash_session_id?: number | null
  issue_date?: string
  due_date?: string
  payment_method?: string
  payments?: PaymentInput[]
  notes?: string
  items: {
    product_id?: number | null
    code: string
    description: string
    unit: string
    quantity: number
    unit_price: number
    discount?: number
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
