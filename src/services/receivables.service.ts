import api from './api'

export interface ReceivableRow {
  sale_id: number
  sale_number: string
  doc_type: string
  issue_date: string
  due_date?: string | null
  contact_id: number
  contact_name: string
  contact_doc_number: string
  total: number
  status: string
  has_detraccion: boolean
  direct_target: number
  direct_paid: number
  direct_due: number
  spot_amount: number
  spot_pending: number
  bn_confirmation_status?: string
  bn_confirmation_reference?: string
  is_overdue: boolean
}

export interface ReceivablesSummary {
  total_direct_due: number
  total_spot_pending: number
  count_open: number
  count_overdue: number
  count_bn_pending: number
}

export interface StatementLine {
  date: string
  type: string
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
  sale_id?: number
}

export interface AccountStatement {
  contact_id: number
  contact_name: string
  lines: StatementLine[]
  total_due: number
  spot_pending: number
}

export interface CollectPaymentLine {
  method: string
  amount: number
}

export interface ListReceivablesParams {
  branch_id?: number
  contact_id?: number
  status?: string
  search?: string
  bn_status?: string
  page?: number
  page_size?: number
}

export const receivablesService = {
  list: async (params: ListReceivablesParams = {}): Promise<{ data: ReceivableRow[]; total: number }> => {
    const { data } = await api.get('/api/receivables', { params })
    return { data: data.data ?? [], total: data.total ?? 0 }
  },

  summary: async (branchId?: number): Promise<ReceivablesSummary> => {
    const { data } = await api.get('/api/receivables/summary', {
      params: branchId ? { branch_id: branchId } : undefined,
    })
    return data.data
  },

  statement: async (contactId: number, branchId?: number): Promise<AccountStatement> => {
    const { data } = await api.get('/api/receivables/statement', {
      params: { contact_id: contactId, ...(branchId ? { branch_id: branchId } : {}) },
    })
    return data.data
  },

  collect: async (saleId: number, payments: CollectPaymentLine[], cashSessionId?: number): Promise<void> => {
    await api.post(`/api/receivables/${saleId}/collect`, {
      payments,
      ...(cashSessionId ? { cash_session_id: cashSessionId } : {}),
    })
  },

  confirmBn: async (
    saleId: number,
    status: 'confirmed' | 'rejected',
    reference?: string,
  ): Promise<void> => {
    await api.post(`/api/receivables/${saleId}/confirm-bn`, { status, reference })
  },

  bnPending: async (branchId?: number): Promise<ReceivableRow[]> => {
    const { data } = await api.get('/api/receivables/bn-pending', {
      params: branchId ? { branch_id: branchId } : undefined,
    })
    return data.data ?? []
  },
}
