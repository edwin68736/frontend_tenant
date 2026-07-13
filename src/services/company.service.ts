import api from './api'
import {
  clearCompanyLogoCache,
  ensureCompanyLogoDataUrl,
  getCompanyConfigCache,
  getCompanyLogoDataUrlSync,
  setCompanyConfigCache,
  setCompanyLogoFromFile,
} from '@/lib/companyConfig/store'

export interface CompanyConfig {
  id?: number
  business_name: string
  trade_name: string
  ruc: string
  address: string
  ubigeo?: string
  phone: string
  email: string
  website?: string
  currency: string
  tax_rate: number
  color_theme: string
  /** general | nrus — régimen tributario del contribuyente. */
  taxpayer_regime?: string
  logo_url: string
  additional_notes?: string
  terms_and_conditions?: string
  /** Preferencia global: mostrar términos en ventas/cotizaciones nuevas. */
  show_terms_conditions?: boolean
  wallet_provider?: string
  wallet_phone?: string
  wallet_qr_url?: string
  wallet_show_on_a4?: boolean
  wallet_show_on_ticket?: boolean
  /** JSON string o array de IDs de cuentas visibles en ticket/PDF. */
  receipt_bank_account_ids?: string | number[]
  detraction_bn_account?: string
  detraction_default_payment_method?: string
}

/** Capacidades resueltas por el backend según el régimen tributario del tenant. */
export interface TenantCapabilities {
  allowed_sale_doc_codes?: string[]
  can_emit_factura?: boolean
  can_emit_boleta?: boolean
  can_emit_nota_credito?: boolean
  can_emit_nota_debito?: boolean
  show_igv_breakdown?: boolean
  default_operation_type?: string
}

export interface SunatConfig {
  sunat_enabled: boolean
  sunat_env_mode?: string
  sunat_sol_user?: string
  tax_rate: number
  igv_regime: string
  tax_benefit_zone: boolean
  /** general | nrus — régimen tributario del contribuyente. */
  taxpayer_regime?: string
  capabilities?: TenantCapabilities
}

/**
 * ¿El tenant puede emitir Factura (01)? Los frontends consumen esta capacidad
 * resuelta por el backend; NO reimplementan reglas del régimen. Default true
 * (retro-compatible: tenants/respuestas sin capabilities se comportan como antes).
 */
export function tenantCanEmitFactura(sunat?: SunatConfig | null): boolean {
  return sunat?.capabilities?.can_emit_factura !== false
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

export interface SeriesDocumentType {
  id: string
  doc_type: string
  label: string
  document_code: string
  category: string
  category_label: string
  series_prefix_hint: string
  electronic: boolean
  sunat_numbering: boolean
  form_selectable?: boolean
  restaurant_form?: boolean
  requires_sunat?: boolean
}

export interface SeriesDocumentTypesResponse {
  types: SeriesDocumentType[]
  categoryLabels: Record<string, string>
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
  can_delete?: boolean
  usage_table?: string
  usage_count?: number
  usage_reason?: string
}

let configInFlight: Promise<CompanyConfig> | null = null

export const companyService = {
  /**
   * Config del tenant. Se cachea al primer fetch (login) y se sirve desde caché;
   * solo consulta al backend si no hay caché o si `force` es true. Las ediciones
   * (updateConfig / uploadLogo / deleteLogo) refrescan el caché.
   */
  getConfig: (opts?: { force?: boolean }): Promise<CompanyConfig> => {
    if (!opts?.force) {
      const cached = getCompanyConfigCache()
      if (cached) {
        // Reintenta el logo si el caché de config existe pero el data URL no
        // (p. ej. tras recargar la app o si el primer intento falló).
        if (!getCompanyLogoDataUrlSync(cached.logo_url)) void ensureCompanyLogoDataUrl(cached.logo_url)
        return Promise.resolve(cached)
      }
      if (configInFlight) return configInFlight
    }
    const req = api
      .get<CompanyConfig>('/api/company/config')
      .then((r) => {
        setCompanyConfigCache(r.data)
        void ensureCompanyLogoDataUrl(r.data.logo_url)
        return r.data
      })
      .finally(() => {
        configInFlight = null
      })
    configInFlight = req
    return req
  },
  updateConfig: (data: Partial<CompanyConfig>) =>
    api.put('/api/company/config', data).then(async (r) => {
      const body = r.data as { data?: CompanyConfig } & Partial<CompanyConfig>
      // Preferir config fresca del servidor (evita UI con datos locales desfasados).
      let fresh: CompanyConfig
      if (body?.data && typeof body.data === 'object') {
        fresh = body.data
      } else {
        try {
          fresh = await companyService.getConfig({ force: true })
        } catch {
          fresh = body as CompanyConfig
        }
      }
      setCompanyConfigCache(fresh)
      void ensureCompanyLogoDataUrl(fresh.logo_url)
      return fresh
    }),
  updateReceiptWallet: (data: {
    wallet_provider: string
    wallet_phone: string
    wallet_qr_url: string
    wallet_show_on_a4: boolean
    wallet_show_on_ticket: boolean
    receipt_bank_account_ids?: number[]
  }) => api.put('/api/company/receipt-wallet', data).then((r) => r.data),

  /** Sube QR a disco del tenant (VPS: volumen /app/uploads). Devuelve URL /uploads/... */
  uploadReceiptWalletQr: (file: File) => {
    const fd = new FormData()
    fd.append('image', file)
    return api
      .post<{ success: boolean; wallet_qr_url: string }>('/api/company/receipt-wallet/qr', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  /** Sube logo a disco del tenant. Devuelve URL /uploads/tenants/{RUC}/company/logo.* */
  uploadLogo: (file: File) => {
    const fd = new FormData()
    fd.append('image', file)
    return api
      .post<{ success: boolean; logo_url: string; data: CompanyConfig }>('/api/company/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => {
        if (r.data?.data) setCompanyConfigCache(r.data.data)
        // Usa el File local para el data URL (sin red ni CORS); si falla, se re-descarga.
        const url = r.data?.logo_url || r.data?.data?.logo_url || ''
        if (url) void setCompanyLogoFromFile(file, url)
        return r.data
      })
  },

  deleteLogo: () =>
    api.delete<{ success: boolean; data: CompanyConfig }>('/api/company/logo').then((r) => {
      if (r.data?.data) setCompanyConfigCache(r.data.data)
      clearCompanyLogoCache()
      return r.data
    }),
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
  listSeriesDocumentTypes: (): Promise<SeriesDocumentTypesResponse> =>
    api.get<{ data: SeriesDocumentType[]; category_labels: Record<string, string> }>('/api/company/series/document-types').then((r) => ({
      types: r.data.data ?? [],
      categoryLabels: r.data.category_labels ?? {},
    })),
  createSeries: (data: { branch_id: number; doc_type: string; series: string; correlative?: number }) =>
    api.post('/api/company/series', data).then((r) => r.data),
  updateSeries: (
    id: number,
    data: {
      series: string
      active: boolean
      doc_type: string
      correlative?: number
    },
  ) => api.put(`/api/company/series/${id}`, data).then((r) => r.data),
  deleteSeries: (id: number) => api.delete(`/api/company/series/${id}`).then((r) => r.data),
}
