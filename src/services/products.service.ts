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
  unit_id?: number | null
  sale_price: number
  purchase_price: number
  tax_rate: number
  igv_affectation_type: string
  price_includes_igv: boolean
  manage_stock: boolean
  manage_series?: boolean
  has_variants?: boolean
  has_modifiers?: boolean
  /**
   * true/false si viene del catálogo (GET /api/products, batcheado server-side) — el POS lo usa
   * para saber sin red si debe abrir el selector de unidad de venta. undefined solo en productos
   * que NO vienen de ese listado (ej. lookup por código de barras): ahí sigue haciendo falta
   * preguntar con productsService.listSaleUnits, ver addToCart en POSPage.tsx.
   */
  has_sale_units?: boolean
  /** Es un combo/promoción: agrupa otros productos a un precio fijo. */
  has_combo?: boolean
  combo_groups?: ComboGroup[]
  min_stock: number
  /** Si el producto lleva control de fecha de vencimiento. */
  has_expiry_date?: boolean
  /** YYYY-MM-DD cuando has_expiry_date es true. */
  expiry_date?: string | null
  is_restaurant: boolean
  /** Canal de difusión: visible en el Catálogo Digital (tienda virtual pública). Independiente de is_restaurant. */
  show_in_digital_catalog?: boolean
  active: boolean
  category_id: number | null
  category_name?: string
  brand_id: number | null
  brand_name?: string
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

export interface Brand {
  id: number
  name: string
  description?: string
  sort_order?: number
  product_count?: number
  active?: boolean
}

/** Catálogo de unidades de medida (SUNAT N°03) del tenant — gestionable desde Tukifac, usado por
 * el select de unidad en el formulario de producto (Tukifac y Tukichef). is_system=true = fila
 * sembrada por defecto al aprovisionar el tenant (código no editable, ver UpdateUnitInput). */
export interface Unit {
  id: number
  code: string
  name: string
  symbol?: string
  is_system: boolean
  sort_order?: number
  active: boolean
}

export interface CreateUnitInput {
  code: string
  name: string
  symbol?: string
}

export interface UpdateUnitInput {
  code: string
  name: string
  symbol?: string
  active: boolean
}

export interface CreateBrandInput {
  name: string
  description?: string
  sort_order?: number
}

export interface UpdateBrandInput {
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
  /** Fuente de verdad para la unidad del producto (catálogo tenant_units) — unit (texto) se sigue
   * enviando por compatibilidad, pero el backend prioriza unit_id cuando ambos vienen. */
  unit_id?: number | null
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
  /** Canal de difusión: visible en el Catálogo Digital (tienda virtual pública). Independiente de is_restaurant. */
  show_in_digital_catalog?: boolean
  preparation_area?: string
  /** Solo en alta: cantidad inicial de inventario (requiere manage_stock). */
  initial_stock?: number
  category_id?: number | null
  brand_id?: number | null
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
  /** Solo se aplica a filas nuevas (sin id); las existentes se corrigen con "Ajustar stock". */
  initial_stock?: number
}

/** Respuesta de GET /products/:id (producto + grupos de modificadores asignados) */
export interface ProductDetailResponse {
  data: Product
  modifier_group_ids: number[]
  presentations?: ProductPresentation[]
  /** Presente cuando el producto es un combo. */
  combo_groups?: ComboGroup[]
}

/**
 * Unidad de venta comercial de un producto (ej. "Caja x12"), con conversión hacia la unidad base
 * del producto (`Product.unit`). No tiene stock propio — el stock sigue siendo el del producto,
 * en unidad base. Fase 7A: tipo verificado contra `TenantProductSaleUnit`
 * (backend_principal/pkg/database/migrations.go) y el payload real de
 * `/api/products/:id/sale-units*` (backend_principal/internal/products/handler/product_handler.go).
 *
 * IMPORTANTE: NO confundir con `ProductPresentation` — son conceptos distintos (ver
 * FRONTEND_IMPLEMENTATION_PLAN.md, sección 6).
 */
export interface ProductSaleUnit {
  id?: number
  product_id?: number
  name: string
  /**
   * Unidad comercial SUNAT (Catálogo N°03) propia de esta SaleUnit — ej. "Caja" → BX. Mismo patrón
   * que Product.unit_id/unit: unit_id es la fuente de verdad (FK a Unit, ver listUnits), unit es
   * el código ya resuelto por el backend (nunca se envía como texto libre; el backend lo resuelve
   * desde unit_id y lo devuelve). Requerido al crear una SaleUnit nueva; opcional al editar una ya
   * existente (no fuerza a completar retroactivamente las creadas antes de este campo).
   *
   * NUNCA se deriva de `name` ("Caja" no implica BX) ni de `conversion_factor` — son tres datos
   * independientes: nombre comercial, código fiscal y factor de conversión de inventario.
   */
  unit_id?: number | null
  unit?: string
  conversion_factor: number
  /** true = representa 1:1 la unidad base del producto (conversion_factor siempre 1). A lo sumo una por producto. */
  is_base: boolean
  allow_fraction: boolean
  price1: number
  price2?: number | null
  price3?: number | null
  sort_order?: number
  active: boolean
}

