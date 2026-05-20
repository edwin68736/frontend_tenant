import api from './api'

export interface Purchase {
  id: number
  doc_type: string
  series: string
  number: string
  issue_date: string
  contact_id?: number
  contact_name?: string
  supplier_name?: string
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  status: string
  branch_id?: number
  notes?: string
  created_at?: string
}

export interface PurchaseItem {
  product_id: number
  code: string
  description: string
  unit: string
  quantity: number
  unit_cost: number
  igv_affectation_type: string
  price_includes_igv: boolean
  /** Números de serie (para productos con manejo de series). */
  serials?: string[]
  /** Solo en formulario: indica si el producto usa series. */
  manage_series?: boolean
}

export interface PurchaseDetail {
  purchase: Purchase
  items: PurchaseItem[]
}

export interface CreatePurchaseInput {
  branch_id?: number
  contact_id: number
  doc_type: string
  series?: string
  number: string
  issue_date: string
  currency: string
  payment_method?: string
  notes?: string
  items: PurchaseItem[]
}

export const purchasesService = {
  /** Lista compras. Con `per_page` el backend devuelve `total` para paginación. `q` busca en serie/número de comprobante y en datos del proveedor (nombre, razón social, documento). */
  list: (params?: {
    q?: string
    contact_id?: number
    from?: string
    to?: string
    page?: number
    per_page?: number
  }) =>
    api
      .get<{ data: Purchase[]; total?: number }>('/api/purchases', { params })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? r.data.data?.length ?? 0,
      })),

  get: (id: number): Promise<PurchaseDetail> =>
    api.get(`/api/purchases/${id}`).then(r => {
      const raw = (r.data as { data?: Record<string, unknown> })?.data ?? r.data
      if (!raw || typeof raw !== 'object') throw new Error('Sin datos')
      const { items = [], ...rest } = raw as { items?: PurchaseItem[]; [k: string]: unknown }
      return { purchase: rest as unknown as Purchase, items: items ?? [] }
    }),

  create: (data: CreatePurchaseInput) =>
    api.post('/api/purchases', data).then(r => r.data),

  void: (id: number) =>
    api.post(`/api/purchases/${id}/void`).then(r => (r.data as { message?: string })?.message ?? 'Compra anulada'),
}
