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
  user_id?: number
  user_name?: string
  created_at: string
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
