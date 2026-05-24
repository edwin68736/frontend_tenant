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

export const companyService = {
  getConfig: () => api.get<CompanyConfig>('/api/company/config').then(r => r.data),
  updateConfig: (data: Partial<CompanyConfig>) => api.put('/api/company/config', data).then(r => r.data),
  getSunat: () => api.get<SunatConfig>('/api/company/sunat').then(r => r.data),
  getInvoicing: () => api.get<InvoicingSettings>('/api/company/invoicing').then(r => r.data),
  updateSunat: (data: Pick<SunatConfig, 'tax_rate' | 'igv_regime' | 'tax_benefit_zone'>) =>
    api.put('/api/company/sunat', data).then(r => r.data),
  listBranches: () => api.get('/api/company/branches').then(r => r.data.data),
  createBranch: (data: { name: string; address: string; phone: string; is_main: boolean }) =>
    api.post('/api/company/branches', data).then(r => r.data),
  updateBranch: (id: number, data: object) => api.put(`/api/company/branches/${id}`, data).then(r => r.data),
  deleteBranch: (id: number) => api.delete(`/api/company/branches/${id}`).then(r => r.data),
  listSeries: (params?: { branch_id?: number; category?: string }) =>
    api.get('/api/company/series', { params }).then(r => r.data.data),
  createSeries: (data: object) => api.post('/api/company/series', data).then(r => r.data),
  updateSeries: (id: number, data: object) => api.put(`/api/company/series/${id}`, data).then(r => r.data),
}
