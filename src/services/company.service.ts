import api from './api'

export interface CompanyConfig {
  id?: number
  business_name: string
  trade_name: string
  ruc: string
  address: string
  ubigeo?: string
  phone: string
  email: string
  currency: string
  tax_rate: number
  color_theme: string
  logo_url: string
  wallet_provider?: string
  wallet_phone?: string
  wallet_qr_url?: string
  wallet_show_on_a4?: boolean
  wallet_show_on_ticket?: boolean
}

export interface SunatConfig {
  sunat_enabled: boolean
  sunat_env_mode?: string
  sunat_sol_user?: string
  tax_rate: number
  igv_regime: string
  tax_benefit_zone: boolean
}

export interface InvoicingSettings {
  send_mode: 'sunat_direct' | 'pse' | string
  fiscal_enabled: boolean
  connection_status?: string
}

export interface BranchRow {
  id: number
  name: string
  address: string
  phone: string
  fiscal_domicile_code?: string
  is_main: boolean
  active?: boolean
}

export interface SeriesRow {
  id: number
  branch_id: number
  branch_name?: string
  doc_type: string
  series: string
  current_number: number
  correlative?: number
  category: string
  active?: boolean
  sunat_code?: string
  locked?: boolean
  sales_count?: number
  can_delete?: boolean
}

export const companyService = {
  getConfig: () => api.get<CompanyConfig>('/api/company/config').then((r) => r.data),
  updateConfig: (data: Partial<CompanyConfig>) => api.put('/api/company/config', data).then((r) => r.data),
  updateReceiptWallet: (data: {
    wallet_provider: string
    wallet_phone: string
    wallet_qr_url: string
    wallet_show_on_a4: boolean
    wallet_show_on_ticket: boolean
  }) => api.put('/api/company/receipt-wallet', data).then((r) => r.data),
  getSunat: () => api.get<SunatConfig>('/api/company/sunat').then((r) => r.data),
  getInvoicing: () => api.get<InvoicingSettings>('/api/company/invoicing').then((r) => r.data),
  updateSunat: (data: Pick<SunatConfig, 'tax_rate' | 'igv_regime' | 'tax_benefit_zone'>) =>
    api.put('/api/company/sunat', data).then((r) => r.data),
  listBranches: (): Promise<BranchRow[]> =>
    api.get<{ data: BranchRow[] }>('/api/company/branches').then((r) => r.data.data ?? []),
  createBranch: (data: {
    name: string
    address: string
    phone: string
    fiscal_domicile_code?: string
    is_main: boolean
  }) => api.post('/api/company/branches', data).then((r) => r.data),
  updateBranch: (id: number, data: Partial<BranchRow>) =>
    api.put(`/api/company/branches/${id}`, data).then((r) => r.data),
  deleteBranch: (id: number) => api.delete(`/api/company/branches/${id}`).then((r) => r.data),
  listSeries: (params?: { branch_id?: number; category?: string }): Promise<SeriesRow[]> =>
    api.get<{ data: SeriesRow[] }>('/api/company/series', { params }).then((r) => r.data.data ?? []),
  createSeries: (data: {
    branch_id: number
    doc_type: string
    series: string
    category: string
    sunat_code: string
  }) => api.post('/api/company/series', data).then((r) => r.data),
  updateSeries: (
    id: number,
    data: {
      series: string
      active: boolean
      doc_type: string
      sunat_code: string
      category: string
      correlative?: number
    },
  ) => api.put(`/api/company/series/${id}`, data).then((r) => r.data),
  deleteSeries: (id: number) => api.delete(`/api/company/series/${id}`).then((r) => r.data),
}
