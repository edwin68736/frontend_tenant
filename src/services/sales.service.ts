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
  /** RUC/DNI del cliente; lo resuelve el backend al listar. */
  contact_doc_number?: string
  user_name?: string
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
  /** Nota de crédito/débito: comprobante que modifica, tal como lo declara SUNAT. */
  affected_doc_sunat_code?: string
  affected_doc_type?: string
  affected_doc_series?: string
  affected_doc_number?: string
  /** Tipo de nota (catálogo SUNAT 09/10) y su descripción. */
  note_type_code?: string
  note_type_reason?: string
  /** Corrección fiscal de soporte: reenviado a SUNAT con otra fecha de emisión. */
  reissued_at?: string | null
  reissued_from_date?: string | null
  reissue_count?: number
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
  /** Vuelto entregado (pagos directos por encima del importe cobrable). 0/ausente si no hubo. */
  change_amount?: number
}

export interface SaleItem {
  id: number
  product_id: number
  code: string
  description: string
  unit: string
  /** Cantidad COMERCIAL (ej. 2, no 24) cuando la línea usó una unidad de venta (sale_unit_id). */
  quantity: number
  /** Precio histórico COMERCIAL (ej. S/36 por caja) — nunca se multiplica por el factor. */
  unit_price: number
  igv_affectation_type: string
  price_includes_igv: boolean
  subtotal: number
  tax_amount: number
  total: number
  /**
   * Unidad de venta con conversión usada en esta línea (ej. "Caja x12"). undefined/null = línea
   * legacy sin conversión (comportamiento previo). Confirmado en Fase 7A: GET /api/sales/:id
   * devuelve el TenantSaleItem completo, por lo que este campo YA viaja en la respuesta real del
   * backend aunque no estuviera declarado aquí — ver backend_principal/pkg/database/migrations.go
   * (TenantSaleItem.SaleUnitID) y sale_handler.go:479 (items sin DTO intermedio).
   *
   * NO existe `sale_unit_quantity` ni `conversion_factor` en TenantSaleItem — esos snapshots
   * viven únicamente en TenantStockMovement (Kardex), no en la línea de venta. `quantity` de
   * arriba YA es la cantidad comercial; para mostrar el factor/nombre hay que resolver la
   * SaleUnit del catálogo (productsService.getSaleUnit) o leerlo del Kardex.
   */
  sale_unit_id?: number | null
}

