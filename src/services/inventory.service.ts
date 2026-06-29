import api from './api'

export interface StockByBranch {
  product_id: number
  branch_id: number
  quantity: number
  updated_at?: string
}

export interface StockMovement {
  id: number
  product_id: number
  product_code?: string
  product_name?: string
  branch_id: number
  branch_name?: string
  type: 'in' | 'out' | 'transfer' | 'adjustment' | string
  quantity: number
  balance?: number
  unit_cost?: number
  reference?: string
  notes?: string
  operation_type_id?: number
  operation_type_code?: string
  operation_type_name?: string
  sunat_code?: string
  inventory_document_id?: number
  user_id?: number
  user_name?: string
  created_at: string
}

export type InventoryDocumentDirection = 'IN' | 'OUT'

export type InventoryDocumentStatus = 'draft' | 'confirmed' | 'voided'

export type InventoryDocumentSource = 'MANUAL' | 'ADJUSTMENT' | 'IMPORT'

export interface InventoryOperationType {
  id: number
  direction: InventoryDocumentDirection
  code: string
  name: string
  sunat_code: string
  allow_manual: boolean
  requires_document: boolean
  sort_order: number
  is_active: boolean
}

export interface InventoryDocument {
  id: number
  number: string
  series_id: number
  correlative: number
  direction: InventoryDocumentDirection
  operation_type_id: number
  branch_id: number
  document_date: string
  status: InventoryDocumentStatus
  source?: InventoryDocumentSource
  reference: string
  movement_reason: string
  notes: string
  created_by: number
  confirmed_at?: string | null
  confirmed_by?: number | null
  voided_at?: string | null
  voided_by?: number | null
  created_at: string
  updated_at: string
}

export interface InventoryDocumentLine {
  id?: number
  document_id?: number
  product_id: number
  quantity: number
  unit_cost: number
  sort_order?: number
}

export interface InventoryDocumentLineInput {
  product_id: number
  quantity: number
  unit_cost: number
}

export interface CreateInventoryDocumentInput {
  direction: InventoryDocumentDirection
  operation_type_id: number
  branch_id: number
  document_date: string
  reference: string
  movement_reason: string
  notes: string
  lines: InventoryDocumentLineInput[]
}

export interface UpdateInventoryDocumentInput {
  operation_type_id: number
  document_date: string
  reference: string
  movement_reason: string
  notes: string
  lines: InventoryDocumentLineInput[]
}

export interface ImportAdjustmentRowPayload {
  row_number: number
  barcode: string
  new_stock: number
}

export interface ImportAdjustmentPreviewInput {
  branch_id: number
  rows: ImportAdjustmentRowPayload[]
}

export interface ImportAdjustmentPreviewRow {
  row_number: number
  barcode: string
  product_id?: number
  product_name?: string
  product_code?: string
  current_stock: number
  new_stock: number
  delta: number
  direction?: 'IN' | 'OUT' | ''
  unit_cost: number
  line_total: number
  status: 'Actualizar' | 'Sin cambios' | 'Error' | string
  error?: string
}

export interface ImportAdjustmentPreviewSummary {
  total_rows: number
  valid_in_rows: number
  valid_out_rows: number
  skipped_rows: number
  error_rows: number
  total_in_qty: number
  total_out_qty: number
  total_in_value: number
  total_out_value: number
}

export interface ImportAdjustmentPreviewResult {
  summary: ImportAdjustmentPreviewSummary
  rows: ImportAdjustmentPreviewRow[]
  can_confirm: boolean
}

export interface ImportAdjustmentConfirmInput {
  branch_id: number
  movement_reason?: string
  notes?: string
  rows: ImportAdjustmentRowPayload[]
}

export interface ImportAdjustmentConfirmResult {
  import_reference: string
  in_document_id?: number
  out_document_id?: number
  in_document_number?: string
  out_document_number?: string
  summary: ImportAdjustmentPreviewSummary
}

export interface TransferInput {
  product_id: number
  from_branch_id: number
  to_branch_id: number
  quantity: number
  notes?: string
}

/** Body para crear una transferencia (flujo por estados): una sola petición con todos los ítems. */
export interface CreateTransferInput {
  from_branch_id: number
  to_branch_id: number
  notes?: string
  items: { product_id: number; quantity: number }[]
}

