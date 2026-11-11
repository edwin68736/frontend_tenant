import api from './api'

export interface ReceivableInstallment {
  id: number
  installment_no: number
  due_date: string
  amount: number
  paid_amount: number
  due_amount: number
  currency: string
  status: string
  is_overdue: boolean
}

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
  /** Moneda del comprobante (PEN | USD): total/neto/cobrado/saldo están en esta moneda. */
  currency?: string
  exchange_rate?: number | null
  status: string
  payment_condition_code?: string
  has_detraccion: boolean
  direct_target: number
  direct_paid: number
  direct_due: number
  spot_amount: number
  spot_pending: number
  bn_confirmation_status?: string
  bn_confirmation_reference?: string
  is_overdue: boolean
  installments?: ReceivableInstallment[]
  installments_pending?: number
  next_installment_due?: string | null
}

export interface ReceivablesCurrencySummary {
  currency: string
  direct_due: number
  count_open: number
  count_overdue: number
  /** Este saldo convertido a soles con el TC de cada documento (en PEN = direct_due). */
  direct_due_pen?: number
}

export interface ReceivablesSummary {
  /** Saldo directo por moneda (el total_direct_due plano mezcla PEN y USD). */
  by_currency?: ReceivablesCurrencySummary[]
  total_direct_due: number
  /** Saldo directo de todas las monedas EN SOLES (cada USD al TC de su documento). */
  total_direct_due_pen?: number
  /** Documentos en USD sin TC guardado: convertidos con el TC del día de emisión / sin poder convertirse. */
  rate_estimated_count?: number
  rate_missing_count?: number
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
  /** Importe en la moneda del documento (currency). */
  debit: number
  credit: number
  currency?: string
  exchange_rate?: number | null
  /** Importe de la línea en soles. */
  debit_pen?: number
  credit_pen?: number
  /** Saldo corriente EN SOLES. */
  balance: number
  sale_id?: number
  /** Caja/sesión donde ocurrió el cobro — solo presente en líneas type="payment". */
  cash_session_id?: number | null
}

export interface AccountStatement {
  contact_id: number
  contact_name: string
  lines: StatementLine[]
  /** Saldo directo EN SOLES (cada USD al TC de su documento). */
  total_due: number
  total_due_by_currency?: ReceivablesCurrencySummary[]
  rate_estimated_count?: number
  rate_missing_count?: number
  spot_pending: number
}

export interface CollectPaymentLine {
  method: string
  amount: number
  /** Cuenta bancaria que recibe este cobro (omitido = la vinculada al método). */
  destination_account_id?: number
  /** N° de operación / referencia del cobro. */
  reference?: string
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

  collect: async (
    saleId: number,
    payments: CollectPaymentLine[],
    opts?: { cashSessionId?: number; preferInstallmentId?: number },
  ): Promise<void> => {
    await api.post(`/api/receivables/${saleId}/collect`, {
      payments,
      ...(opts?.cashSessionId ? { cash_session_id: opts.cashSessionId } : {}),
      ...(opts?.preferInstallmentId ? { prefer_installment_id: opts.preferInstallmentId } : {}),
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