export interface SalePayment {
  id: number
  method: string
  amount: number
  reference: string
  /** Caja/sesión donde OCURRIÓ este pago (no necesariamente la misma en que se registró la
   *  venta) — el backend ya la devuelve (TenantSalePayment.cash_session_id); null en pagos
   *  anteriores a esa columna. */
  cash_session_id?: number | null
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
  reference?: string
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
  /** cash (contado) | credit (crédito). Por defecto contado. */
  payment_condition_code?: 'cash' | 'credit'
  /** Cuotas al registrar venta a crédito. */
  credit_installments?: { due_date: string; amount: number }[]
  payment_method?: string
  payments?: PaymentInput[]
  notes?: string
  /** Al registrar venta desde cotización (opción B). */
  from_quotation_id?: number
  fiscal_context?: SaleFiscalContextInput
  detraccion?: {
    good_code: string
    payment_method_code?: string
    /** N° de constancia de pago (opcional, 1001 y 1004) — solo referencia impresa, no viaja a SUNAT. */
    pay_constancy_number?: string
    /** Exclusivos de 1004 (transporte de carga) — ver internal/detraccion/service.go. */
    valor_referencial_pen?: number
    mtc_registro?: string
    configuracion_vehicular?: string
    punto_origen?: string
    punto_destino?: string
    carga_efectiva_tm?: number
    carga_util_tm?: number
    /** Obligatorio en 1004. Solo referencia impresa, no viaja a SUNAT. */
    trip_detail?: string
  }
  prepayment?: {
    emit?: boolean
    affectation_group: 'gravado' | 'exonerado' | 'inafecto'
    deductions?: { source_sale_id: number; amount: number }[]
  }
  global_discount_mode?: 'percent' | 'amount'
  global_discount_value?: number
  items: {
    product_id?: number | null
    presentation_id?: number
    /**
     * Unidad de venta elegida (ej. "Caja x12"). `quantity`/`unit_price` de esta misma línea
     * siguen siendo COMERCIALES (2, S/36) — el backend convierte a unidad base internamente y
     * valida unit_price server-side contra BranchPrice → SaleUnit global → Price1 (nunca confiar
     * en el precio que llega del cliente). Mutuamente excluyente con presentation_id. Confirmado
     * en Fase 7A contra service.SaleItemInput.SaleUnitID (sale_service.go:119).
     */
    sale_unit_id?: number
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
    item_note?: string
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
  /**
   * Unidad de venta de ESTA combinación (Fase 7J): cada fila ya es una combinación homogénea
   * producto+SaleUnit; `null`/`undefined` = venta en unidad base/legacy (combinación propia, nunca
   * se funde con una SaleUnit real del mismo producto). El nombre comercial se resuelve en el
   * frontend vía saleUnitNames.ts, igual que ya hacen Compras (7H) y Kardex (7I).
   */
  sale_unit_id?: number | null
  /** Código SUNAT de la línea (fallback de UI cuando sale_unit_id es nil) — nunca el nombre comercial. */
  unit: string
  /** Cantidad COMERCIAL de esta combinación — nunca convertida a base ni sumada contra otra SaleUnit. */
  quantity_sold: number
  total_amount: number
  /** Métricas técnicas de granularidad interna, no se muestran en el reporte del front. */
  lines_count: number
  sales_count: number
  avg_line_amount: number
  /** total_amount / quantity_sold — precio promedio, válido dentro de esta combinación producto+SaleUnit. */
  avg_unit_price: number
}

/**
 * Fase 7J: se quitó `total_quantity` — sumar cantidades comerciales de todas las combinaciones
 * (distintos productos Y distintas SaleUnits) no tiene lectura de negocio válida. `products_count`
 * es COUNT(DISTINCT product_id), no la cantidad de filas (que ahora son combinaciones).
 */
export interface SalesByProductSummary {
  total_amount: number
  line_items: number
  distinct_sales: number
  products_count: number
}

/** Reporte "Utilidades detallado": una fila por línea de venta con su ganancia. */
export interface ProfitDetailRow {
  sale_item_id: number
  sale_id: number
  issue_date: string
  doc_type: string
  series: string
  number: string
  contact_name: string
  contact_doc_number: string
  product_name: string
  quantity: number
  /**
   * Costo ACTUAL del producto en catálogo (join en vivo) — no un snapshot histórico al momento de
   * la venta, porque tenant_sale_items no guarda ese dato. Si el costo cambió después de esa
   * venta, esta fila refleja el costo de hoy. 0 si el producto no tiene costo o no existe en
   * catálogo (ítem manual) — en ese caso la ganancia unidad es el precio de venta completo.
   */
  purchase_price: number
  sale_price: number
  profit_unit: number
  profit_total: number
}

export interface ProfitDetailSummary {
  line_items: number
  distinct_sales: number
  total_sales: number
  total_profit: number
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
  /** Vuelto total entregado en las ventas del filtro. */
  sum_change_amount?: number
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
  sum_change_amount: 0,
  payment_totals: [],
})

/**
 * Devolución de dinero que quedó sin registrar: al anular una venta completa (source="sale",
 * se aplica con applyPendingRefund) o el monto de una nota de crédito parcial ya aceptada por
 * SUNAT (source="credit_note", se aplica con applyPendingNoteRefund).
 */
export interface PendingRefund {
  source: 'sale' | 'credit_note'
  cash_movement_id?: number
  note_sale_id?: number
  note_number?: string
  sale_id: number
  sale_number: string
  amount: number
  payment_method: string
  original_session_id?: number
}