export const inventoryService = {
  /** Stock por producto (opcionalmente por sucursal). Devuelve array de { product_id, branch_id, quantity } */
  getStock: (productId: number, branch_id?: number) =>
    api.get<{ data: StockByBranch[] }>(`/api/inventory/stock/${productId}`, { params: branch_id ? { branch_id } : {} })
      .then(r => r.data.data ?? []),

  listMovements: (params?: {
    product_id?: number
    product_q?: string
    branch_id?: number
    date_from?: string
    date_to?: string
    movement_kind?: string
    operation_type_id?: number
    operation_code?: string
    direction?: InventoryDocumentDirection
    sunat_code?: string
    q?: string
    page?: number
    per_page?: number
  }) =>
    api
      .get<{ data: StockMovement[]; total?: number }>('/api/inventory/movements', {
        params: params ?? {},
      })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? r.data.data?.length ?? 0,
      })),

  /** Crea una transferencia en estado "Enviado" (pending). Stock se descuenta en origen; destino se actualiza al confirmar. */
  createTransfer: (body: CreateTransferInput) =>
    api.post<{ ok: boolean; transfer_id: number }>('/api/inventory/transfer', body).then(r => r.data),

  listTransfers: (params?: { limit?: number }) =>
    api.get<{ data: TransferListItem[] }>('/api/inventory/transfers', { params }).then(r => r.data.data ?? []),

  confirmTransfer: (id: number) =>
    api.post<{ ok: boolean; message?: string }>(`/api/inventory/transfers/${id}/confirm`).then(r => r.data),

  cancelTransfer: (id: number) =>
    api.post<{ ok: boolean; message?: string }>(`/api/inventory/transfers/${id}/cancel`).then(r => r.data),

  /** Legacy: anular por ID de línea (solo registros antiguos sin cabecera). */
  reverseTransfer: (id: number) =>
    api.post<{ ok: boolean; message?: string }>(`/api/inventory/transfers/${id}/reverse`).then(r => r.data),

  /** Stock total por producto (suma todas las sucursales). product_ids = [1,2,3] → { "1": 15, "2": 0 } */
  getStockSummary: (productIds: number[]) =>
    productIds.length === 0
      ? Promise.resolve({})
      : api
          .get<{ data: Record<string, number> }>('/api/inventory/stock-summary', {
            params: { product_ids: productIds.join(',') },
          })
          .then(r => r.data.data ?? {}),

  /** Ajuste de inventario: type "in" | "out", quantity, notes. Si tiene series: serials[] (entrada = nuevos, salida = a retirar). */
  adjustment: (body: {
    product_id: number
    branch_id: number
    type: 'in' | 'out'
    quantity: number
    notes: string
    serials?: string[]
  }) =>
    api.post<{ ok: boolean }>('/api/inventory/adjustment', body).then(r => r.data),

  /** Catálogo de tipos de operación (Tabla 12). Cargar una vez por pantalla. */
  listOperationTypes: (params?: { direction?: InventoryDocumentDirection; manual?: boolean }) =>
    api
      .get<{ data: InventoryOperationType[] }>('/api/inventory/operation-types', {
        params: {
          ...(params?.direction ? { direction: params.direction } : {}),
          ...(params?.manual ? { manual: '1' } : {}),
        },
      })
      .then(r => r.data.data ?? []),

  listDocuments: (params?: {
    direction?: InventoryDocumentDirection
    status?: InventoryDocumentStatus | ''
    branch_id?: number
    page?: number
    per_page?: number
  }) =>
    api
      .get<{ data: InventoryDocument[]; total?: number }>('/api/inventory/documents', { params: params ?? {} })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? r.data.data?.length ?? 0,
      })),

  getDocument: (id: number) =>
    api
      .get<{ data: InventoryDocument; lines: InventoryDocumentLine[] }>(`/api/inventory/documents/${id}`)
      .then(r => ({ document: r.data.data, lines: r.data.lines ?? [] })),

  createDocument: (body: CreateInventoryDocumentInput) =>
    api.post<{ ok: boolean; id: number }>('/api/inventory/documents', body).then(r => r.data),

  updateDocument: (id: number, body: UpdateInventoryDocumentInput) =>
    api.put<{ ok: boolean }>(`/api/inventory/documents/${id}`, body).then(r => r.data),

  confirmDocument: (id: number) =>
    api.post<{ ok: boolean }>(`/api/inventory/documents/${id}/confirm`).then(r => r.data),

  voidDocument: (id: number) =>
    api.post<{ ok: boolean }>(`/api/inventory/documents/${id}/void`).then(r => r.data),

  previewImportAdjustment: (body: ImportAdjustmentPreviewInput) =>
    api
      .post<{ data: ImportAdjustmentPreviewResult }>('/api/inventory/import-adjustment/preview', body)
      .then(r => r.data.data),

  confirmImportAdjustment: (body: ImportAdjustmentConfirmInput) =>
    api
      .post<{ data: ImportAdjustmentConfirmResult }>('/api/inventory/import-adjustment/confirm', body)
      .then(r => r.data.data),
}

/** Transferencia por cabecera (flujo por estados). */
export interface TransferListItem {
  id: number
  from_branch_id: number
  from_branch_name: string
  to_branch_id: number
  to_branch_name: string
  status: 'pending' | 'confirmed' | 'cancelled'
  notes: string
  created_at: string
  confirmed_at: string | null
  lines: { product_id: number; product_name: string; quantity: number; with_serials: boolean }[]
}

/** Item de log legacy (por línea). */
export interface TransferLogItem {
  id: number
  product_id: number
  product_name: string
  from_branch_id: number
  from_branch_name: string
  to_branch_id: number
  to_branch_name: string
  quantity: number
  with_serials: boolean
  reverted_at: string | null
  created_at: string
}
