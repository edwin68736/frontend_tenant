import api from './api'

export interface PayableRow {
  purchase_id: number
  purchase_number: string
  doc_type: string
  issue_date: string
  due_date?: string | null
  contact_id: number
  contact_name: string
  contact_doc_number: string
  original_amount: number
  paid_amount: number
  due: number
  status: string
  is_overdue: boolean
  /** Moneda del documento: original_amount/paid_amount/due vienen en ella. */
  currency: string
  exchange_rate?: number | null
}

export interface PayablesSummary {
  /** Saldo consolidado en SOLES (los USD convertidos con el TC de cada compra). */
  total_due: number
  /** Parte del saldo que está en dólares (en dólares). */
  total_due_usd?: number
  count_open: number
  count_overdue: number
}

export interface ListPayablesParams {
  branch_id?: number
  contact_id?: number
  status?: string
  page?: number
  page_size?: number
}

export interface PayPayableInput {
  amount: number
  method: string
  reference?: string
  notes?: string
  cash_session_id?: number
}

// payablesService — CxP (Fase 2): saldo pendiente de compras a crédito con proveedor.
// Mismo patrón que receivables.service.ts (CxC), simplificado: una compra no tiene cronograma de
// cuotas, solo un saldo corriente (original/pagado/saldo) — ver PayableService.Pay en el backend
// (internal/payables/service/payable_service.go).
export const payablesService = {
  list: async (params: ListPayablesParams = {}): Promise<{ data: PayableRow[]; total: number }> => {
    const { data } = await api.get('/api/payables', { params })
    return { data: data.data ?? [], total: data.total ?? 0 }
  },

  summary: async (branchId?: number): Promise<PayablesSummary> => {
    const { data } = await api.get('/api/payables/summary', {
      params: branchId ? { branch_id: branchId } : undefined,
    })
    return data.data
  },

  pay: async (purchaseId: number, input: PayPayableInput): Promise<void> => {
    await api.post(`/api/payables/${purchaseId}/pay`, input)
  },
}
