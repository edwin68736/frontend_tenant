import api from './api'
import type { LinkedFiscalDocSummary } from '@/services/billing.service'

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
  linked_retention?: LinkedFiscalDocSummary | null
}

export interface PurchaseItem {
  product_id: number
  code: string
  description: string
  unit: string
  /** Cantidad COMERCIAL (ej. 10, no 1000) cuando la línea usa una unidad de venta (sale_unit_id). */
  quantity: number
  /** Costo COMERCIAL (ej. S/350/saco) — el backend convierte a costo base internamente. */
  unit_cost: number
  /**
   * Unidad de venta con conversión usada en esta línea (ej. "Saco 100 KG"). Confirmado en Fase 7A
   * como aceptado por POST /api/purchases (service.PurchaseItemInput.SaleUnitID,
   * purchase_service.go:40) — se puede enviar al crear una compra.
   *
   * PENDIENTE DE CONTRATO (lectura): GET /api/purchases/:id NO lo devuelve todavía — el handler
   * (purchase_api.go, tipo interno `itemRow`, líneas 124-139) arma una fila a mano que omite
   * sale_unit_id. Este campo por lo tanto NUNCA viene poblado al leer una compra ya creada,
   * aunque sí se envía al crearla. No modificar el backend sin autorización explícita; hasta
   * entonces, el detalle de una compra por SaleUnit no puede mostrar qué unidad se usó (bloquea
   * parte de la Fase 7H — "mostrar unidad en detalle/anulación").
   */
  sale_unit_id?: number
  igv_affectation_type: string
  price_includes_igv: boolean
  /** Números de serie (para productos con manejo de series). */
  serials?: string[]
  /** Solo en formulario: indica si el producto usa series. */
  manage_series?: boolean
  /** Solo UI: precio de venta actual del catálogo. */
  current_sale_price?: number
  /** Solo UI: el producto tiene presentaciones con precio propio. */
  has_presentations?: boolean
  /** Solo UI: producto recién creado en esta sesión (sin toggle de precio venta). */
  is_newly_created?: boolean
  /** Enviar al backend cuando el usuario desea actualizar precio de venta. */
  update_sale_price?: boolean
  new_sale_price?: number
}

export interface PurchaseDetail {
  purchase: Purchase
  items: PurchaseItem[]
  linked_retention?: LinkedFiscalDocSummary | null
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
  /** Criterio global: el costo unitario tecleado ya incluye IGV (se desagrega en el backend). */
  price_includes_igv?: boolean
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
      const { items = [], linked_retention, ...rest } = raw as { items?: PurchaseItem[]; linked_retention?: LinkedFiscalDocSummary | null; [k: string]: unknown }
      return {
        purchase: rest as unknown as Purchase,
        items: items ?? [],
        linked_retention: linked_retention ?? null,
      }
    }),

  create: (data: CreatePurchaseInput) =>
    api.post('/api/purchases', data).then(r => r.data),

  void: (id: number) =>
    api.post(`/api/purchases/${id}/void`).then(r => (r.data as { message?: string })?.message ?? 'Compra anulada'),
}
