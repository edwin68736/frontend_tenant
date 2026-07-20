import api from './api'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

export type ProductCatalogType = 'product' | 'service'

/** Cómo elige el cliente dentro de un grupo del combo. */
export type ComboSelectionType = 'fixed' | 'single' | 'multiple'

export interface ComboGroupItem {
  id?: number
  product_id: number
  default_quantity: number
  max_quantity: number
  /** Sobreprecio de una opción premium (p. ej. cambiar la polera básica: +5.00). */
  extra_price: number
  is_default?: boolean
  sort_order?: number
  /** Datos vivos del componente (solo lectura, los envía el backend). */
  product_name?: string
  product_code?: string
  product_sale_price?: number
  product_image_url?: string
}

export interface ComboGroup {
  id?: number
  name: string
  selection_type: ComboSelectionType
  min_select: number
  max_select: number
  allow_quantity?: boolean
  sort_order?: number
  items: ComboGroupItem[]
}

/** Lo que el cliente eligió en un grupo al comprar el combo. */
export interface ComboSelection {
  group_id: number
  items: { product_id: number; quantity: number }[]
}

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
  /** Es un combo/promoción: agrupa otros productos a un precio fijo. */
  has_combo?: boolean
  combo_groups?: ComboGroup[]
  min_stock: number
  /** Si el producto lleva control de fecha de vencimiento. */
  has_expiry_date?: boolean
  /** YYYY-MM-DD cuando has_expiry_date es true. */
  expiry_date?: string | null
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
  description?: string
  sort_order?: number
  parent_id?: number | null
  product_count?: number
  active?: boolean
}

export interface CreateCategoryInput {
  name: string
  description?: string
  sort_order?: number
}

export interface UpdateCategoryInput {
  name: string
  description?: string
  sort_order?: number
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
  /** Grupos del combo. null/ausente = no tocar; [] = deja de ser combo. */
  combo_groups?: ComboGroup[]
  min_stock?: number
  has_expiry_date?: boolean
  expiry_date?: string | null
  is_restaurant?: boolean
  preparation_area?: string
  /** Solo en alta: cantidad inicial de inventario (requiere manage_stock). */
  initial_stock?: number
  category_id?: number | null
  modifier_group_ids?: number[]
  presentations?: ProductPresentation[]
  /** Solo para edición: enviar para no cambiar el estado activo por defecto */
  active?: boolean
}

export interface ModifierOptionInput {
  name: string
  extra_price?: number
}

export interface ProductPresentation {
  id?: number
  name: string
  sale_price: number
}

/** Respuesta de GET /products/:id (producto + grupos de modificadores asignados) */
export interface ProductDetailResponse {
  data: Product
  modifier_group_ids: number[]
  presentations?: ProductPresentation[]
  /** Presente cuando el producto es un combo. */
  combo_groups?: ComboGroup[]
}

export interface BulkImportItemPayload {
  row_number: number
  name: string
  code?: string
  description?: string
  sale_price: number
  /** Opcional: costo / precio de compra. Si se omite, no se envía (en update se conserva el actual). */
  purchase_price?: number
  unit?: string
  category_name?: string
  igv_affectation_type?: string
  price_includes_igv?: boolean
  manage_stock?: boolean
  initial_stock?: number
  is_restaurant?: boolean
  preparation_area?: string
  type?: string
  /** YYYY-MM-DD; cadena vacía = sin vencimiento. Omitir si la columna no está en el Excel (update conserva el actual). */
  expiry_date?: string
}

export interface BulkImportResultPayload {
  created: number
  updated?: number
  stock_registered: number
  failed: { row: number; name: string; error: string }[]
}

export interface BulkDeleteProductRef {
  id: number
  name: string
}

export interface BulkDeleteBlockedItem {
  id: number
  name: string
  reasons: string[]
}

