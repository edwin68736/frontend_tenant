import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Pencil, Search, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Settings2, Package, Upload, Layers, RefreshCw, FileSpreadsheet, ScanBarcode, Trash2 } from 'lucide-react'
import { ProductImportModal } from '@/components/products/ProductImportModal'
import { BulkDeleteProductsPinModal } from '@/components/products/BulkDeleteProductsPinModal'
import { ProductPresentationsModal } from '@/components/products/ProductPresentationsModal'
import { ModifierOptionsEditor } from '@/components/modifiers/ModifierOptionsEditor'
import { productsService, getProductImageUrl, type Product, type Category, type CreateProductInput, type ModifierGroup, type ProductCatalogType, type ProductPresentation, type BulkDeleteProductsResult } from '@/services/products.service'
import { createEmptyOptionDraft, draftsFromApiOptions, optionDraftsToPayload, validateOptionDrafts, type ModifierOptionDraft } from '@/utils/modifierOptionText'
import { PRODUCT_UNIT_FORM_OPTIONS, productUnitFormDisplayName, isProductUnitFormCode } from '@/constants/sunatUnits'
import { inventoryService, type StockByBranch } from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SearchSelect, MIN_OPTIONS_FOR_SEARCH } from '@/components/ui/SearchSelect'
import { useBarcodeFieldScanner } from '@/hooks/useBarcodeFieldScanner'
import { BarcodeScannerModal } from '@/components/barcode/BarcodeScannerModal'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { clsx } from 'clsx'
import {
  formatExpiryDisplay,
  getProductExpiryStatus,
  PRODUCT_EXPIRY_BADGE_CLASS,
} from '@/utils/productExpiry'

import {
  PRODUCT_IGV_AFFECTATION_OPTIONS,
  isGravadoIgv,
} from '@/constants/igvAffectation'

/** Código interno de 6 caracteres (letras A–Z y dígitos); el valor se puede sustituir manualmente. */
function generateRandomProductCode(length = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < length; i++) s += chars[bytes[i]! % chars.length]
  return s
}

function validateProductImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Selecciona una imagen (JPG, PNG o WebP)'
  if (file.size > 5 * 1024 * 1024) return 'La imagen no debe superar 5 MB'
  return null
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
      has_expiry_date: false,
      expiry_date: null,
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
    manage_stock: false,
    min_stock: 0,
    has_expiry_date: false,
    expiry_date: null,
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

