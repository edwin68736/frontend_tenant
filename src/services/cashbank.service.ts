import api from './api'

export interface OpenCashSessionRow {
  id: number
  branch_id: number
  user_id: number
  user_name: string
  opening_balance: number
  current_balance: number
  opened_at: string
  register_code?: string | null
  register_name?: string | null
}

export interface CashSession {
  id: number
  branch_id: number
  register_code?: string | null
  register_name?: string | null
  branch_name?: string
  opened_by: number
  opening_balance: number
  closing_balance: number | null
  expected_balance: number | null
  difference: number | null
  arqueo_json?: string | null
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  notes?: string
}

export interface CashMovement {
  id: number
  session_id: number
  type: 'income' | 'expense'
  category: string
  reference: string
  amount: number
  notes?: string
  created_at: string
}

export interface BankAccount {
  id: number
  name: string
  bank_name: string
  account_number: string
  currency: string
  balance: number
  type: string
  payment_method: string
  active: boolean
}

export interface BankMovement {
  id: number
  account_id: number
  type: 'credit' | 'debit'
  description: string
  reference: string
  amount: number
  date: string
  created_at: string
}

export interface CashSessionReportSession {
  id: number
  branch_id: number
  branch_name: string
  opened_by_user_id: number
  opened_by_user_name: string
  opened_at: string
  closed_at: string | null
  opening_balance: number
  closing_balance: number | null
  status: string
  notes?: string
}

export interface IncomeDetailRow {
  date: string
  type: string
  doc_number: string
  reference: string
  amount: number
  payment_method: string
}

export interface ExpenseDetailRow {
  date: string
  type: string
  doc_number: string
  reference: string
  amount: number
  payment_method: string
}

export interface MethodTotal {
  method: string
  total: number
}

export interface CashSessionReport {
  session: CashSessionReportSession
  income_detail: IncomeDetailRow[]
  expense_detail: ExpenseDetailRow[]
  cancelled_sales_detail?: IncomeDetailRow[]
  totals_by_method: {
    sales: MethodTotal[]
    purchases: MethodTotal[]
    movements: MethodTotal[]
  }
  totals: {
    total_income: number
    total_expense: number
    /** Cobrado directo (sin SPOT). */
    total_sales: number
    total_sales_direct?: number
    total_detraccion_spot?: number
    total_sales_commercial?: number
    total_purchases: number
    final_balance: number
  }
  cash_physical?: {
    opening_balance: number
    total_income: number
    total_expense: number
    physical_balance: number
    sales_total: number
    cash_sales: IncomeDetailRow[]
    manual_income: IncomeDetailRow[]
    expenses: ExpenseDetailRow[]
  }
  electronic?: {
    total_sales: number
    sales_by_method: MethodTotal[]
    sales: IncomeDetailRow[]
  }
  detraction?: {
    total_spot: number
    sales: IncomeDetailRow[]
  }
}

export interface MovementReportRow {
  date: string
  type: string
  doc_number: string
  contact_name: string
  user_name: string
  branch_name: string
  payment_method: string
  amount: number
  movement_id: number
  cash_session_id: number
  category?: string
  cash_reference?: string
  notes_detail?: string
}

export interface MovementReportSummary {
  total_rows: number
  sum_income: number
  sum_expense: number
  net_movement: number
}

export interface MovementsReportParams {
  branch_id?: number
  user_id?: number
  date_from?: string
  date_to?: string
  session_id?: number
  type?: string
  page?: number
  /** 0 = sin paginar (todas las filas). Omitido en clientes que necesitan el listado completo. */
  per_page?: number
}

export interface MovementsReportResult {
  data: MovementReportRow[]
  total: number
  summary: MovementReportSummary
  detraction?: {
    data: MovementReportRow[]
    total: number
    summary: MovementReportSummary
  }
}

