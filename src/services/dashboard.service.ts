import api from './api'

export interface DashboardStats {
  home?: {
    sales_today: number
    sales_month: number
    purchases_today: number
    purchases_month: number
  }
  totals: {
    contacts: number
    products: number
    sales: number
    purchases: number
  }
  current_month: {
    sales_count: number
    sales_total: number
    purchases_total: number
    month: number
    year: number
  }
  monthly_sales: Array<{ month: number; year: number; amount: number }>
  low_stock_products: Array<{
    product_id: number
    product_name: string
    quantity: number
    min_stock: number
  }>
  open_cash_sessions: number
  pending_billing: number
}

export interface DashboardAnalyticsParams {
  date_from: string
  date_to: string
  branch_id?: number
}

export interface DashboardAnalytics {
  period: {
    date_from: string
    date_to: string
    previous_from: string
    previous_to: string
    duration_days: number
    sales_change_pct: number
  }
  summary: {
    sales_total: number
    sales_count: number
    avg_ticket: number
    sales_previous_total: number
    sales_today: number
    sales_today_count: number
    sales_month_calendar: number
    sales_previous_month: number
    month_over_month_pct: number
    new_contacts: number
    cancelled_sales: number
    pending_sunat: number
    sent_sunat: number
    accepted_sunat: number
    rejected_sunat: number
    error_sunat: number
    cash_income: number
    cash_expense: number
    cash_net: number
    open_cash_sessions: number
    sum_detraccion?: number
    sum_net_payable?: number
    count_detraccion?: number
  }
  timeseries_daily: Array<{ day: string; sales: number; documents: number }>
  sales_by_branch: Array<{ id: number; name: string; total: number }>
  sales_by_seller: Array<{ id: number; name: string; total: number }>
  top_clients: Array<{ id: number; name: string; total: number; sales_count: number }>
  top_products: Array<{ product_id: number; name: string; quantity: number; total: number }>
  by_doc_type: Array<{ key: string; total: number; count: number }>
  by_payment_method: Array<{ key: string; total: number; count: number }>
  by_sale_status: Array<{ key: string; count: number }>
  by_product_category: Array<{ name: string; total: number }>
  low_stock_products: Array<{
    product_id: number
    product_name: string
    quantity: number
    min_stock: number
  }>
  recent_sales: Array<{
    id: number
    doc_type: string
    number: string
    issue_date: string
    total: number
    status: string
    billing_status: string
    branch_name: string
    contact_name: string
  }>
}

const emptyAnalytics = (): DashboardAnalytics => ({
  period: {
    date_from: '',
    date_to: '',
    previous_from: '',
    previous_to: '',
    duration_days: 0,
    sales_change_pct: 0,
  },
  summary: {
    sales_total: 0,
    sales_count: 0,
    avg_ticket: 0,
    sales_previous_total: 0,
    sales_today: 0,
    sales_today_count: 0,
    sales_month_calendar: 0,
    sales_previous_month: 0,
    month_over_month_pct: 0,
    new_contacts: 0,
    cancelled_sales: 0,
    pending_sunat: 0,
    sent_sunat: 0,
    accepted_sunat: 0,
    rejected_sunat: 0,
    error_sunat: 0,
    cash_income: 0,
    cash_expense: 0,
    cash_net: 0,
    open_cash_sessions: 0,
  },
  timeseries_daily: [],
  sales_by_branch: [],
  sales_by_seller: [],
  top_clients: [],
  top_products: [],
  by_doc_type: [],
  by_payment_method: [],
  by_sale_status: [],
  by_product_category: [],
  low_stock_products: [],
  recent_sales: [],
})

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>('/api/dashboard/stats')
    data.low_stock_products = data.low_stock_products ?? []
    data.monthly_sales = data.monthly_sales ?? []
    data.home = data.home ?? {
      sales_today: 0,
      sales_month: 0,
      purchases_today: 0,
      purchases_month: 0,
    }
    return data
  },

  getAnalytics: async (params: DashboardAnalyticsParams): Promise<DashboardAnalytics> => {
    const { data } = await api.get('/api/dashboard/analytics', { params })
    const d = data as unknown as Partial<DashboardAnalytics> | null
    if (!d || typeof d !== 'object') return emptyAnalytics()
    return {
      ...emptyAnalytics(),
      ...d,
      period: { ...emptyAnalytics().period, ...d.period },
      summary: { ...emptyAnalytics().summary, ...d.summary },
      timeseries_daily: d.timeseries_daily ?? [],
      sales_by_branch: d.sales_by_branch ?? [],
      sales_by_seller: d.sales_by_seller ?? [],
      top_clients: d.top_clients ?? [],
      top_products: d.top_products ?? [],
      by_doc_type: d.by_doc_type ?? [],
      by_payment_method: d.by_payment_method ?? [],
      by_sale_status: d.by_sale_status ?? [],
      by_product_category: d.by_product_category ?? [],
      low_stock_products: d.low_stock_products ?? [],
      recent_sales: d.recent_sales ?? [],
    }
  },
}