/** Layout responsive del modal crear/editar producto. */
const PRODUCT_FORM_GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'
const PRODUCT_FORM_INPUT =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))] focus:border-[rgb(var(--p400))]'
const PRODUCT_FORM_MODAL_CLASS =
  'w-full max-w-none sm:max-w-2xl lg:max-w-3xl max-h-[min(92dvh,880px)] !overflow-hidden flex flex-col gap-0 !p-0'

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
  const { activeBranchId } = useBranch()
  const { hasPermission } = useAuth()
  const canDeleteProducts = hasPermission('products.delete')
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
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listImageInputRef = useRef<HTMLInputElement>(null)
  const listImageTargetIdRef = useRef<number | null>(null)
  const [listUploadingImageId, setListUploadingImageId] = useState<number | null>(null)
  const catInputRef = useRef<HTMLInputElement>(null)
  const loadSeqRef = useRef(0)

  // Modal grupos de modificadores
  const [showModifierGroups, setShowModifierGroups] = useState(false)
  const [editingModifierGroup, setEditingModifierGroup] = useState<ModifierGroup | null>(null)
  const [groupFormName, setGroupFormName] = useState('')
  const [groupFormRequired, setGroupFormRequired] = useState(false)
  const [groupFormMultiSelect, setGroupFormMultiSelect] = useState(false)
  const [groupOptionDrafts, setGroupOptionDrafts] = useState<ModifierOptionDraft[]>([createEmptyOptionDraft()])
  const [savingGroup, setSavingGroup] = useState(false)
  const [presentations, setPresentations] = useState<ProductPresentation[]>([])
  const [showPresentationsModal, setShowPresentationsModal] = useState(false)

  // Panel avanzado
  const [panelProduct, setPanelProduct] = useState<Product | null>(null)
  const [panelTab, setPanelTab] = useState<AdvancedTab>('datos')
  const [panelDetail, setPanelDetail] = useState<{ data: Product; modifier_group_ids: number[]; presentations?: ProductPresentation[] } | null>(null)
  const [panelSerials, setPanelSerials] = useState<{ serial: string; branch_id: number; status: string }[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [stockRows, setStockRows] = useState<StockByBranch[]>([])
  const [panelLoading, setPanelLoading] = useState(false)

  // Stock en lista (total por producto) y modal de ajuste
  const [stockByProductId, setStockByProductId] = useState<Record<string, number>>({})
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)

  const handleProductCodeScan = useCallback((code: string) => {
    setForm(f => ({ ...f, code: code.trim() }))
    toast.success('Código de barras capturado')
  }, [])

  const codeBarcodeScan = useBarcodeFieldScanner({ onScan: handleProductCodeScan })

  const clearPendingImage = useCallback(() => {
    setPendingImagePreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })
    setPendingImageFile(null)
  }, [])

  const closeProductModal = () => {
    setShow(false)
    setPresentations([])
    setShowPresentationsModal(false)
    codeBarcodeScan.deactivateScanner()
    clearPendingImage()
  }

  const resetModifierGroupForm = () => {
    setEditingModifierGroup(null)
    setGroupFormName('')
    setGroupFormRequired(false)
    setGroupFormMultiSelect(false)
    setGroupOptionDrafts([createEmptyOptionDraft()])
  }

  const load = () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    /** Stock por sucursal se carga aparte; el catálogo lista todos los productos del tenant. */
    const stockBranchId = pageMode === 'product' && activeBranchId > 0 ? activeBranchId : undefined
    return productsService
      .list(listSearchQuery, catFilter, undefined, !includeInactive, page, perPage, undefined, pageMode)
      .then(({ data: p, total: t }) => {
        if (seq !== loadSeqRef.current) return [] as Product[]
        setProducts(p ?? [])
        setTotal(t ?? 0)
        return (p ?? []) as Product[]
      })
      .then(productsList =>
        Promise.all([
          productsService.listCategories(),
          productsService.listModifierGroups(),
          productsList.filter(x => x.manage_stock).length > 0
            ? inventoryService
                .getStockSummary(
                  productsList.filter(x => x.manage_stock).map(x => x.id),
                  stockBranchId,
                )
                .catch(() => ({}))
            : Promise.resolve({} as Record<string, number>),
        ]) as Promise<[Category[], ModifierGroup[], Record<string, number>]>
      )
      .then(([categoriesList, modifierGroupsList, summary]) => {
        if (seq !== loadSeqRef.current) return
        setCategories(categoriesList ?? [])
        setModifierGroups(modifierGroupsList ?? [])
        setStockByProductId(summary ?? {})
      })
      .catch((e: unknown) => {
        if (seq !== loadSeqRef.current) return
        setProducts([])
        setTotal(0)
        setStockByProductId({})
        toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al cargar productos')
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false)
      })
  }

  useEffect(() => {
    void load()
    setSelectedIds(new Set())
  }, [listSearchQuery, catFilter, includeInactive, page, perPage, pageMode, activeBranchId])

  // Nota: se removió el refetch automático al volver a la pestaña (visibilitychange).
  // Provocaba recargas y 3-4 peticiones al backend cada vez que se cambiaba de pestaña.
  // La lista se refresca al cambiar filtros/página/sucursal y tras crear/editar/eliminar.

  const openNew = () => {
    clearPendingImage()
    setEditing(null)
    setForm({ ...emptyForm(pageMode), code: generateRandomProductCode() })
    setPresentations([])
    setShowMoreOptions(false)
    setShow(true)
  }

  const openEdit = async (p: Product) => {
    clearPendingImage()
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
      has_expiry_date: p.has_expiry_date ?? false,
      expiry_date: p.expiry_date ? String(p.expiry_date).slice(0, 10) : null,
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
    setPresentations([])
    try {
      const detail = await productsService.get(p.id)
      setForm(f => ({
        ...f,
        modifier_group_ids: detail.modifier_group_ids ?? [],
        preparation_area: detail.data.preparation_area ?? '',
      }))
      setPresentations(detail.presentations ?? [])
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

  const formImagePreview =
    pendingImagePreview ?? ((form.image_url ?? '') ? getProductImageUrl(form.image_url) : null)

  const handleFormImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const validationError = validateProductImageFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setPendingImagePreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setPendingImageFile(file)
  }

  const openListImagePicker = (productId: number) => {
    listImageTargetIdRef.current = productId
    listImageInputRef.current?.click()
  }

  const handleListImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const productId = listImageTargetIdRef.current
    e.target.value = ''
    listImageTargetIdRef.current = null
    if (!file || productId == null) return
    const validationError = validateProductImageFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setListUploadingImageId(productId)
    try {
      const imageUrl = await productsService.uploadImage(productId, file)
      setProducts(prev => prev.map(p => (p.id === productId ? { ...p, image_url: imageUrl } : p)))
      toast.success('Imagen actualizada')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Error subiendo imagen')
    } finally {
      setListUploadingImageId(null)
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
      payload.has_expiry_date = false
      payload.expiry_date = null
      payload.modifier_group_ids = []
    }
    if (!isGravadoIgv(form.igv_affectation_type)) payload.price_includes_igv = false
    if (!payload.is_restaurant) payload.preparation_area = ''
    else if (payload.preparation_area) payload.preparation_area = payload.preparation_area.trim().toLowerCase()
    if (pageMode === 'product') {
      payload.manage_stock = Boolean(form.manage_stock)
      if (!payload.manage_stock) {
        payload.min_stock = 0
        delete payload.initial_stock
      }
      payload.has_expiry_date = Boolean(form.has_expiry_date)
      if (payload.has_expiry_date) {
        const raw = (form.expiry_date ?? '').trim()
        if (!raw) {
          toast.error('Indique la fecha de vencimiento')
          return
        }
        payload.expiry_date = raw.slice(0, 10)
      } else {
        payload.expiry_date = null
      }
      if (payload.has_variants) {
        const pres = presentations.filter((p) => p.name.trim())
        if (pres.length === 0) {
          toast.error('Agrega al menos una presentación con nombre')
          return
        }
        payload.presentations = pres.map((p) => ({
          id: p.id,
          name: p.name.trim(),
          sale_price: Number(p.sale_price) || 0,
        }))
      } else if (editing) {
        payload.presentations = []
      }
    }
    if (editing) {
      delete payload.initial_stock
    } else if (!payload.manage_stock || !(payload.initial_stock != null && payload.initial_stock > 0)) {
      delete payload.initial_stock
    }
    setSaving(true)
    try {
      let productId = editing?.id
      if (editing) {
        await productsService.update(editing.id, payload)
      } else {
        const created = await productsService.create(payload)
        productId = created.id
      }
      if (pendingImageFile && productId) {
        setUploadingImage(true)
        try {
          await productsService.uploadImage(productId, pendingImageFile)
        } catch (err: any) {
          toast.error(err.response?.data?.error ?? 'Producto guardado, pero falló la imagen')
          closeProductModal()
          load()
          return
        } finally {
          setUploadingImage(false)
        }
      }
      toast.success(editing ? 'Producto actualizado' : 'Producto creado')
      closeProductModal()
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (p: Product) => {
    try { await productsService.toggle(p.id); load() }
    catch { toast.error('Error') }
  }

  const handleConfirmDeleteProduct = async () => {
    if (!deleteTarget) return
    const label = pageMode === 'service' ? 'servicio' : 'producto'
    setDeletingProduct(true)
    try {
      await productsService.delete(deleteTarget.id)
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} eliminado`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      setDeleteTarget(null)
      load()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al eliminar')
    } finally {
      setDeletingProduct(false)
    }
  }

  const selectedCount = selectedIds.size
  const pageIds = products.map((p) => p.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleBulkDeleteDone = (result: BulkDeleteProductsResult) => {
    if (result.deleted.length > 0) {
      const deletedSet = new Set(result.deleted.map((p) => p.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        deletedSet.forEach((id) => next.delete(id))
        return next
      })
      load()
    }
    if (result.deleted.length > 0 && result.blocked.length === 0) {
      toast.success(`${result.deleted.length} producto(s) eliminado(s)`)
    } else if (result.deleted.length > 0) {
      toast.success(`${result.deleted.length} eliminado(s), ${result.blocked.length} bloqueado(s)`)
    } else if (result.blocked.length > 0) {
      toast.error('Ningún producto pudo eliminarse')
    }
  }

  const handleSaveModifierGroup = async () => {
    const name = groupFormName.trim()
    if (!name) { toast.error('Nombre del grupo requerido'); return }
    const validationErr = validateOptionDrafts(groupOptionDrafts)
    if (validationErr) { toast.error(validationErr); return }
    const options = optionDraftsToPayload(groupOptionDrafts)
    setSavingGroup(true)
    try {
      const payload = { name, required: groupFormRequired, multi_select: groupFormMultiSelect, options }
      if (editingModifierGroup) {
        await productsService.updateModifierGroup(editingModifierGroup.id, payload)
        toast.success('Grupo actualizado')
      } else {
        await productsService.createModifierGroup(payload)
        toast.success('Grupo creado')
      }
      resetModifierGroupForm()
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al guardar grupo')
    } finally {
      setSavingGroup(false)
    }
  }

  const handleDeleteModifierGroup = async (g: ModifierGroup) => {
    if (!window.confirm(`¿Eliminar el grupo «${g.name}»?`)) return
    setSavingGroup(true)
    try {
      await productsService.deleteModifierGroup(g.id)
      toast.success('Grupo eliminado')
      if (editingModifierGroup?.id === g.id) resetModifierGroupForm()
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo eliminar')
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
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-xs font-medium text-gray-600">Categoría</label>
        <button type="button" onClick={() => { setAddingCat(true); setTimeout(() => catInputRef.current?.focus(), 50) }} className="text-xs text-[rgb(var(--p600))] hover:underline shrink-0">+ Nueva</button>
      </div>
      {addingCat ? (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-1">
          <input ref={catInputRef} className={`flex-1 ${PRODUCT_FORM_INPUT}`} placeholder="Nombre categoría" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setAddingCat(false) }} />
          <button type="button" onClick={handleAddCategory} className="touch-target sm:min-h-0 sm:min-w-0 px-4 py-2.5 sm:px-2 sm:py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm sm:text-xs font-medium shrink-0">OK</button>
        </div>
      ) : categories.filter(Boolean).length >= MIN_OPTIONS_FOR_SEARCH ? (
        <SearchSelect
          options={categories.filter(Boolean).map(c => ({ value: String(c.id), label: c.name }))}
          value={String(form.category_id ?? '')}
          onChange={(v) => setF('category_id', v ? Number(v) : null)}
          placeholder="Sin categoría"
        />
      ) : (
        <select className={PRODUCT_FORM_INPUT} value={form.category_id ?? ''} onChange={e => setF('category_id', e.target.value ? Number(e.target.value) : null)}>
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
                <Layers size={15} /> Grupos de extras
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

      {canDeleteProducts && selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 rounded-xl border border-red-200 bg-red-50/80">
          <span className="text-sm font-medium text-red-900">
            {selectedCount} {pageMode === 'service' ? 'servicio' : 'producto'}{selectedCount === 1 ? '' : 's'} seleccionado{selectedCount === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 size={14} />
              Eliminar seleccionados
            </button>
          </div>
        </div>
      )}

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
              {canDeleteProducts && (
                <th className="text-left px-2 py-3 w-9">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected && !allPageSelected
                    }}
                    onChange={toggleSelectAllPage}
                    aria-label="Seleccionar todos en esta página"
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {(
                pageMode === 'service'
                  ? (['Código', 'Servicio', 'Categoría', 'Precio venta', 'IGV', 'Estado', ''] as const)
                  : (['Código', 'Producto', 'Categoría', 'Precio venta', 'IGV', 'Stock', 'Vencimiento', 'Modif.', 'Estado', ''] as const)
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
                {canDeleteProducts && (
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      aria-label={`Seleccionar ${p.name}`}
                      className="rounded border-gray-300"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.code || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {pageMode === 'product' ? (
                      <button
                        type="button"
                        onClick={() => openListImagePicker(p.id)}
                        disabled={listUploadingImageId === p.id}
                        title="Cambiar imagen"
                        aria-label={`Cambiar imagen de ${p.name}`}
                        className="group relative w-10 h-10 rounded-xl bg-[rgb(var(--p50))] flex items-center justify-center overflow-hidden flex-shrink-0 border border-transparent hover:border-[rgb(var(--p300))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--p400))] disabled:opacity-60"
                      >
                        {listUploadingImageId === p.id ? (
                          <RefreshCw size={14} className="animate-spin text-[rgb(var(--p600))]" aria-hidden />
                        ) : p.image_url ? (
                          <>
                            <img
                              src={getProductImageUrl(p.image_url)}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Upload size={14} className="text-white" aria-hidden />
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-bold text-[rgb(var(--p400))]">
                              {p.name?.charAt(0).toUpperCase()}
                            </span>
                            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Upload size={14} className="text-white" aria-hidden />
                            </span>
                          </>
                        )}
                      </button>
                    ) : (
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
                    )}
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
                      {p.has_expiry_date && p.expiry_date ? (() => {
                        const dateStr = String(p.expiry_date).slice(0, 10)
                        const status = getProductExpiryStatus(dateStr)
                        return (
                          <span
                            className={clsx(
                              'inline-flex flex-col gap-0.5 rounded-lg px-2 py-1 text-xs font-medium',
                              PRODUCT_EXPIRY_BADGE_CLASS[status],
                            )}
                            title={status === 'expired' ? 'Producto vencido' : status === 'critical' ? 'Vence en 7 días o menos' : status === 'warning' ? 'Vence en 30 días o menos' : 'Vigente'}
                          >
                            <span>{formatExpiryDisplay(dateStr)}</span>
                          </span>
                        )
                      })() : (
                        <span className="text-xs text-gray-400">—</span>
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
                    {canDeleteProducts && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
      <Modal
        open={show}
        onClose={closeProductModal}
        closeOnBackdropClick={false}
        contentClassName={PRODUCT_FORM_MODAL_CLASS}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-7 space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-gray-800 pr-2">
          {pageMode === 'service'
            ? editing
              ? 'Editar servicio'
              : 'Nuevo servicio'
            : editing
              ? 'Editar producto'
              : 'Nuevo producto'}
        </h3>
        {pageMode === 'product' && (
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Imagen del producto</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFormImageSelect}
                disabled={saving || uploadingImage}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || uploadingImage}
                title="Subir o cambiar imagen"
                className="group relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0 hover:border-[rgb(var(--p300))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--p400))] disabled:opacity-50"
              >
                {formImagePreview ? (
                  <>
                    <img src={formImagePreview} alt="Vista previa" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Upload size={16} className="text-white" aria-hidden />
                    </span>
                  </>
                ) : (
                  <span className="flex flex-col items-center justify-center h-full text-[rgb(var(--p600))] gap-1">
                    <Upload size={18} aria-hidden />
                    <span className="text-[10px] font-medium">Subir</span>
                  </span>
                )}
              </button>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving || uploadingImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgb(var(--p300))] rounded-xl text-xs font-medium text-[rgb(var(--p700))] hover:bg-[rgb(var(--p50))] disabled:opacity-50"
                >
                  <Upload size={12} /> {formImagePreview ? 'Cambiar imagen' : 'Subir imagen'}
                </button>
                <p className="text-[11px] text-gray-400 mt-1">
                  JPG, PNG o WebP · máx. 5 MB
                  {!editing && pendingImageFile ? ' · Se subirá al guardar' : ''}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className={PRODUCT_FORM_GRID}>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {pageMode === 'product' ? 'Código (barras)' : 'Código'}
            </label>
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <div
                className={clsx(
                  'flex flex-1 min-w-0 rounded-xl border overflow-hidden bg-white focus-within:ring-2',
                  pageMode === 'product' && codeBarcodeScan.scannerMode
                    ? 'border-primary-300 focus-within:ring-primary-500/40 focus-within:border-primary-400'
                    : 'border-gray-200 focus-within:ring-[rgb(var(--p200))] focus-within:border-[rgb(var(--p400))]',
                )}
              >
                {pageMode === 'product' && codeBarcodeScan.scannerMode && (
                  <span className="pl-2.5 flex items-center text-primary-600 shrink-0">
                    <ScanBarcode size={16} aria-hidden />
                  </span>
                )}
                <input
                  ref={pageMode === 'product' ? codeBarcodeScan.inputRef : undefined}
                  className="flex-1 min-w-0 px-3 py-2.5 sm:py-2 text-base sm:text-sm font-mono border-0 outline-none bg-transparent"
                  placeholder={
                    pageMode === 'product' && codeBarcodeScan.scannerMode
                      ? codeBarcodeScan.useCameraBarcodeScanner
                        ? 'Cámara activa — apunta al código'
                        : 'Escanear código de barras…'
                      : pageMode === 'product'
                        ? 'Código de barras'
                        : 'Ej. A3K9Z1'
                  }
                  value={form.code ?? ''}
                  onChange={(e) => setF('code', e.target.value)}
                  onKeyDown={pageMode === 'product' ? codeBarcodeScan.handleKeyDown : undefined}
                  aria-label={pageMode === 'product' ? 'Código de barras' : 'Código de producto'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  title="Generar otro código"
                  aria-label="Generar otro código"
                  className="touch-target sm:min-h-0 sm:min-w-0 shrink-0 px-2.5 border-l border-gray-200 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] active:bg-[rgb(var(--p100))] transition-colors"
                  onClick={() => setF('code', generateRandomProductCode())}
                >
                  <RefreshCw size={16} strokeWidth={2} className="mx-auto" />
                </button>
              </div>
              {pageMode === 'product' && (
                <button
                  type="button"
                  onClick={codeBarcodeScan.toggleScannerMode}
                  className={clsx(
                    'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 sm:p-2 transition-colors touch-manipulation shrink-0 w-full sm:w-auto',
                    codeBarcodeScan.scannerMode
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-stone-50 text-stone-600 hover:bg-stone-100',
                  )}
                  title={
                    codeBarcodeScan.scannerMode
                      ? 'Modo escáner activo: escanee o pegue el código'
                      : 'Activar escáner de código de barras'
                  }
                  aria-label="Escanear código de barras"
                >
                  <ScanBarcode size={18} aria-hidden />
                  <span className="text-sm font-medium sm:sr-only">Escanear</span>
                </button>
              )}
            </div>
            {pageMode === 'product' && codeBarcodeScan.scannerMode && !codeBarcodeScan.useCameraBarcodeScanner && (
              <p className="mt-1.5 text-xs text-gray-500 leading-snug">
                Escanee con lector USB o pegue el código. El valor se rellena en el campo al escanear.
              </p>
            )}
            {pageMode === 'product' && codeBarcodeScan.scannerMode && codeBarcodeScan.useCameraBarcodeScanner && (
              <p className="mt-1.5 text-xs text-primary-700 leading-snug">
                Apunta la cámara al código de barras del producto.
              </p>
            )}
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input className={PRODUCT_FORM_INPUT} value={form.name} onChange={e => setF('name', e.target.value)} />
          </div>
        </div>
        {pageMode === 'product' ? (
          <div className={PRODUCT_FORM_GRID}>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
              <select
                className={PRODUCT_FORM_INPUT}
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
        <div className={PRODUCT_FORM_GRID}>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio venta *</label>
            <input type="number" min={0} step={0.01} inputMode="decimal" className={PRODUCT_FORM_INPUT} value={form.sale_price} onChange={e => setF('sale_price', Math.max(0, Number(e.target.value) || 0))} />
          </div>
          {pageMode === 'product' && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio compra</label>
              <input type="number" min={0} step={0.01} inputMode="decimal" className={PRODUCT_FORM_INPUT} value={form.purchase_price ?? 0} onChange={e => setF('purchase_price', Math.max(0, Number(e.target.value) || 0))} />
            </div>
          )}
        </div>
        <div className={PRODUCT_FORM_GRID}>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo afectación IGV</label>
            <select className={PRODUCT_FORM_INPUT} value={form.igv_affectation_type} onChange={e => {
              const v = e.target.value
              setF('igv_affectation_type', v)
              if (!isGravadoIgv(v)) setF('price_includes_igv', false)
            }}>
              {PRODUCT_IGV_AFFECTATION_OPTIONS.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          {isGravadoIgv(form.igv_affectation_type) && (
            <div className="flex flex-col justify-end min-w-0">
              <label className="flex items-center gap-2 cursor-pointer py-2 touch-manipulation">
                <div onClick={() => setF('price_includes_igv', !form.price_includes_igv)} className={`w-11 h-6 shrink-0 rounded-full transition-colors ${form.price_includes_igv ? 'bg-[rgb(var(--p500))]' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${form.price_includes_igv ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs sm:text-sm text-gray-600">Precio incluye IGV</span>
              </label>
            </div>
          )}
        </div>
        {pageMode === 'product' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
            <label className="flex items-center gap-2.5 cursor-pointer touch-manipulation min-h-[2.75rem] sm:min-h-0">
              <input type="checkbox" checked={form.manage_stock} onChange={(e) => {
                const on = e.target.checked
                setF('manage_stock', on)
                if (!on) setForm((f) => ({ ...f, manage_stock: false, initial_stock: undefined }))
              }} className="rounded w-4 h-4 shrink-0" />
              <span className="text-sm text-gray-700">Control stock</span>
            </label>
            {form.manage_stock && (
              <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-600 shrink-0 whitespace-nowrap">Stock mín:</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="w-20 sm:w-24 border border-gray-200 rounded-lg px-2 py-2 sm:py-1 text-base sm:text-sm"
                    value={form.min_stock ?? 0}
                    onChange={(e) => setF('min_stock', Number(e.target.value))}
                  />
                </div>
                {!editing && (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-600 shrink-0 whitespace-nowrap">Stock inicial:</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      inputMode="decimal"
                      className="w-24 sm:w-28 border border-gray-200 rounded-lg px-2 py-2 sm:py-1 text-base sm:text-sm"
                      value={form.initial_stock != null ? form.initial_stock : ''}
                      onChange={(e) => {
                        const raw = e.target.value
                        setF('initial_stock', raw === '' ? undefined : Math.max(0, Number(raw) || 0))
                      }}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-2.5 cursor-pointer touch-manipulation min-h-[2.75rem] sm:min-h-0 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.has_expiry_date ?? false}
                onChange={(e) => {
                  const on = e.target.checked
                  setForm(f => ({
                    ...f,
                    has_expiry_date: on,
                    expiry_date: on ? f.expiry_date ?? '' : null,
                  }))
                }}
                className="rounded w-4 h-4 shrink-0"
              />
              <span className="text-sm text-gray-700">Tiene fecha de vencimiento</span>
            </label>
            {form.has_expiry_date && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0 sm:col-span-2">
                <span className="text-xs text-gray-600 shrink-0">Vence:</span>
                <input
                  type="date"
                  className={`${PRODUCT_FORM_INPUT} sm:max-w-xs`}
                  value={(form.expiry_date ?? '').slice(0, 10)}
                  onChange={(e) => setF('expiry_date', e.target.value || null)}
                />
              </div>
            )}
            <label className="flex items-center gap-2.5 cursor-pointer touch-manipulation min-h-[2.75rem] sm:min-h-0">
              <input type="checkbox" checked={form.is_restaurant ?? false} onChange={(e) => setF('is_restaurant', e.target.checked)} className="rounded w-4 h-4 shrink-0" />
              <span className="text-sm text-gray-700">Producto de restaurante</span>
            </label>
            {form.is_restaurant && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0 sm:col-span-2">
                <span className="text-xs text-gray-600 shrink-0">Área prep.:</span>
                <select
                  className={`${PRODUCT_FORM_INPUT} sm:max-w-xs`}
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
          <button type="button" onClick={() => setShowMoreOptions(!showMoreOptions)} className="w-full flex items-center justify-between px-3 py-3 sm:py-2 text-left text-sm text-gray-600 hover:bg-gray-50 touch-manipulation">
            <span className="font-medium">Más opciones</span>
            {showMoreOptions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {showMoreOptions && (
            <div className="px-3 pb-3 pt-0 space-y-3 border-t border-gray-100">
              <div className="min-w-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea className={`${PRODUCT_FORM_INPUT} resize-none min-h-[5rem]`} rows={2} value={form.description ?? ''} onChange={e => setF('description', e.target.value)} placeholder="Opcional" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.manage_series ?? false} onChange={e => setF('manage_series', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Maneja series/lotes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.has_variants ?? false}
                  onChange={e => {
                    const checked = e.target.checked
                    setF('has_variants', checked)
                    if (!checked) setPresentations([])
                  }}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Tiene presentaciones (tamaño, empaque, etc.)</span>
              </label>
              {form.has_variants && (
                <div className="rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))]/40 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-gray-600">
                    {presentations.filter(p => p.name.trim()).length > 0
                      ? `${presentations.filter(p => p.name.trim()).length} presentación(es) configurada(s).`
                      : 'Aún no hay presentaciones. Configúralas antes de guardar.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPresentationsModal(true)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-medium border border-[rgb(var(--p300))] text-[rgb(var(--p700))] hover:bg-[rgb(var(--p100))]"
                  >
                    Gestionar presentaciones
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.has_modifiers ?? false} onChange={e => setF('has_modifiers', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Tiene extras / adicionales</span>
              </label>
              {form.has_modifiers && modifierGroups.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Grupos de extras</label>
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
                <p className="text-xs text-amber-600">Crea grupos en &quot;Grupos de extras&quot; arriba y asígnalos aquí.</p>
              )}
            </div>
          )}
        </div>
        )}

        {pageMode === 'service' && (
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
            <textarea
              className={`${PRODUCT_FORM_INPUT} resize-none min-h-[5rem]`}
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setF('description', e.target.value)}
              placeholder="Detalle del servicio"
            />
          </div>
        )}

        </div>
        <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 md:px-7 py-3 bg-white flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={closeProductModal} disabled={saving || uploadingImage} className="touch-target sm:min-h-0 flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving || uploadingImage} className="touch-target sm:min-h-0 flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving || uploadingImage ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>

      <ProductPresentationsModal
        open={showPresentationsModal}
        productName={form.name || editing?.name}
        presentations={presentations}
        onClose={() => setShowPresentationsModal(false)}
        onSave={setPresentations}
      />

      {/* Modal Grupos de extras */}
      <Modal
        open={showModifierGroups}
        onClose={() => { setShowModifierGroups(false); resetModifierGroupForm() }}
        contentClassName="max-w-lg max-h-[min(92dvh,720px)] flex flex-col"
        closeOnBackdropClick={false}
      >
        <h3 className="font-bold text-gray-800 flex items-center gap-2 shrink-0">
          <Layers size={18} /> Grupos de extras
        </h3>
        <p className="text-xs text-gray-500 shrink-0">
          Extras reutilizables entre productos (garantía, instalación…). Las presentaciones se configuran en cada producto.
        </p>
        <div className="border border-gray-100 rounded-xl p-3 space-y-3 bg-gray-50/50 shrink-0">
          <p className="text-xs font-semibold text-gray-600">{editingModifierGroup ? 'Editar grupo' : 'Nuevo grupo'}</p>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Nombre (ej. Servicios adicionales)"
            value={groupFormName}
            onChange={e => setGroupFormName(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={groupFormRequired} onChange={e => setGroupFormRequired(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Obligatorio en venta</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={groupFormMultiSelect} onChange={e => setGroupFormMultiSelect(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Permitir varias opciones</span>
          </label>
          <ModifierOptionsEditor options={groupOptionDrafts} onChange={setGroupOptionDrafts} />
          <div className="flex gap-2">
            {editingModifierGroup && (
              <button type="button" onClick={resetModifierGroupForm} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cancelar edición
              </button>
            )}
            <button type="button" onClick={handleSaveModifierGroup} disabled={savingGroup} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {savingGroup ? 'Guardando...' : editingModifierGroup ? 'Actualizar grupo' : 'Crear grupo'}
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-600 mb-2 sticky top-0 bg-white py-1">Grupos existentes ({modifierGroups.length})</p>
          {modifierGroups.length === 0 ? (
            <p className="text-sm text-gray-400">Aún no hay grupos. Crea uno arriba.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {modifierGroups.map(g => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{g.name}</span>
                    <p className="text-xs text-gray-500 truncate">
                      {(g.options ?? []).map(o => o.name + (o.extra_price ? ` (+S/ ${Number(o.extra_price).toFixed(2)})` : '')).join(', ') || 'Sin opciones'}
                      {g.required ? ' · Obligatorio' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => { setEditingModifierGroup(g); setGroupFormName(g.name); setGroupFormRequired(!!g.required); setGroupFormMultiSelect(!!g.multi_select); setGroupOptionDrafts(draftsFromApiOptions(g.options)) }} className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg" aria-label="Editar">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => handleDeleteModifierGroup(g)} disabled={savingGroup} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={() => { setShowModifierGroups(false); resetModifierGroupForm() }} className="w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 shrink-0">Cerrar</button>
      </Modal>

      {/* Modal Ajuste de stock */}
      {adjustmentProduct && (
        <AdjustmentModal
          product={adjustmentProduct}
          defaultBranchId={activeBranchId}
          onClose={() => setAdjustmentProduct(null)}
          onSaved={() => {
            if (adjustmentProduct?.id) {
              const branchId = activeBranchId > 0 ? activeBranchId : undefined
              inventoryService.getStockSummary([adjustmentProduct.id], branchId).then(summary =>
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
                    {tab === 'modificadores' && 'Presentaciones y extras'}
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
                    <p><span className="text-gray-500">Control stock:</span> {panelDetail.data.manage_stock ? 'Sí' : 'No'}</p>
                    {panelDetail.data.manage_stock && <p><span className="text-gray-500">Stock mínimo:</span> {panelDetail.data.min_stock}</p>}
                    {panelDetail.data.has_expiry_date && panelDetail.data.expiry_date && (
                      <p>
                        <span className="text-gray-500">Vencimiento:</span>{' '}
                        {formatExpiryDisplay(String(panelDetail.data.expiry_date).slice(0, 10))}
                      </p>
                    )}
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
                  <div className="text-sm space-y-4">
                    {panelDetail.data.has_variants && (panelDetail.presentations ?? []).length > 0 && (
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Presentaciones</p>
                        <ul className="space-y-1">
                          {(panelDetail.presentations ?? []).map((pres, i) => (
                            <li key={pres.id ?? i} className="text-gray-600 text-xs border border-gray-100 rounded-lg px-2 py-1.5">
                              {pres.name} — S/ {Number(pres.sale_price).toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
                    ) : !panelDetail.data.has_variants ? (
                      <p className="text-gray-500">Este producto no usa presentaciones ni extras.</p>
                    ) : null}
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

      {canDeleteProducts && (
        <BulkDeleteProductsPinModal
          open={bulkDeleteOpen}
          selectedCount={selectedCount}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={async (reason) =>
            productsService.bulkDeleteCatalog([...selectedIds], reason)
          }
          onDone={handleBulkDeleteDone}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => {
          if (!deletingProduct) setDeleteTarget(null)
        }}
        onConfirm={handleConfirmDeleteProduct}
        title={pageMode === 'service' ? 'Eliminar servicio' : 'Eliminar producto'}
        message={
          deleteTarget ? (
            <p>
              ¿Eliminar <strong>{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
            </p>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deletingProduct}
      />

      <BarcodeScannerModal
        open={codeBarcodeScan.cameraScannerOpen}
        onClose={codeBarcodeScan.closeScanner}
        onScan={codeBarcodeScan.handleCameraScan}
        title="Código de barras"
        subtitle="Apunta al código del producto"
        footerHint="El código reemplazará el valor del campo al detectarlo"
      />

      {pageMode === 'product' && (
        <input
          ref={listImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleListImageUpload}
        />
      )}
    </div>
  )
}

function AdjustmentModal({
  product,
  defaultBranchId,
  onClose,
  onSaved,
}: {
  product: Product
  defaultBranchId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [branchId, setBranchId] = useState<number>(defaultBranchId)
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
      if (defaultBranchId > 0) {
        setBranchId(defaultBranchId)
      } else if (list.length > 0 && branchId === 0) {
        setBranchId(list[0].id)
      }
    })
  }, [defaultBranchId])

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