/**
 * Override de precio de una SaleUnit para una sucursal puntual. Si no existe uno activo para una
 * sucursal, se usa el precio global de la SaleUnit (ProductSaleUnit.price1/2/3) — ver
 * pkg/saleunit/price.go:ResolvePrice. Nunca se multiplica por conversion_factor.
 */
export interface SaleUnitBranchPrice {
  id?: number
  sale_unit_id?: number
  branch_id: number
  price1: number
  price2?: number | null
  price3?: number | null
  active: boolean
}

/**
 * Atributo descriptivo simple de un producto (ej. "Color" / "Rojo"). Puramente informativo: no
 * genera stock, precio ni conversión — no confundir con SaleUnit ni con ProductPresentation.
 */
export interface ProductAttribute {
  id?: number
  product_id?: number
  name: string
  value: string
  sort_order?: number
  active: boolean
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
  /** Opcional: si viene, busca la marca por nombre (sin distinguir mayúsculas) y la crea si no existe. */
  brand_name?: string
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

export interface BulkPriceUpdateRowPayload {
  row_number: number
  code: string
  /** undefined = no tocar ese precio (columna vacía en el Excel subido). */
  sale_price?: number
  purchase_price?: number
}

export interface BulkPriceUpdateRowResult {
  row_number: number
  code: string
  product_id?: number
  product_name?: string
  status: 'updated' | 'error'
  error?: string
}

export interface BulkPriceUpdateResult {
  rows: BulkPriceUpdateRowResult[]
  updated: number
  errors: number
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
  /**
   * Código libre sugerido para el formulario de alta.
   *
   * SUNAT exige código por línea del comprobante: un producto sin código se guarda bien pero
   * revienta al facturar. Se sugiere uno y el usuario puede reemplazarlo por el suyo.
   */
  nextCode: async (branchId?: number): Promise<string> => {
    const { data } = await api.get<{ code: string }>('/api/products/next-code', {
      params: branchId ? { branch_id: branchId } : undefined,
    })
    return data.code ?? ''
  },

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
    exclude_combos?: boolean,
    brand_id?: number,
    /** Muestra solo los inactivos (en vez de incluirlos junto con los activos). */
    inactive_only?: boolean
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
          ...(brand_id ? { brand_id } : {}),
          ...(inactive_only ? { inactive_only: true } : {}),
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
    /** Solo productos con manage_stock=true (vista de stock actual). */
    manage_stock_only?: boolean
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
          manage_stock_only: params.manage_stock_only,
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

  listBrands: (opts?: { withCounts?: boolean }) =>
    api
      .get<{ data: Brand[] }>('/api/brands', {
        params: opts?.withCounts ? { with_counts: 'true' } : undefined,
      })
      .then((r) => r.data.data ?? []),

  createBrand: (nameOrInput: string | CreateBrandInput) => {
    const body: CreateBrandInput =
      typeof nameOrInput === 'string' ? { name: nameOrInput } : nameOrInput
    return api
      .post<{ data: Brand }>('/api/brands', {
        name: body.name,
        description: body.description ?? '',
        ...(body.sort_order != null ? { sort_order: body.sort_order } : {}),
      })
      .then((r) => r.data.data)
  },

  updateBrand: (id: number, input: UpdateBrandInput) =>
    api
      .put<{ data: Brand }>(`/api/brands/${id}`, {
        name: input.name,
        description: input.description ?? '',
        sort_order: input.sort_order ?? 0,
      })
      .then((r) => r.data.data),

  deleteBrand: (id: number) => api.delete(`/api/brands/${id}`).then((r) => r.data),

  listUnits: (opts?: { all?: boolean }) =>
    api
      .get<{ data: Unit[] }>('/api/units', {
        params: opts?.all ? { all: 'true' } : undefined,
      })
      .then((r) => r.data.data ?? []),

  createUnit: (input: CreateUnitInput) =>
    api
      .post<{ data: Unit }>('/api/units', {
        code: input.code,
        name: input.name,
        symbol: input.symbol ?? '',
      })
      .then((r) => r.data.data),

  updateUnit: (id: number, input: UpdateUnitInput) =>
    api
      .put<{ data: Unit }>(`/api/units/${id}`, {
        code: input.code,
        name: input.name,
        symbol: input.symbol ?? '',
        active: input.active,
      })
      .then((r) => r.data.data),

  deleteUnit: (id: number) => api.delete(`/api/units/${id}`).then((r) => r.data),

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

  /** Activa/desactiva múltiples productos */
  bulkToggle: (productIds: number[]) =>
    api
      .patch<{ success: boolean; updated: number }>('/api/products/bulk-toggle', {
        product_ids: productIds,
      })
      .then(r => r.data),

  /** Actualiza múltiples productos con los campos especificados */
  bulkUpdate: (productIds: number[], updates: {
    active?: boolean
    is_restaurant?: boolean
    show_in_digital_catalog?: boolean
    manage_stock?: boolean
  }) =>
    api
      .patch<{ success: boolean; updated: number }>('/api/products/bulk-update', {
        product_ids: productIds,
        updates,
      })
      .then(r => r.data),

