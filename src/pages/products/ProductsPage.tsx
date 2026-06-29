import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Pencil, Search, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Settings2, Package, Upload, Layers, RefreshCw, FileSpreadsheet } from 'lucide-react'
import { ProductImportModal } from '@/components/products/ProductImportModal'
import { productsService, getProductImageUrl, type Product, type Category, type CreateProductInput, type ModifierGroup, type ProductCatalogType } from '@/services/products.service'
import { PRODUCT_UNIT_FORM_OPTIONS, productUnitFormDisplayName, isProductUnitFormCode } from '@/constants/sunatUnits'
import { inventoryService, type StockByBranch } from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect, MIN_OPTIONS_FOR_SEARCH } from '@/components/ui/SearchSelect'

const IGV_TYPES = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
]

/** Código interno de 6 caracteres (letras A–Z y dígitos); el valor se puede sustituir manualmente. */
function generateRandomProductCode(length = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < length; i++) s += chars[bytes[i]! % chars.length]
  return s
}

/** Solo los tipos gravados (10, 11-17) aplican IGV; Exonerado/Inafecto/Exportación no. */
function isGravadoIgv(code: string): boolean {
  const c = String(code || '').trim()
  if (c === '20' || c === '21' || c === '30' || c === '31' || c === '32' || c === '33' || c === '34' || c === '35' || c === '36' || c === '40') return false
  return true
}