export const cashbankService = {
  // Caja
  listSessions: (branch_id?: number): Promise<CashSession[]> =>
    api.get('/api/cashbank/sessions', { params: { branch_id } }).then(r => r.data.data ?? []),

  getOpenSession: (branch_id?: number): Promise<CashSession | null> =>
    api.get('/api/cashbank/sessions/open', { params: { branch_id } })
      .then(r => (r.data?.data != null ? r.data.data : null) as CashSession | null)
      .catch(() => null),

  listOpenSessionsInBranch: (branch_id: number): Promise<OpenCashSessionRow[]> =>
    api
      .get('/api/cashbank/sessions/open/list', { params: { branch_id } })
      .then(r => r.data.data ?? []),

  openSession: (data: { branch_id: number; opening_balance: number; notes?: string }): Promise<CashSession> =>
    api.post('/api/cashbank/sessions', data).then(r => r.data.data ?? r.data),

  closeSession: (id: number, data?: { closing_balance?: number; notes?: string; arqueo?: Record<string, number> }): Promise<CashSession> =>
    api.post(`/api/cashbank/sessions/${id}/close`, data ?? {}).then(r => r.data.data ?? r.data),

  getSession: (id: number): Promise<CashSession> =>
    api.get(`/api/cashbank/sessions/${id}`).then(r => r.data.data ?? r.data),

  saveArqueo: (id: number, arqueo: Record<string, number>): Promise<{ sum: number }> =>
    api.post(`/api/cashbank/sessions/${id}/arqueo`, { arqueo }).then(r => r.data),

  listMovements: (sessionId: number): Promise<CashMovement[]> =>
    api.get(`/api/cashbank/sessions/${sessionId}/movements`).then(r => r.data.data ?? r.data ?? []),

  addMovement: (sessionId: number, data: { type: 'income' | 'expense'; category: string; reference?: string; payment_method?: string; amount: number; notes?: string }): Promise<CashMovement> =>
    api.post(`/api/cashbank/sessions/${sessionId}/movements`, data).then(r => r.data.data ?? r.data),

  getSessionReport: (sessionId: number): Promise<CashSessionReport> =>
    api.get(`/api/cashbank/sessions/${sessionId}/report`).then(r => r.data.data ?? r.data),

  listMovementsReport: async (params?: MovementsReportParams): Promise<MovementsReportResult> => {
    const r = await api.get('/api/cashbank/reports/movements', { params: params ?? {} })
    const summaryRaw = r.data.summary ?? {}
    const cashData = r.data.cash?.data ?? []
    const electronicData = r.data.electronic?.data ?? []
    const detractionBlock = r.data.detraction
    const merged = r.data.data ?? [...cashData, ...electronicData]
    return {
      data: merged,
      total: Number(r.data.total ?? merged.length),
      summary: {
        total_rows: Number(summaryRaw.total_rows ?? merged.length),
        sum_income: Number(summaryRaw.sum_income ?? 0),
        sum_expense: Number(summaryRaw.sum_expense ?? 0),
        net_movement: Number(summaryRaw.net_movement ?? 0),
      },
      detraction: detractionBlock
        ? {
            data: detractionBlock.data ?? [],
            total: Number(detractionBlock.total ?? 0),
            summary: {
              total_rows: Number(detractionBlock.summary?.total_rows ?? 0),
              sum_income: Number(detractionBlock.summary?.sum_income ?? 0),
              sum_expense: Number(detractionBlock.summary?.sum_expense ?? 0),
              net_movement: Number(detractionBlock.summary?.net_movement ?? 0),
            },
          }
        : undefined,
    }
  },

  // Bancos
  listBankAccounts: (all?: boolean): Promise<BankAccount[]> =>
    api.get('/api/cashbank/bank-accounts', { params: all ? { all: '1' } : {} }).then(r => r.data.data ?? []),

  getBankAccount: (id: number): Promise<BankAccount> =>
    api.get(`/api/cashbank/bank-accounts/${id}`).then(r => r.data.data ?? r.data),

  createBankAccount: (data: { name: string; bank_name: string; account_number: string; currency: string; type?: string; payment_method?: string; initial_balance: number }): Promise<BankAccount> =>
    api.post('/api/cashbank/bank-accounts', { ...data, type: data.type ?? 'bank', payment_method: data.payment_method ?? '' }).then(r => r.data.data ?? r.data),

  updateBankAccount: (id: number, data: Partial<{ name: string; bank_name: string; account_number: string; type: string; payment_method: string; active: boolean }>): Promise<void> =>
    api.put(`/api/cashbank/bank-accounts/${id}`, data).then(r => r.data),

  listBankMovements: (id: number): Promise<BankMovement[]> =>
    api.get(`/api/cashbank/bank-accounts/${id}/movements`).then(r => r.data.data ?? r.data ?? []),

  addBankMovement: (id: number, data: { type: 'credit' | 'debit'; description: string; reference?: string; amount: number; date: string }): Promise<BankMovement> =>
    api.post(`/api/cashbank/bank-accounts/${id}/movements`, data).then(r => r.data.data ?? r.data),

  /** Métodos de pago del tenant (objetos con id, name, code, destination_type, etc.). */
  listPaymentMethods: (all?: boolean): Promise<PaymentMethodRecord[]> => {
    const fallback: PaymentMethodRecord[] = [
      { id: 0, name: 'Efectivo', code: 'cash', destination_type: 'cash', bank_account_id: null, is_system: true, sort_order: 0, active: true },
      { id: 0, name: 'Yape', code: 'yape', destination_type: 'bank_account', bank_account_id: null, is_system: false, sort_order: 1, active: true },
      { id: 0, name: 'Plin', code: 'plin', destination_type: 'bank_account', bank_account_id: null, is_system: false, sort_order: 2, active: true },
      { id: 0, name: 'Transferencia', code: 'transferencia', destination_type: 'bank_account', bank_account_id: null, is_system: false, sort_order: 3, active: true },
      { id: 0, name: 'Tarjeta', code: 'tarjeta', destination_type: 'bank_account', bank_account_id: null, is_system: false, sort_order: 4, active: true },
    ]
    return api
      .get('/api/payment-methods', { params: all ? { all: '1' } : {} })
      .then((r) => {
        const raw = r.data?.data ?? r.data
        const arr = Array.isArray(raw) ? raw : []
        return arr.length > 0 ? arr : fallback
      })
      .catch(() =>
        api
          .get('/api/cashbank/payment-methods', { params: all ? { all: '1' } : {} })
          .then((r) => {
            const raw = r.data?.data ?? r.data
            const arr = Array.isArray(raw) ? raw : []
            return arr.length > 0 ? arr : fallback
          })
          .catch(() => fallback),
      )
  },

  getPaymentMethod: (id: number): Promise<PaymentMethodRecord> =>
    api.get(`/api/cashbank/payment-methods/${id}`).then(r => r.data.data ?? r.data),

  createPaymentMethod: (data: { name: string; code: string; destination_type: string; bank_account_id?: number }): Promise<PaymentMethodRecord> =>
    api.post('/api/cashbank/payment-methods', data).then(r => r.data.data ?? r.data),

  updatePaymentMethod: (id: number, data: Partial<{ name: string; code: string; destination_type: string; bank_account_id?: number; active: boolean }>): Promise<void> =>
    api.put(`/api/cashbank/payment-methods/${id}`, data).then(r => r.data),

  deletePaymentMethod: (id: number): Promise<void> =>
    api.delete(`/api/cashbank/payment-methods/${id}`).then(r => r.data),
}

export interface PaymentMethodRecord {
  id: number
  name: string
  code: string
  /** payment_method | payment_condition | internal */
  kind?: string
  destination_type: 'cash' | 'bank_account' | 'detraction' | 'receivable'
  bank_account_id: number | null
  is_system: boolean
  sort_order: number
  active: boolean
}