  /** "Actualizar precio" (Productos): sube precio de venta/compra en masa, matcheando por código. */
  bulkUpdatePrices: (branchId: number, rows: BulkPriceUpdateRowPayload[]) =>
    api
      .patch<{ success: boolean; data: BulkPriceUpdateResult }>('/api/products/bulk-update-prices', {
        branch_id: branchId,
        rows,
      })
      .then(r => r.data.data),

  // ---- Unidades de venta (Fase 7B) ----
  // NOTA: GET /api/products/:id NO incluye sale_units (a diferencia de `presentations`, que sí
  // viene incluida) — hay que pedirlas aparte con listSaleUnits. Confirmado en Fase 7A.

  /** Lista las unidades de venta activas del producto. `all: true` incluye las inactivas (admin). */
  listSaleUnits: (productId: number, opts?: { all?: boolean }) =>
    api
      .get<{ data: ProductSaleUnit[] }>(`/api/products/${productId}/sale-units`, {
        params: opts?.all ? { all: 'true' } : undefined,
      })
      .then(r => r.data.data ?? []),

  getSaleUnit: (productId: number, saleUnitId: number) =>
    api.get<{ data: ProductSaleUnit }>(`/api/products/${productId}/sale-units/${saleUnitId}`).then(r => r.data.data),

  createSaleUnit: (productId: number, input: ProductSaleUnit) =>
    api.post<{ data: ProductSaleUnit }>(`/api/products/${productId}/sale-units`, input).then(r => r.data.data),

  updateSaleUnit: (productId: number, saleUnitId: number, input: ProductSaleUnit) =>
    api.put<{ data: ProductSaleUnit }>(`/api/products/${productId}/sale-units/${saleUnitId}`, input).then(r => r.data.data),

  deleteSaleUnit: (productId: number, saleUnitId: number) =>
    api.delete(`/api/products/${productId}/sale-units/${saleUnitId}`).then(r => r.data),

  // ---- Precios por sucursal de una unidad de venta (Fase 7D) ----

  listSaleUnitBranchPrices: (productId: number, saleUnitId: number) =>
    api
      .get<{ data: SaleUnitBranchPrice[] }>(`/api/products/${productId}/sale-units/${saleUnitId}/branch-prices`)
      .then(r => r.data.data ?? []),

  getSaleUnitBranchPrice: (productId: number, saleUnitId: number, branchId: number) =>
    api
      .get<{ data: SaleUnitBranchPrice }>(`/api/products/${productId}/sale-units/${saleUnitId}/branch-prices/${branchId}`)
      .then(r => r.data.data),

  createSaleUnitBranchPrice: (productId: number, saleUnitId: number, branchId: number, input: SaleUnitBranchPrice) =>
    api
      .post<{ data: SaleUnitBranchPrice }>(`/api/products/${productId}/sale-units/${saleUnitId}/branch-prices/${branchId}`, input)
      .then(r => r.data.data),

  updateSaleUnitBranchPrice: (productId: number, saleUnitId: number, branchId: number, input: SaleUnitBranchPrice) =>
    api
      .put<{ data: SaleUnitBranchPrice }>(`/api/products/${productId}/sale-units/${saleUnitId}/branch-prices/${branchId}`, input)
      .then(r => r.data.data),

  deleteSaleUnitBranchPrice: (productId: number, saleUnitId: number, branchId: number) =>
    api.delete(`/api/products/${productId}/sale-units/${saleUnitId}/branch-prices/${branchId}`).then(r => r.data),

  // ---- Atributos descriptivos (Fase 7C) ----
  // NOTA: igual que sale_units, GET /api/products/:id NO incluye attributes — pedirlas aparte.

  /** Lista los atributos activos del producto. `all: true` incluye los inactivos (admin). */
  listAttributes: (productId: number, opts?: { all?: boolean }) =>
    api
      .get<{ data: ProductAttribute[] }>(`/api/products/${productId}/attributes`, {
        params: opts?.all ? { all: 'true' } : undefined,
      })
      .then(r => r.data.data ?? []),

  getAttribute: (productId: number, attributeId: number) =>
    api.get<{ data: ProductAttribute }>(`/api/products/${productId}/attributes/${attributeId}`).then(r => r.data.data),

  createAttribute: (productId: number, input: ProductAttribute) =>
    api.post<{ data: ProductAttribute }>(`/api/products/${productId}/attributes`, input).then(r => r.data.data),

  updateAttribute: (productId: number, attributeId: number, input: ProductAttribute) =>
    api.put<{ data: ProductAttribute }>(`/api/products/${productId}/attributes/${attributeId}`, input).then(r => r.data.data),

  deleteAttribute: (productId: number, attributeId: number) =>
    api.delete(`/api/products/${productId}/attributes/${attributeId}`).then(r => r.data),
}

/** Devuelve la URL absoluta de la imagen del producto (backend guarda rutas relativas). */
export function getProductImageUrl(url: string | null | undefined): string {
  return resolvePublicAssetUrl(url)
}