function emptyForm(pageMode: ProductCatalogType): CreateProductInput {
  if (pageMode === 'service') {
    return {
      name: '',
      type: 'service',
      unit: 'ZZ',
      sale_price: 0,
      purchase_price: 0,
      igv_affectation_type: '10',
      price_includes_igv: true,
      manage_stock: false,
      min_stock: 0,
      is_restaurant: false,
      category_id: null,
      code: '',
      description: '',
      image_url: '',
      manage_series: false,
      has_variants: false,
      has_modifiers: false,
      modifier_group_ids: [],
    }
  }
  return {
    name: '',
    type: 'product',
    unit: 'NIU',
    sale_price: 0,
    purchase_price: 0,
    igv_affectation_type: '10',
    price_includes_igv: true,
    manage_stock: true,
    min_stock: 0,
    is_restaurant: false,
    preparation_area: '',
    category_id: null,
    code: '',
    description: '',
    image_url: '',
    manage_series: false,
    has_variants: false,
    has_modifiers: false,
    modifier_group_ids: [],
    initial_stock: undefined,
  }
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const PREPARATION_AREAS = [
  { value: '', label: 'Sin área' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'bar', label: 'Bar' },
  { value: 'barra', label: 'Barra' },
  { value: 'postres', label: 'Postres' },
  { value: 'otro', label: 'Otro' },
] as const

type AdvancedTab = 'datos' | 'modificadores' | 'stock'

export default function ProductsPage() {
  return (
    <RequireModule moduleKey="products">
      <ProductsContent pageMode="product" />
    </RequireModule>
  )
}

export function ProductsContent({ pageMode }: { pageMode: ProductCatalogType }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  /** Texto enviado al listado: solo con 2+ caracteres; con 0–1 no filtra por nombre/código. */
  const listSearchQuery = useMemo(() => {
    const t = q.trim()
    return t.length < 2 ? '' : t
  }, [q])
  const [catFilter, setCatFilter] = useState<number | undefined>()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [show, setShow] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<CreateProductInput>(() => emptyForm(pageMode))
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const catInputRef = useRef<HTMLInputElement>(null)

  // Modal grupos de modificadores
  const [showModifierGroups, setShowModifierGroups] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [newGroupMultiSelect, setNewGroupMultiSelect] = useState(false)
  const [newGroupOptionsText, setNewGroupOptionsText] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  // Panel avanzado
  const [panelProduct, setPanelProduct] = useState<Product | null>(null)
  const [panelTab, setPanelTab] = useState<AdvancedTab>('datos')
  const [panelDetail, setPanelDetail] = useState<{ data: Product; modifier_group_ids: number[] } | null>(null)
  const [panelSerials, setPanelSerials] = useState<{ serial: string; branch_id: number; status: string }[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [stockRows, setStockRows] = useState<StockByBranch[]>([])
  const [panelLoading, setPanelLoading] = useState(false)

  // Stock en lista (total por producto) y modal de ajuste
  const [stockByProductId, setStockByProductId] = useState<Record<string, number>>({})
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)

  const load = () => {
    setLoading(true)
    return productsService
      .list(listSearchQuery, catFilter, undefined, !includeInactive, page, perPage, undefined, pageMode)
      .then(({ data: p, total: t }) => {
        setProducts(p ?? [])
        setTotal(t ?? 0)
        return (p ?? []) as Product[]
      })
      .then(productsList =>
        Promise.all([
          productsService.listCategories(),
          productsService.listModifierGroups(),
          productsList.filter(x => x.manage_stock).length > 0
            ? inventoryService.getStockSummary(productsList.filter(x => x.manage_stock).map(x => x.id)).catch(() => ({}))
            : Promise.resolve({} as Record<string, number>),
        ]) as Promise<[Category[], ModifierGroup[], Record<string, number>]>
      )
      .then(([categoriesList, modifierGroupsList, summary]) => {
        setCategories(categoriesList ?? [])
        setModifierGroups(modifierGroupsList ?? [])
        setStockByProductId(summary ?? {})
      })
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [listSearchQuery, catFilter, includeInactive, page, perPage, pageMode])

  // Refrescar lista y stock al volver a la pestaña (ej. tras hacer transferencias)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [listSearchQuery, catFilter, includeInactive, page, perPage, pageMode])

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyForm(pageMode), code: generateRandomProductCode() })
    setShowMoreOptions(false)
    setShow(true)
  }

  const openEdit = async (p: Product) => {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      type: (p.type as ProductCatalogType | undefined) ?? pageMode,
      unit: p.unit,
      sale_price: p.sale_price,
      purchase_price: p.purchase_price ?? 0,
      igv_affectation_type: p.igv_affectation_type,
      price_includes_igv: p.price_includes_igv,
      manage_stock: p.manage_stock,
      min_stock: p.min_stock ?? 0,
      is_restaurant: p.is_restaurant ?? false,
      preparation_area: p.preparation_area ?? '',
      category_id: p.category_id,
      description: p.description ?? '',
      image_url: p.image_url ?? '',
      manage_series: p.manage_series ?? false,
      has_variants: p.has_variants ?? false,
      has_modifiers: p.has_modifiers ?? false,
      modifier_group_ids: [],
      active: p.active,
    })
    setShow(true)
    setShowMoreOptions(false)
    try {
      const detail = await productsService.get(p.id)
      setForm(f => ({
        ...f,
        modifier_group_ids: detail.modifier_group_ids ?? [],
        preparation_area: detail.data.preparation_area ?? '',
      }))
    } catch {
      // Si GET /products/:id falla (ej. backend en otro puerto), los datos ya vienen del listado
    }
  }

  const setF = (k: keyof CreateProductInput, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    try {
      const cat = await productsService.createCategory(newCatName.trim())
      if (!cat?.id) { toast.error('Error creando categoría'); return }
      setCategories(c => [...c, cat])
      setF('category_id', cat.id)
      setNewCatName('')
      setAddingCat(false)
      toast.success('Categoría creada')
    } catch { toast.error('Error creando categoría') }
  }

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editing) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (JPG, PNG o WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar 5 MB')
      return
    }
    setUploadingImage(true)
    e.target.value = ''
    try {
      const imageUrl = await productsService.uploadImage(editing.id, file)
      setF('image_url', imageUrl)
      toast.success('Imagen subida')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Error subiendo imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return }
    const payload: CreateProductInput = { ...form, type: pageMode === 'service' ? 'service' : 'product' }
    if (pageMode === 'service' || payload.type === 'service') {
      payload.type = 'service'
      payload.unit = 'ZZ'
      payload.purchase_price = 0
      payload.manage_stock = false
      payload.manage_series = false
      payload.has_variants = false
      payload.has_modifiers = false
      payload.is_restaurant = false
      payload.min_stock = 0
      payload.modifier_group_ids = []
    }
    if (!isGravadoIgv(form.igv_affectation_type)) payload.price_includes_igv = false
    if (!payload.is_restaurant) payload.preparation_area = ''
    else if (payload.preparation_area) payload.preparation_area = payload.preparation_area.trim().toLowerCase()
    if (editing) {
      delete payload.initial_stock
    } else if (!payload.manage_stock || !(payload.initial_stock != null && payload.initial_stock > 0)) {
      delete payload.initial_stock
    }
    setSaving(true)
    try {
      if (editing) await productsService.update(editing.id, payload)
      else await productsService.create(payload)
      toast.success(editing ? 'Producto actualizado' : 'Producto creado')
      setShow(false)
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (p: Product) => {
    try { await productsService.toggle(p.id); load() }
    catch { toast.error('Error') }
  }

  const handleCreateModifierGroup = async () => {
    const name = newGroupName.trim()
    if (!name) { toast.error('Nombre del grupo requerido'); return }
    const options = newGroupOptionsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (options.length === 0) { toast.error('Agrega al menos una opción (una por línea)'); return }
    setSavingGroup(true)
    try {
      await productsService.createModifierGroup({ name, required: newGroupRequired, multi_select: newGroupMultiSelect, options })
      toast.success('Grupo creado')
      setNewGroupName('')
      setNewGroupOptionsText('')
      setNewGroupRequired(false)
      setNewGroupMultiSelect(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al crear grupo')
    } finally {
      setSavingGroup(false)
    }
  }

  const openPanel = async (p: Product) => {
    setPanelProduct(p)
    setPanelTab('datos')
    setPanelDetail(null)
    setPanelSerials([])
    setStockRows([])
    setPanelLoading(true)
    try {
      const [detail, b, stock, serials] = await Promise.all([
        productsService.get(p.id),
        companyService.listBranches(),
        p.manage_stock ? inventoryService.getStock(p.id) : Promise.resolve([]),
        p.manage_series ? productsService.getSerials(p.id) : Promise.resolve([]),
      ])
      setPanelDetail(detail)
      setBranches(b ?? [])
      setStockRows(Array.isArray(stock) ? stock : [])
      setPanelSerials(Array.isArray(serials) ? serials : [])
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setPanelLoading(false)
    }
  }

  const branchName = (id: number) => branches.find(b => b.id === id)?.name ?? `Sucursal ${id}`

  const categoryField = (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-600">Categoría</label>
        <button type="button" onClick={() => { setAddingCat(true); setTimeout(() => catInputRef.current?.focus(), 50) }} className="text-xs text-[rgb(var(--p600))] hover:underline">+ Nueva</button>
      </div>
      {addingCat ? (
        <div className="flex gap-1">
          <input ref={catInputRef} className="flex-1 border border-[rgb(var(--p300))] rounded-xl px-2 py-1.5 text-sm" placeholder="Nombre categoría" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setAddingCat(false) }} />
          <button type="button" onClick={handleAddCategory} className="px-2 py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-xs">OK</button>
        </div>
      ) : categories.filter(Boolean).length >= MIN_OPTIONS_FOR_SEARCH ? (
        <SearchSelect
          options={categories.filter(Boolean).map(c => ({ value: String(c.id), label: c.name }))}
          value={String(form.category_id ?? '')}
          onChange={(v) => setF('category_id', v ? Number(v) : null)}
          placeholder="Sin categoría"
        />
      ) : (
        <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={form.category_id ?? ''} onChange={e => setF('category_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Sin categoría</option>
          {categories.filter(Boolean).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {pageMode === 'service' ? 'Servicios' : 'Productos'}
          </h2>
          <p className="text-sm text-gray-500">
            {pageMode === 'service'
              ? 'Prestaciones sin control de stock (unidad SUNAT ZZ). Para bienes use Productos.'
              : 'Catálogo de bienes; los servicios se administran en Inventario → Servicios.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pageMode === 'product' && (
            <>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                <FileSpreadsheet size={15} /> Importar Excel
              </button>
              <button
                type="button"
                onClick={() => setShowModifierGroups(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-[rgb(var(--p300))] text-[rgb(var(--p700))] rounded-xl text-sm font-medium hover:bg-[rgb(var(--p50))]"
              >
                <Layers size={15} /> Grupos de modificadores
              </button>
            </>
          )}
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> {pageMode === 'service' ? 'Nuevo servicio' : 'Nuevo producto'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder={pageMode === 'service' ? 'Buscar servicio… (mín. 2 caracteres)' : 'Buscar producto… (mín. 2 caracteres)'}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        {categories.filter(Boolean).length >= MIN_OPTIONS_FOR_SEARCH ? (
          <SearchSelect
            options={categories.filter(Boolean).map(c => ({ value: String(c.id), label: c.name }))}
            value={String(catFilter ?? '')}
            onChange={(v) => setCatFilter(v ? Number(v) : undefined)}
            placeholder="Todas las categorías"
          />
        ) : (
          <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={catFilter ?? ''} onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Todas las categorías</option>
            {categories.filter(Boolean).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 cursor-pointer px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} className="rounded" />
          Incluir inactivos
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
          >
            {PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[200px]">
        {loading && (
          <div
            className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {(
                pageMode === 'service'
                  ? (['Código', 'Servicio', 'Categoría', 'Precio venta', 'IGV', 'Estado', ''] as const)
                  : (['Código', 'Producto', 'Categoría', 'Precio venta', 'IGV', 'Stock', 'Modif.', 'Estado', ''] as const)
              ).map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.code || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(var(--p50))] flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image_url ? (
                        <img
                          src={getProductImageUrl(p.image_url)}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs font-bold text-[rgb(var(--p400))]">
                          {p.name?.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-gray-500 truncate">{p.description}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.category_name ?? categories.find((c) => c.id === p.category_id)?.name ?? '-'}
                </td>
                <td className="px-4 py-3 font-semibold text-gray-800">S/ {Number(p.sale_price).toFixed(2)}</td>
                <td className="px-4 py-3"><span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{p.igv_affectation_type}</span></td>
                {pageMode === 'product' && (
                  <>
                    <td className="px-4 py-3">
                      {p.manage_stock ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-800">
                            {typeof stockByProductId[p.id] === 'number' ? stockByProductId[p.id] : '—'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAdjustmentProduct(p)}
                            className="text-xs px-2 py-1 rounded-lg border border-[rgb(var(--p300))] text-[rgb(var(--p700))] hover:bg-[rgb(var(--p50))]"
                          >
                            Ajustar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No controla stock</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(p as Product).has_modifiers ? (
                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Modificadores</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </>
                )}
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.active ? 'Activo' : 'Inactivo'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => handleToggle(p)} className="p-1.5 rounded-lg" title="Activar/Desactivar">
                      {p.active ? <ToggleRight size={16} className="text-green-600 hover:bg-green-50" /> : <ToggleLeft size={16} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100" />}
                    </button>
                    <button onClick={() => openEdit(p)} className="p-1.5 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg" title="Editar"><Pencil size={14} /></button>
                    <button onClick={() => openPanel(p)} className="p-1.5 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg" title="Administrar"><Settings2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {products.length === 0 && !loading && (
          <div className="text-center py-10 text-gray-400 text-sm">
            {pageMode === 'service' ? 'No se encontraron servicios' : 'No se encontraron productos'}
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-1">
          <p className="text-sm text-gray-600">
            Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}{' '}
            {pageMode === 'service' ? 'servicios' : 'productos'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {page} de {Math.max(1, Math.ceil(total / perPage))}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(Math.ceil(total / perPage), p + 1))}
              disabled={page >= Math.ceil(total / perPage)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={show} onClose={() => setShow(false)} closeOnBackdropClick={false}>
        <h3 className="font-bold text-gray-800">
          {pageMode === 'service'
            ? editing
              ? 'Editar servicio'
              : 'Nuevo servicio'
            : editing
              ? 'Editar producto'
              : 'Nuevo producto'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[rgb(var(--p200))] focus-within:border-[rgb(var(--p400))]">
              <input
                className="flex-1 min-w-0 px-3 py-2 text-sm font-mono border-0 outline-none bg-transparent"
                placeholder="Ej. A3K9Z1"
                value={form.code ?? ''}
                onChange={(e) => setF('code', e.target.value)}
                aria-label="Código de producto"
              />
              <button
                type="button"
                title="Generar otro código"
                aria-label="Generar otro código"
                className="shrink-0 px-2.5 border-l border-gray-200 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] active:bg-[rgb(var(--p100))] transition-colors"
                onClick={() => setF('code', generateRandomProductCode())}
              >
                <RefreshCw size={16} strokeWidth={2} className="mx-auto" />
              </button>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={form.name} onChange={e => setF('name', e.target.value)} />
          </div>
        </div>
        {pageMode === 'product' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.unit}
                onChange={(e) => setF('unit', e.target.value)}
              >
                {form.unit && !isProductUnitFormCode(form.unit) && (
                  <option value={form.unit}>{productUnitFormDisplayName(form.unit)}</option>
                )}
                {PRODUCT_UNIT_FORM_OPTIONS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
            {categoryField}
          </div>
        ) : (
          categoryField
        )}
        <div className={pageMode === 'service' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Precio venta *</label>
            <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={form.sale_price} onChange={e => setF('sale_price', Math.max(0, Number(e.target.value) || 0))} />
          </div>
          {pageMode === 'product' && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Precio compra</label>
              <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={form.purchase_price ?? 0} onChange={e => setF('purchase_price', Math.max(0, Number(e.target.value) || 0))} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo afectación IGV</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={form.igv_affectation_type} onChange={e => {
              const v = e.target.value
              setF('igv_affectation_type', v)
              if (!isGravadoIgv(v)) setF('price_includes_igv', false)
            }}>
              {IGV_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          {isGravadoIgv(form.igv_affectation_type) && (
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer py-2">
                <div onClick={() => setF('price_includes_igv', !form.price_includes_igv)} className={`w-10 h-5 rounded-full transition-colors ${form.price_includes_igv ? 'bg-[rgb(var(--p500))]' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${form.price_includes_igv ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-gray-600">Precio incluye IGV</span>
              </label>
            </div>
          )}
        </div>
        {pageMode === 'product' && (
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.manage_stock} onChange={(e) => {
                const on = e.target.checked
                setF('manage_stock', on)
                if (!on) setForm((f) => ({ ...f, manage_stock: false, initial_stock: undefined }))
              }} className="rounded" />
              <span className="text-sm text-gray-700">Maneja stock</span>
            </label>
            {form.manage_stock && (
              <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Stock mín:</span>
                <input
                  type="number"
                  min={0}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                  value={form.min_stock ?? 0}
                  onChange={(e) => setF('min_stock', Number(e.target.value))}
                />
              </div>
              {!editing && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-gray-600 shrink-0">Stock inicial:</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    value={form.initial_stock != null ? form.initial_stock : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      setF('initial_stock', raw === '' ? undefined : Math.max(0, Number(raw) || 0))
                    }}
                    placeholder="0"
                  />
                </div>
              )}
              </>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_restaurant ?? false} onChange={(e) => setF('is_restaurant', e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-700">Producto de restaurante</span>
            </label>
            {form.is_restaurant && (
              <div className="flex items-center gap-2 min-w-[10rem]">
                <span className="text-xs text-gray-600 shrink-0">Área prep.:</span>
                <select
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1 min-w-0"
                  value={form.preparation_area ?? ''}
                  onChange={(e) => setF('preparation_area', e.target.value)}
                >
                  {PREPARATION_AREAS.map((a) => (
                    <option key={a.value || 'none'} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Más opciones (colapsable) — solo catálogo de productos */}
        {pageMode === 'product' && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowMoreOptions(!showMoreOptions)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">
            <span className="font-medium">Más opciones</span>
            {showMoreOptions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {showMoreOptions && (
            <div className="px-3 pb-3 pt-0 space-y-3 border-t border-gray-100">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" rows={2} value={form.description ?? ''} onChange={e => setF('description', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Imagen del producto</label>
                {editing ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleUploadImage}
                        disabled={uploadingImage}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgb(var(--p300))] rounded-xl text-xs font-medium text-[rgb(var(--p700))] hover:bg-[rgb(var(--p50))] disabled:opacity-50"
                      >
                        {uploadingImage ? (
                          <span className="animate-pulse">Subiendo...</span>
                        ) : (
                          <><Upload size={12} /> Subir imagen</>
                        )}
                      </button>
                      <span className="text-[11px] text-gray-400">JPG, PNG o WebP · máx. 5 MB</span>
                    </div>
                    {(form.image_url ?? '') && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                          <img src={getProductImageUrl(form.image_url)} alt="Vista previa" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-xs text-gray-500">Imagen actual</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Guarda el producto y luego edítalo para subir una imagen.</p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.manage_series ?? false} onChange={e => setF('manage_series', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Maneja series/lotes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.has_variants ?? false} onChange={e => setF('has_variants', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Tiene variantes (ej. talla, color)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.has_modifiers ?? false} onChange={e => setF('has_modifiers', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Tiene modificadores</span>
              </label>
              {form.has_modifiers && modifierGroups.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Grupos de modificadores</label>
                  <div className="flex flex-wrap gap-2">
                    {modifierGroups.map(g => (
                      <label key={g.id} className="inline-flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-lg text-xs cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={(form.modifier_group_ids ?? []).includes(g.id)} onChange={e => {
                          const ids = form.modifier_group_ids ?? []
                          setF('modifier_group_ids', e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id))
                        }} className="rounded" />
                        <span>{g.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {form.has_modifiers && modifierGroups.length === 0 && (
                <p className="text-xs text-amber-600">Crea grupos en el botón &quot;Grupos de modificadores&quot; de la parte superior y luego asígnalos aquí.</p>
              )}
            </div>
          )}
        </div>
        )}

        {pageMode === 'service' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setF('description', e.target.value)}
              placeholder="Detalle del servicio"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </Modal>

      {/* Modal Grupos de modificadores */}
      <Modal open={showModifierGroups} onClose={() => setShowModifierGroups(false)} contentClassName="max-w-lg" closeOnBackdropClick={false}>
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Layers size={18} /> Grupos de modificadores
        </h3>
        <p className="text-xs text-gray-500">Crea grupos (ej. Talla, Color) y sus opciones. Luego asígnalos a productos en &quot;Más opciones&quot; al editar.</p>
        <div className="border border-gray-100 rounded-xl p-3 space-y-3 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-600">Nuevo grupo</p>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Nombre (ej. Talla)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newGroupRequired} onChange={e => setNewGroupRequired(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Obligatorio</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newGroupMultiSelect} onChange={e => setNewGroupMultiSelect(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Permitir varias opciones</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Opciones (una por línea)</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} placeholder="S&#10;M&#10;L" value={newGroupOptionsText} onChange={e => setNewGroupOptionsText(e.target.value)} />
          </div>
          <button type="button" onClick={handleCreateModifierGroup} disabled={savingGroup} className="w-full py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {savingGroup ? 'Creando...' : 'Crear grupo'}
          </button>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">Grupos existentes ({modifierGroups.length})</p>
          {modifierGroups.length === 0 ? (
            <p className="text-sm text-gray-400">Aún no hay grupos. Crea uno arriba.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {modifierGroups.map(g => (
                <li key={g.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <span className="font-medium text-gray-800">{g.name}</span>
                  <span className="text-xs text-gray-500">{(g.options ?? []).length} opciones{g.required ? ' · Obligatorio' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={() => setShowModifierGroups(false)} className="w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
      </Modal>

      {/* Modal Ajuste de stock */}
      {adjustmentProduct && (
        <AdjustmentModal
          product={adjustmentProduct}
          onClose={() => setAdjustmentProduct(null)}
          onSaved={() => {
            if (adjustmentProduct?.id) {
              inventoryService.getStockSummary([adjustmentProduct.id]).then(summary =>
                setStockByProductId(prev => ({ ...prev, ...summary }))
              )
            }
            setAdjustmentProduct(null)
          }}
        />
      )}

      {/* Panel avanzado (Administrar producto) */}
      <Modal open={!!panelProduct} onClose={() => setPanelProduct(null)} closeOnBackdropClick={false}>
        {panelProduct && (
          <>
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Package size={18} />
              {panelProduct.name}
            </h3>
            <p className="text-xs text-gray-500 font-mono">{panelProduct.code || 'Sin código'}</p>

            <div className="flex gap-1 border-b border-gray-100 pb-2 overflow-x-auto">
              {(panelProduct.type === 'service' ? (['datos'] as const) : (['datos', 'modificadores', 'stock'] as const)).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPanelTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                      panelTab === tab ? 'bg-[rgb(var(--p100))] text-[rgb(var(--p700))]' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab === 'datos' && 'Datos'}
                    {tab === 'modificadores' && 'Modificadores'}
                    {tab === 'stock' && 'Stock'}
                  </button>
                ),
              )}
            </div>

            {panelLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="min-h-[200px]">
                {panelTab === 'datos' && panelDetail && (
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Categoría:</span> {panelDetail.data.category_id ? categories.find(c => c.id === panelDetail.data.category_id)?.name ?? panelDetail.data.category_id : '—'}</p>
                    <p>
                      <span className="text-gray-500">Unidad:</span>{' '}
                      {productUnitFormDisplayName(panelDetail.data.unit)}
                    </p>
                    <p><span className="text-gray-500">Precio venta:</span> S/ {Number(panelDetail.data.sale_price).toFixed(2)}</p>
                    <p><span className="text-gray-500">Maneja stock:</span> {panelDetail.data.manage_stock ? 'Sí' : 'No'}</p>
                    {panelDetail.data.manage_stock && <p><span className="text-gray-500">Stock mínimo:</span> {panelDetail.data.min_stock}</p>}
                    <p><span className="text-gray-500">Series/lotes:</span> {panelDetail.data.manage_series ? 'Sí' : 'No'}</p>
                    <p><span className="text-gray-500">Modificadores:</span> {panelDetail.data.has_modifiers ? 'Sí' : 'No'}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShow(false)
                        setPanelProduct(null)
                        openEdit(panelProduct)
                        setShow(true)
                      }}
                      className="mt-2 text-xs text-[rgb(var(--p600))] hover:underline"
                    >
                      {panelProduct.type === 'service' ? 'Editar servicio' : 'Editar producto'}
                    </button>
                  </div>
                )}

                {panelTab === 'modificadores' && panelDetail && (
                  <div className="text-sm">
                    {panelDetail.data.has_modifiers ? (
                      <div className="space-y-3">
                        <p className="text-gray-500">Grupos asignados y opciones:</p>
                        {(panelDetail.modifier_group_ids ?? []).length === 0 ? (
                          <p className="text-gray-400">Ninguno. Edita el producto para asignar grupos.</p>
                        ) : (
                          <ul className="space-y-2">
                            {(panelDetail.modifier_group_ids ?? []).map(gid => {
                              const g = modifierGroups.find(m => m.id === gid)
                              if (!g) return <li key={gid}>ID {gid}</li>
                              return (
                                <li key={gid} className="border border-gray-100 rounded-lg p-2">
                                  <p className="font-medium text-gray-800">{g.name}</p>
                                  <p className="text-xs text-gray-500">Opciones: {(g.options ?? []).map(o => o.name + (o.extra_price ? ` (+S/ ${Number(o.extra_price).toFixed(2)})` : '')).join(', ') || '—'}</p>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500">Este producto no usa modificadores.</p>
                    )}
                  </div>
                )}

                {panelTab === 'stock' && (
                  <div className="text-sm space-y-4">
                    {panelProduct?.manage_stock && (
                      <div className="overflow-x-auto">
                        <p className="font-medium text-gray-700 mb-1">Stock por sucursal</p>
                        <table className="w-full text-xs">
                          <thead><tr className="border-b"><th className="text-left py-2">Sucursal</th><th className="text-right py-2">Cantidad</th></tr></thead>
                          <tbody>
                            {stockRows.length === 0 && <tr><td colSpan={2} className="py-4 text-gray-400 text-center">Sin stock registrado</td></tr>}
                            {stockRows.map((s, i) => (
                              <tr key={i} className="border-b border-gray-50"><td className="py-2">{branchName(s.branch_id)}</td><td className="text-right py-2 font-mono">{Number(s.quantity)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-gray-500 mt-2">Total: {stockRows.reduce((a, s) => a + Number(s.quantity), 0)}</p>
                        <div className="flex gap-2 mt-3 flex-wrap">
                          <Link to={`/inventory/kardex?product_id=${panelProduct?.id}`} className="text-xs text-[rgb(var(--p600))] hover:underline">Ver Kardex completo</Link>
                          <Link to="/inventory/transfers" className="text-xs text-[rgb(var(--p600))] hover:underline">Ir a Transferencias</Link>
                        </div>
                      </div>
                    )}
                    {panelProduct?.manage_series && (
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Números de serie</p>
                        {panelSerials.length === 0 ? (
                          <p className="text-gray-400 text-xs">Sin series registradas (se registran al comprar o transferir).</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 sticky top-0"><tr><th className="text-left px-2 py-1.5">Serie</th><th className="text-left px-2 py-1.5">Sucursal</th><th className="text-left px-2 py-1.5">Estado</th></tr></thead>
                              <tbody>
                                {panelSerials.map((s, i) => (
                                  <tr key={i} className="border-b border-gray-50"><td className="px-2 py-1 font-mono">{s.serial}</td><td className="px-2 py-1">{branchName(s.branch_id)}</td><td className="px-2 py-1">{s.status}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                    {!panelProduct?.manage_stock && !panelProduct?.manage_series && (
                      <p className="text-gray-500">Este producto no maneja stock ni series.</p>
                    )}
                  </div>
                )}

              </div>
            )}

            <div className="pt-3 border-t border-gray-100 mt-3">
              <button type="button" onClick={() => setPanelProduct(null)} className="w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
            </div>
          </>
        )}
      </Modal>

      <ProductImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          setImportModalOpen(false)
          load()
        }}
      />
    </div>
  )
}

function AdjustmentModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [branchId, setBranchId] = useState<number>(0)
  const [type, setType] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState(product.manage_series ? 1 : 1)
  const [notes, setNotes] = useState('')
  const [serials, setSerials] = useState<string[]>([])
  const [availableSerials, setAvailableSerials] = useState<{ serial: string; branch_id: number; status: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSerials, setLoadingSerials] = useState(false)

  useEffect(() => {
    companyService.listBranches().then(b => {
      const list = (b ?? []) as { id: number; name: string }[]
      setBranches(list)
      if (list.length > 0 && branchId === 0) setBranchId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (!branchId || type !== 'out' || !product.manage_series) return
    setLoadingSerials(true)
    productsService.getSerials(product.id).then(list => {
      setAvailableSerials((list ?? []).filter(s => s.branch_id === branchId && s.status === 'available'))
      setLoadingSerials(false)
    })
  }, [product.id, branchId, type])

  useEffect(() => {
    if (product.manage_series && type === 'in') setSerials(Array(Math.max(0, Math.floor(quantity))).fill(''))
    if (product.manage_series && type === 'out') setSerials([])
  }, [product.manage_series, type, quantity])

  const setSerialAt = (index: number, value: string) => {
    setSerials(prev => { const next = [...prev]; next[index] = value; return next })
  }

  const handleSubmit = async () => {
    if (!branchId) { toast.error('Selecciona una sucursal'); return }
    const qty = product.manage_series ? Math.floor(quantity) : quantity
    if (qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }
    if (notes.trim() === '') { toast.error('Indica el motivo del ajuste'); return }
    if (product.manage_series) {
      if (type === 'in') {
        const list = serials.map(s => s.trim()).filter(Boolean)
        if (list.length !== qty) { toast.error(`Debes ingresar exactamente ${qty} número(s) de serie`); return }
        const seen = new Set<string>()
        for (const s of list) { if (seen.has(s)) { toast.error('No se permiten seriales duplicados'); return }; seen.add(s) }
      } else {
        if (serials.length !== qty) { toast.error(`Selecciona exactamente ${qty} serie(s) a retirar`); return }
      }
    } else if (type === 'out') {
      const stock = await inventoryService.getStock(product.id, branchId)
      const total = (stock.find(s => s.branch_id === branchId)?.quantity ?? 0) || (stock[0]?.quantity ?? 0)
      if (qty > total) { toast.error(`Stock insuficiente. Disponible: ${total}`); return }
    }
    setLoading(true)
    try {
      await inventoryService.adjustment({
        product_id: product.id, branch_id: branchId, type, quantity: qty, notes: notes.trim(),
        serials: product.manage_series ? (type === 'in' ? serials.map(s => s.trim()).filter(Boolean) : serials) : undefined,
      })
      toast.success('Ajuste registrado. Se actualizó el kardex.')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al registrar ajuste')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} contentClassName="max-w-lg" closeOnBackdropClick={false}>
      <h3 className="font-bold text-gray-800">Ajuste de stock</h3>
      <p className="text-sm text-gray-500">{product.name}</p>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
        {branches.length >= MIN_OPTIONS_FOR_SEARCH ? (
          <SearchSelect
            options={branches.map(b => ({ value: String(b.id), label: b.name }))}
            value={String(branchId || '')}
            onChange={v => setBranchId(v ? Number(v) : 0)}
            placeholder="Selecciona sucursal"
          />
        ) : (
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={branchId || ''} onChange={e => setBranchId(e.target.value ? Number(e.target.value) : 0)}>
            <option value="">Selecciona sucursal</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de ajuste</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="adjType" checked={type === 'in'} onChange={() => setType('in')} />
            <span className="text-sm">Aumentar stock</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="adjType" checked={type === 'out'} onChange={() => setType('out')} />
            <span className="text-sm">Disminuir stock</span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
        <input type="number" min={product.manage_series ? 1 : 0.01} step={product.manage_series ? 1 : 0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={quantity} onChange={e => setQuantity(product.manage_series ? Math.max(0, Math.floor(Number(e.target.value) || 0)) : Number(e.target.value) || 0)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Motivo del ajuste *</label>
        <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Ajuste por inventario físico" />
      </div>
      {product.manage_series && type === 'in' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Números de serie (uno por unidad)</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {serials.map((s, i) => (
              <input key={i} type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder={`Serie ${i + 1}`} value={s} onChange={e => setSerialAt(i, e.target.value)} />
            ))}
          </div>
        </div>
      )}
      {product.manage_series && type === 'out' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Selecciona las series a retirar</label>
          {loadingSerials ? <p className="text-sm text-gray-500">Cargando series...</p> : availableSerials.length === 0 ? <p className="text-sm text-amber-600">No hay series disponibles en esta sucursal.</p> : (
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2 space-y-1">
              {availableSerials.map((s, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={serials.includes(s.serial)} onChange={e => { const max = Math.floor(quantity); if (e.target.checked) setSerials(prev => prev.length < max ? [...prev, s.serial] : prev); else setSerials(prev => prev.filter(x => x !== s.serial)) }} />
                  <span className="font-mono text-sm">{s.serial}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar ajuste'}</button>
      </div>
    </Modal>
  )
}