export interface BulkDeleteProductsResult {
  deleted: BulkDeleteProductRef[]
  blocked: BulkDeleteBlockedItem[]
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
    catalog_type?: ProductCatalogType,
    /** Filtra catálogo/stock por sucursal activa. */
    branch_id?: number,
    /** Oculta los combos. Úselo al elegir componentes: un combo no puede contener otro. */
    exclude_combos?: boolean
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
          ...(branch_id && branch_id > 0 ? { branch_id } : {}),
          ...(exclude_combos ? { exclude_combos: true } : {}),
        },
      })
      .then(r => ({
        data: r.data.data ?? [],
        total: r.data.total ?? 0,
      })),

  /**
   * Solo combos/promociones. El catálogo normal debe pedirse con `excludeCombos` para que
   * no aparezcan mezclados: un combo no se vende como un producto suelto.
   */
  listCombos: (q = '', activeOnly = true) =>
    api
      .get<{ data: Product[] }>('/api/products', {
        params: { q, combos_only: true, active_only: activeOnly },
      })
      .then(r => r.data.data ?? []),

  /** Búsqueda exacta por código de barras (POS / cámara). Variantes EAN-13 / UPC-A en el servidor. */
  lookupByBarcode: (code: string, branchId?: number | null) =>
    api
      .get<{ data: Product }>('/api/products/lookup-by-code', {
        params: {
          code: code.trim(),
          branch_id: branchId && branchId > 0 ? branchId : undefined,
        },
      })
      .then(r => r.data.data ?? null)
      .catch((e: { response?: { status?: number } }) => {
        if (e?.response?.status === 404) return null
        throw e
      }),

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
    api.get<ProductDetailResponse>('/api/products/' + id).then(r => ({
      data: r.data.data,
      modifier_group_ids: r.data.modifier_group_ids ?? [],
      presentations: r.data.presentations ?? [],
      combo_groups: r.data.combo_groups ?? [],
    })),

  bulkImportCatalog: (items: BulkImportItemPayload[], branchId?: number) =>
    api
      .post<{ success: boolean; data: BulkImportResultPayload }>(
        '/api/products/bulk-import/catalog',
        { branch_id: branchId && branchId > 0 ? branchId : undefined, items },
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

  bulkDeleteCatalog: (productIds: number[], reason: string) =>
    api
      .post<BulkDeleteProductsResult>('/api/products/bulk-delete/catalog', {
        product_ids: productIds,
        reason,
      })
      .then((r) => r.data),

  listCategories: (opts?: { withCounts?: boolean }) =>
    api
      .get<{ data: Category[] }>('/api/categories', {
        params: opts?.withCounts ? { with_counts: 'true' } : undefined,
      })
      .then((r) => r.data.data ?? []),

  createCategory: (nameOrInput: string | CreateCategoryInput) => {
    const body: CreateCategoryInput =
      typeof nameOrInput === 'string' ? { name: nameOrInput } : nameOrInput
    return api
      .post<{ data: Category }>('/api/categories', {
        name: body.name,
        description: body.description ?? '',
        ...(body.sort_order != null ? { sort_order: body.sort_order } : {}),
      })
      .then((r) => r.data.data)
  },

  updateCategory: (id: number, input: UpdateCategoryInput) =>
    api
      .put<{ data: Category }>(`/api/categories/${id}`, {
        name: input.name,
        description: input.description ?? '',
        sort_order: input.sort_order ?? 0,
      })
      .then((r) => r.data.data),

  deleteCategory: (id: number) => api.delete(`/api/categories/${id}`).then((r) => r.data),

  listModifierGroups: () =>
    api.get<{ data: ModifierGroup[] }>('/api/modifier-groups').then(r => r.data.data ?? []),

  createModifierGroup: (data: {
    name: string
    required: boolean
    multi_select?: boolean
    options: ModifierOptionInput[] | string[]
  }) =>
    api
      .post<{ group: ModifierGroup }>('/api/modifier-groups', {
        name: data.name,
        required: data.required,
        multi_select: data.multi_select ?? false,
        options: data.options ?? [],
      })
      .then((r) => r.data.group),

  updateModifierGroup: (
    id: number,
    data: { name: string; required: boolean; multi_select?: boolean; options: ModifierOptionInput[] },
  ) =>
    api
      .put<{ group: ModifierGroup }>(`/api/modifier-groups/${id}`, {
        name: data.name,
        required: data.required ?? false,
        multi_select: data.multi_select ?? false,
        options: data.options ?? [],
      })
      .then((r) => r.data.group),

  deleteModifierGroup: (id: number) =>
    api.delete(`/api/modifier-groups/${id}`).then((r) => r.data),

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
