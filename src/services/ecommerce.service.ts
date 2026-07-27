import api from './api'
import type { ProductReportRow } from './products.service'
import type { PrintData } from '@/types/printData'

export interface EcommerceSettings {
  id: number
  enabled: boolean
  store_name: string
  tagline: string
  description: string
  logo_url: string
  background_image_url: string
  whatsapp_number: string | null
  template_key: string
  primary_color: string
  secondary_color: string
  font_family: string
  card_style: string
  category_style: string
}

export interface EcommerceSettingsResponse {
  data: EcommerceSettings
  resolved_whatsapp_number: string
}

export interface UpdateEcommerceSettingsInput {
  enabled?: boolean
  store_name?: string
  tagline?: string
  description?: string
  /** "" = volver a heredar el teléfono general de la empresa. */
  whatsapp_number?: string
  template_key?: string
  primary_color?: string
  secondary_color?: string
  font_family?: string
  card_style?: string
  category_style?: string
}

export interface EcommerceSlider {
  id: number
  image_url: string
  link_url: string
  title: string
  subtitle: string
  button_text: string
  sort_order: number
  active: boolean
}

export interface SliderTextInput {
  linkUrl?: string
  title?: string
  subtitle?: string
  buttonText?: string
}

export interface EcommerceOrderItem {
  product_id: number
  name: string
  quantity: number
  unit_price: number
}

export interface EcommerceOrder {
  id: number
  customer_name: string
  customer_phone: string
  items_json: string
  total: number
  status: 'nuevo' | 'atendido' | 'cerrado' | 'cancelado'
  notes: string
  converted_sale_id: number | null
  converted_at: string | null
  created_at: string
}

export type EcommerceOrderConvertTarget = 'nota_venta' | '01' | '03'

export interface ConvertOrderInput {
  target: EcommerceOrderConvertTarget
  series_id: number
  branch_id: number
  issue_date?: string
  contact_id?: number | null
}

export const ecommerceService = {
  // ── Admin: ajustes ───────────────────────────────────────────────
  getSettings: () => api.get<EcommerceSettingsResponse>('/api/ecommerce/settings').then(r => r.data),

  updateSettings: (input: UpdateEcommerceSettingsInput) =>
    api.put<EcommerceSettingsResponse>('/api/ecommerce/settings', input).then(r => r.data),

  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api
      .post<{ logo_url: string }>('/api/ecommerce/settings/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.logo_url)
  },

  uploadBackground: (file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api
      .post<{ background_image_url: string }>('/api/ecommerce/settings/background', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.background_image_url)
  },

  // ── Admin: sliders ───────────────────────────────────────────────
  listSliders: () => api.get<{ data: EcommerceSlider[] }>('/api/ecommerce/sliders').then(r => r.data.data ?? []),

  createSlider: (file: File, text?: SliderTextInput) => {
    const form = new FormData()
    form.append('image', file)
    if (text?.linkUrl) form.append('link_url', text.linkUrl)
    if (text?.title) form.append('title', text.title)
    if (text?.subtitle) form.append('subtitle', text.subtitle)
    if (text?.buttonText) form.append('button_text', text.buttonText)
    return api
      .post<{ data: EcommerceSlider }>('/api/ecommerce/sliders', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.data)
  },

  updateSlider: (id: number, input: { link_url?: string; title?: string; subtitle?: string; button_text?: string; active?: boolean }) =>
    api.put(`/api/ecommerce/sliders/${id}`, input).then(r => r.data),

  deleteSlider: (id: number) => api.delete(`/api/ecommerce/sliders/${id}`).then(r => r.data),

  reorderSliders: (ids: number[]) => api.post('/api/ecommerce/sliders/reorder', { ids }).then(r => r.data),

  // ── Admin: pedidos web ───────────────────────────────────────────
  listOrders: (status?: string) =>
    api
      .get<{ data: EcommerceOrder[] }>('/api/ecommerce/orders', { params: status ? { status } : {} })
      .then(r => r.data.data ?? []),

  updateOrderStatus: (id: number, status: EcommerceOrder['status']) =>
    api.put(`/api/ecommerce/orders/${id}/status`, { status }).then(r => r.data),

  getOrderPrintData: (id: number) =>
    api.get<{ print_data: PrintData }>(`/api/ecommerce/orders/${id}/print-data`).then(r => r.data.print_data),

  convertOrder: (id: number, body: ConvertOrderInput) =>
    api
      .post<{ sale: import('./sales.service').Sale; print_data?: PrintData }>(`/api/ecommerce/orders/${id}/convert`, body)
      .then(r => r.data),
}

// ── Público (tienda virtual, sin login) ────────────────────────────

export interface PublicStoreSettings {
  store_name: string
  tagline: string
  description: string
  logo_url: string
  background_image_url: string
  whatsapp_number: string
  template_key: string
  primary_color: string
  secondary_color: string
  font_family: string
  card_style: string
  category_style: string
  sliders: EcommerceSlider[]
}

export interface PublicCategory {
  id: number
  name: string
}

export const publicEcommerceService = {
  getSettings: () => api.get<PublicStoreSettings>('/api/public/ecommerce/settings').then(r => r.data),

  listCategories: () =>
    api.get<{ data: PublicCategory[] }>('/api/public/ecommerce/categories').then(r => r.data.data ?? []),

  getPriceBounds: () =>
    api.get<{ min: number; max: number }>('/api/public/ecommerce/price-bounds').then(r => r.data),

  listProducts: (params: { q?: string; category_id?: number; min_price?: number; max_price?: number; page?: number; per_page?: number }) =>
    api
      .get<{ data: ProductReportRow[]; total?: number }>('/api/public/ecommerce/products', { params })
      .then(r => ({ data: r.data.data ?? [], total: r.data.total ?? 0 })),

  createOrder: (input: { customer_name?: string; customer_phone?: string; items: EcommerceOrderItem[] }) =>
    api
      .post<{ order_number: number }>('/api/public/ecommerce/orders', input)
      .then(r => r.data.order_number),
}