export const salesService = {
  /**
   * Devoluciones pendientes de la sucursal.
   *
   * Aparecen cuando se anula una venta y no había ninguna caja abierta donde sacar el dinero
   * (p. ej. SUNAT acepta la nota de crédito de madrugada). No hay estado que mantener: se
   * derivan de los cobros que aún no tienen una reversión asociada.
   */
  pendingRefunds: async (branchId?: number): Promise<PendingRefund[]> => {
    const { data } = await api.get<{ data: PendingRefund[] }>('/api/sales/pending-refunds', {
      params: branchId ? { branch_id: branchId } : undefined,
    })
    return data.data ?? []
  },

  /** Registra la devolución en la caja indicada; deja de estar pendiente al hacerlo. */
  applyPendingRefund: (cashMovementId: number, cashSessionId: number, reason: string) =>
    api.post('/api/sales/pending-refunds/apply', {
      cash_movement_id: cashMovementId,
      cash_session_id: cashSessionId,
      reason,
    }),

  /** Contraparte de applyPendingRefund para devoluciones de nota de crédito parcial. */
  applyPendingNoteRefund: (noteSaleId: number, cashSessionId: number, reason: string) =>
    api.post('/api/sales/pending-refunds/apply-note', {
      note_sale_id: noteSaleId,
      cash_session_id: cashSessionId,
      reason,
    }),

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

  /** Reporte: ventas agregadas por producto (from, to, branch_id, category_id, q, product_type) + resumen. */
  listByProduct: (params?: {
    from?: string
    to?: string
    branch_id?: number
    category_id?: number
    /** Busca por código o nombre de producto. */
    q?: string
    /** '' = todos | 'product' | 'service' */
    product_type?: string
  }) =>
    api
      .get<{
        data: SalesByProductRow[]
        summary: SalesByProductSummary
      }>('/api/sales/by-product', { params: params ?? {} })
      .then(r => ({
        data: r.data.data ?? [],
        summary: r.data.summary ?? {
          total_amount: 0,
          line_items: 0,
          distinct_sales: 0,
          products_count: 0,
        },
      })),

  /** Reporte: Utilidades detallado — ganancia por línea de venta (precio venta - costo actual). */
  listProfitDetail: (params?: {
    from?: string
    to?: string
    branch_id?: number
    category_id?: number
    /** Busca por código o nombre de producto. */
    q?: string
  }) =>
    api
      .get<{
        data: ProfitDetailRow[]
        summary: ProfitDetailSummary
      }>('/api/sales/profit-detail', { params: params ?? {} })
      .then(r => ({
        data: r.data.data ?? [],
        summary: r.data.summary ?? {
          line_items: 0,
          distinct_sales: 0,
          total_sales: 0,
          total_profit: 0,
        },
      })),

  get: (id: number): Promise<SaleDetail> =>
    api.get(`/api/sales/${id}`).then((r) => r.data as SaleDetail),

  issueElectronicFromNota: (saleId: number, body: { series_id: number; issue_date?: string; contact_id?: number }) =>
    api.post<{ sale: Sale }>(`/api/sales/${saleId}/issue-electronic`, body).then((r) => r.data),

  /**
   * Anula una nota de venta (SUNAT 00) y repone el stock. El backend rechaza facturas y
   * boletas —esas se anulan con nota de crédito— y las notas que ya generaron un
   * comprobante electrónico.
   */
  cancelNotaVenta: (saleId: number, reason: string) =>
    api.post<{ success: boolean }>(`/api/sales/${saleId}/cancel`, { reason }).then((r) => r.data),

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

  sendReceiptEmail: (saleId: number, email: string, pdfBase64: string) =>
    api
      .post<{ success: boolean }>(`/api/sales/${saleId}/email-receipt`, {
        email,
        pdf_base64: pdfBase64,
      })
      .then(r => r.data),
}
