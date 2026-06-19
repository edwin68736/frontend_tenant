import api from './api'

export interface Quotation {
  id: number
  branch_id: number
  contact_id: number | null
  contact_name?: string
  user_id: number
  series_id: number
  series: string
  correlative: number
  number: string
  issue_date: string
  valid_until?: string | null
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  exchange_rate?: number | null
  notes: string
  status: 'draft' | 'converted' | string
  converted_sale_id?: number | null
  converted_at?: string | null
  converted_target?: string | null
  created_at: string
}

export interface QuotationItem {
  id?: number
  product_id?: number | null
  code: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  discount: number
  igv_affectation_type: string
  price_includes_igv: boolean
  subtotal: number
  tax_amount: number
  total: number
  modifiers_json?: string
}

export interface QuotationDetail {
  quotation: Quotation
  items: QuotationItem[]
  print_data?: import('@/types/printData').PrintData
}

export interface QuotationItemInput {
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
}

export interface CreateQuotationInput {
  branch_id: number
  contact_id?: number | null
  series_id: number
  issue_date?: string
  valid_until?: string
  currency?: string
  exchange_rate?: number | null
  notes?: string
  items: QuotationItemInput[]
}

export type QuotationConvertTarget = 'nota_venta' | '01' | '03'

export const quotationsService = {
  list: (params?: {
    branch_id?: number
    q?: string
    status?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
  }) =>
    api.get<{ data: Quotation[]; total: number }>('/api/quotations', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<QuotationDetail>(`/api/quotations/${id}`).then((r) => r.data),

  create: (body: CreateQuotationInput) =>
    api.post<{ quotation: Quotation }>('/api/quotations', body).then((r) => r.data),

  update: (id: number, body: CreateQuotationInput) =>
    api.patch<{ quotation: Quotation }>(`/api/quotations/${id}`, body).then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ success: boolean }>(`/api/quotations/${id}`).then((r) => r.data),

  convert: (
    id: number,
    body: { target: QuotationConvertTarget; series_id: number; issue_date?: string; contact_id?: number },
  ) =>
    api
      .post<{ sale: import('./sales.service').Sale; print_data?: import('@/types/printData').PrintData }>(
        `/api/quotations/${id}/convert`,
        body,
      )
      .then((r) => r.data),

  sendReceiptEmail: (quotationId: number, email: string, pdfBase64: string, format: 'a4' | 'ticket' = 'a4') =>
    api
      .post<{ success: boolean }>(`/api/quotations/${quotationId}/email-receipt`, {
        email,
        pdf_base64: pdfBase64,
        format,
      })
      .then((r) => r.data),
}
