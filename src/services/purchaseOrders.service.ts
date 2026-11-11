import api from './api'

export type PurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: number
  branch_id: number
  contact_id: number | null
  contact_name?: string
  series_id: number
  series: string
  correlative: number
  number: string
  issue_date: string
  expected_date?: string | null
  currency: string
  exchange_rate?: number | null
  payment_condition: string
  subtotal: number
  tax_amount: number
  total: number
  price_includes_igv: boolean
  notes: string
  status: PurchaseOrderStatus
  purchase_id?: number | null
  received_at?: string | null
  created_at: string
}

export interface PurchaseOrderItem {
  id?: number
  product_id?: number | null
  presentation_id?: number | null
  sale_unit_id?: number | null
  code: string
  description: string
  unit: string
  quantity: number
  unit_cost: number
  tax_rate?: number
  igv_affectation_type: string
  price_includes_igv: boolean
  subtotal?: number
  tax_amount?: number
  total?: number
}

export interface SavePurchaseOrderInput {
  branch_id?: number
  contact_id: number
  series_id: number
  issue_date: string
  expected_date?: string
  currency: string
  exchange_rate?: number
  payment_condition?: string
  notes?: string
  items: PurchaseOrderItem[]
}

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  received: 'Recibida',
  cancelled: 'Anulada',
}

export const purchaseOrdersService = {
  list: (params?: { q?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    api
      .get<{ data: PurchaseOrder[]; total: number }>('/api/purchase-orders', { params })
      .then(r => ({ data: r.data.data ?? [], total: r.data.total ?? 0 })),

  get: (id: number) =>
    api
      .get<{ data: PurchaseOrder; items: PurchaseOrderItem[] }>(`/api/purchase-orders/${id}`)
      .then(r => ({ order: r.data.data, items: r.data.items ?? [] })),

  create: (body: SavePurchaseOrderInput) =>
    api.post<{ data: PurchaseOrder }>('/api/purchase-orders', body).then(r => r.data.data),

  update: (id: number, body: SavePurchaseOrderInput) =>
    api.patch<{ data: PurchaseOrder }>(`/api/purchase-orders/${id}`, body).then(r => r.data.data),

  send: (id: number) => api.post<{ data: PurchaseOrder }>(`/api/purchase-orders/${id}/send`).then(r => r.data.data),

  cancel: (id: number) => api.post<{ data: PurchaseOrder }>(`/api/purchase-orders/${id}/cancel`).then(r => r.data.data),
}
