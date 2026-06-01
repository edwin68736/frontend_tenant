import api from './api'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

export type ProductCatalogType = 'product' | 'service'

export interface Product {
  id: number
  code: string
  name: string
  description?: string
  image_url?: string | null
  /** product = bien con inventario posible; service = prestación (unidad ZZ, sin stock). */
  type?: ProductCatalogType
  unit: string
  sale_price: number
  purchase_price: number
  tax_rate: number
  igv_affectation_type: string
  price_includes_igv: boolean
  manage_stock: boolean
  manage_series?: boolean
  has_variants?: boolean
  has_modifiers?: boolean
  min_stock: number
  is_restaurant: boolean
  active: boolean
  category_id: number | null
  category_name?: string
  preparation_area?: string
}

/** Fila enriquecida cuando GET /api/products se llama con report=1 */
export interface ProductReportRow extends Product {
  stock_total: number
  stock_by_branch: { branch_id: number; branch_name: string; quantity: number }[]
  serials: string[]
  serial_count: number
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
}

export interface ModifierGroup {
  id: number
  name: string
  required: boolean
  multi_select?: boolean
  options: ModifierOption[]
}

export interface ModifierOption {
  id: number
  name: string
  extra_price?: number
}

export interface CreateProductInput {
  code?: string
  name: string
  type?: ProductCatalogType
  description?: string
  image_url?: string
  unit: string
  sale_price: number
  purchase_price?: number
  igv_affectation_type: string
  price_includes_igv: boolean
  manage_stock: boolean
  manage_series?: boolean
  has_variants?: boolean
  has_modifiers?: boolean
  min_stock?: number
  is_restaurant?: boolean
  preparation_area?: string
  category_id?: number | null
  modifier_group_ids?: number[]
  /** Solo para edición: enviar para no cambiar el estado activo por defecto */
  active?: boolean
}

/** Respuesta de GET /products/:id (producto + grupos de modificadores asignados) */
export interface ProductDetailResponse {
  data: Product
  modifier_group_ids: number[]
}

export interface BulkImportItemPayload {
  row_number: number
  name: string
  code?: string
  description?: string
  sale_price: number
  unit?: string
  category_name?: string
  igv_affectation_type?: string
  price_includes_igv?: boolean
  manage_stock?: boolean
  initial_stock?: number
  is_restaurant?: boolean
  preparation_area?: string
  type?: string
}

export interface BulkImportResultPayload {
  created: number
  updated?: number
  stock_registered: number
  failed: { row: number; name: string; error: string }[]
}

export const productsService = {
  /** Lista productos. Con per_page se usa paginación en backend y se devuelve total. manage_stock_only para transferencias/inventario. */
  list: (
    q = '',
    category_id?: number,
    restaurant_only?: boolean,
    active_only: boolean = true,
    page?: number,
    per_page?: number,
    manage_stock_only?: boolean,
    /** Filtra por tipo en catálogo (product | service). Sin valor: todos. */
    catalog_type?: ProductCatalogType
  ) =>
    api
      .get<{ data: Product[]; total?: number }>('/api/products', {
        params: {
          q,
          category_id,
          restaurant_only,
          active_only,
          page,
          per_page,
          manage_stock_only,
          type: catalog_type,
        },
      })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? 0,
      })),

  /** Listado para reportes: stock por sucursal, series, categoría resuelta. */
  listReport: (params: {
    q?: string
    category_id?: number
    branch_id?: number
    active_only?: boolean
    page?: number
    per_page?: number
    stock_less_than?: number
  }) =>
    api
      .get<{ data: ProductReportRow[]; total?: number }>('/api/products', {
        params: {
          q: params.q,
          category_id: params.category_id,
          branch_id: params.branch_id,
          active_only: params.active_only ?? true,
          page: params.page,
          per_page: params.per_page,
          stock_less_than: params.stock_less_than,
          report: true,
        },
      })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? 0,
      })),

  get: (id: number) =>
    api.get<ProductDetailResponse>('/api/products/' + id).then(r => ({ data: r.data.data, modifier_group_ids: r.data.modifier_group_ids ?? [] })),

  bulkImportCatalog: (items: BulkImportItemPayload[]) =>
    api
      .post<{ success: boolean; data: BulkImportResultPayload }>(
        '/api/products/bulk-import/catalog',
        { items },
      )
      .then((r) => r.data.data),

  create: (data: CreateProductInput) =>
    api.post<{ data: Product }>('/api/products', data).then(r => r.data.data),

  update: (id: number, data: Partial<CreateProductInput>) =>
    api.put(`/api/products/${id}`, data).then(r => r.data),

  toggle: (id: number) =>
    api.patch(`/api/products/${id}/toggle`).then(r => r.data),

  delete: (id: number) =>
    api.delete(`/api/products/${id}`).then(r => r.data),

  listCategories: () =>
    api.get<{ data: Category[] }>('/api/categories').then(r => r.data.data ?? []),

  createCategory: (name: string, parent_id?: number) =>
    api.post<{ data: Category }>('/api/categories', { name, parent_id }).then(r => r.data.data),

  listModifierGroups: () =>
    api.get<{ data: ModifierGroup[] }>('/api/modifier-groups').then(r => r.data.data ?? []),

  /** Crea un grupo de modificadores. options: nombres de las opciones (el backend puede no soportar extra_price en create). */
  createModifierGroup: (data: { name: string; required: boolean; multi_select?: boolean; options: string[] }) =>
    api.post<{ group: ModifierGroup }>('/api/modifier-groups', {
      name: data.name,
      required: data.required,
      multi_select: data.multi_select ?? false,
      options: data.options,
    }).then(r => r.data),

  /** Lista números de serie del producto (todas las sucursales) para el detalle. */
  getSerials: (productId: number) =>
    api.get<{ data: { id: number; serial: string; branch_id: number; status: string }[] }>(`/api/products/${productId}/serials`).then(r => r.data.data ?? []),

  /** Sube una imagen al backend y devuelve la URL relativa (ej. /uploads/tenants/{RUC}/products/xxx.jpg). */
  uploadImage: (productId: number, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api
      .post<{ image_url: string }>(`/api/products/${productId}/image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.image_url)
  },
}

/** Devuelve la URL absoluta de la imagen del producto (backend guarda rutas relativas). */
export function getProductImageUrl(url: string | null | undefined): string {
  return resolvePublicAssetUrl(url)
}
