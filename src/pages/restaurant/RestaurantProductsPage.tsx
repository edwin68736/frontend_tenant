import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, ToggleLeft, ToggleRight, Search } from 'lucide-react'
import { productsService, type Product, type Category, type CreateProductInput, type ModifierGroup } from '@/services/products.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect, MIN_OPTIONS_FOR_SEARCH } from '@/components/ui/SearchSelect'

const IGV_TYPES = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
]

/** Solo los tipos gravados aplican IGV; Exonerado/Inafecto/Exportación no. */
function isGravadoIgv(code: string): boolean {
  const c = String(code || '').trim()
  if (['20','21','30','31','32','33','34','35','36','40'].includes(c)) return false
  return true
}
const UNITS = ['NIU','ZZ','KGM','LTR','MTR','UND','POR','RCN']

const empty = (): CreateProductInput => ({
  name: '', unit: 'NIU', sale_price: 0, purchase_price: 0,
  igv_affectation_type: '10', price_includes_igv: true,
  manage_stock: false, min_stock: 0, is_restaurant: true, category_id: null, code: '',
  manage_series: false, has_modifiers: false, modifier_group_ids: [],
})

export default function RestaurantProductsPage() {
  return <RequireModule moduleKey="restaurant"><RestaurantProductsContent /></RequireModule>
}

function RestaurantProductsContent() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const listSearchQuery = useMemo(() => {
    const t = q.trim()
    return t.length < 2 ? '' : t
  }, [q])
  const [catFilter, setCatFilter] = useState<number | undefined>()
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<CreateProductInput>(empty())
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const catInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    return Promise.all([
    productsService.list(listSearchQuery, catFilter, true),
    productsService.listCategories(),
    productsService.listModifierGroups(),
  ])
    .then(([p, c, g]) => {
      setProducts((p?.data) ?? [])
      setCategories(c ?? [])
      setModifierGroups(g ?? [])
    })
    .catch((e: any) => toast.error(e?.response?.data?.error ?? 'Error cargando productos'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [listSearchQuery, catFilter])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = async (p: Product) => {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      unit: p.unit,
      sale_price: p.sale_price,
      purchase_price: p.purchase_price ?? 0,
      igv_affectation_type: p.igv_affectation_type,
      price_includes_igv: p.price_includes_igv,
      manage_stock: p.manage_stock ?? false,
      min_stock: p.min_stock ?? 0,
      is_restaurant: true,
      category_id: p.category_id,
      manage_series: false,
      has_modifiers: p.has_modifiers ?? false,
      modifier_group_ids: [],
    })
    setShow(true)
    try {
      const detail = await productsService.get(p.id)
      setForm(f => ({ ...f, modifier_group_ids: detail.modifier_group_ids ?? [] }))
    } catch {
      // Si falla el detalle, se mantienen los datos del listado
    }
  }

  const setF = (k: keyof CreateProductInput, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    try {
      const cat = await productsService.createCategory(newCatName.trim())
      setCategories(c => [...c, cat])
      setF('category_id', cat.id)
      setNewCatName(''); setAddingCat(false)
      toast.success('Categoría creada')
    } catch { toast.error('Error creando categoría') }
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      const data: CreateProductInput = {
        ...form,
        price_includes_igv: isGravadoIgv(form.igv_affectation_type) ? form.price_includes_igv : false,
        is_restaurant: true,
        manage_series: false,
        has_modifiers: form.has_modifiers ?? false,
        modifier_group_ids: form.modifier_group_ids ?? [],
      }
      if (editing) await productsService.update(editing.id, data)
      else await productsService.create(data)
      toast.success(editing ? 'Producto actualizado' : 'Producto creado')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (p: Product) => {
    try { await productsService.toggle(p.id); load() }
    catch { toast.error('Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-lg font-bold text-gray-800">Productos de Restaurante</h2><p className="text-sm text-gray-500">Carta y platos del restaurante</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo plato
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar plato… (mín. 2 caracteres)" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {categories.length >= MIN_OPTIONS_FOR_SEARCH ? (
          <SearchSelect
            options={categories.map(c => ({ value: String(c.id), label: c.name }))}
            value={String(catFilter ?? '')}
            onChange={v => setCatFilter(v ? Number(v) : undefined)}
            placeholder="Todas las categorías"
          />
        ) : (
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={catFilter ?? ''} onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        )}
      </div>

      <div className="relative min-h-[200px]">
        {loading && (
          <div
            className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center rounded-2xl"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map(p => (
          <div key={p.id} className={`bg-white rounded-2xl shadow-sm p-4 border-2 transition-colors ${p.active ? 'border-transparent' : 'border-gray-100 opacity-60'}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="w-12 h-12 bg-[rgb(var(--p50))] rounded-xl flex items-center justify-center text-xl font-bold text-[rgb(var(--p400))]">
                {p.name.charAt(0)}
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleToggle(p)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg">
                  {p.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={13} /></button>
              </div>
            </div>
            <p className="font-bold text-gray-800 text-sm">{p.name}</p>
            {p.category_name && <p className="text-xs text-gray-400 mt-0.5">{p.category_name}</p>}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {p.has_modifiers && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Modificadores</span>}
              {p.manage_stock && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Inventario</span>}
            </div>
            <p className="text-base font-bold text-[rgb(var(--p600))] mt-2">S/ {Number(p.sale_price).toFixed(2)}</p>
          </div>
        ))}
        </div>
        {products.length === 0 && !loading && (
          <div className="bg-white rounded-2xl shadow-sm text-center py-12 text-gray-400 text-sm">Sin productos de restaurante</div>
        )}
      </div>

      <Modal open={show} onClose={() => setShow(false)} closeOnBackdropClick={false}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar plato' : 'Nuevo plato'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.name} onChange={e => setF('name', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.unit} onChange={e => setF('unit', e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Categoría</label>
            <button onClick={() => { setAddingCat(true); setTimeout(() => catInputRef.current?.focus(), 50) }}
              className="text-xs text-[rgb(var(--p600))] hover:underline">+ Nueva</button>
          </div>
          {addingCat ? (
            <div className="flex gap-1">
              <input ref={catInputRef} className="flex-1 border border-[rgb(var(--p300))] rounded-xl px-2 py-1.5 text-sm"
                placeholder="Nombre categoría" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setAddingCat(false) }} />
              <button onClick={handleAddCategory} className="px-2 py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-xs">OK</button>
            </div>
          ) : categories.length >= MIN_OPTIONS_FOR_SEARCH ? (
            <SearchSelect
              options={categories.map(c => ({ value: String(c.id), label: c.name }))}
              value={String(form.category_id ?? '')}
              onChange={v => setF('category_id', v ? Number(v) : null)}
              placeholder="Sin categoría"
            />
          ) : (
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.category_id ?? ''} onChange={e => setF('category_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Precio venta *</label>
            <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.sale_price} onChange={e => setF('sale_price', Math.max(0, Number(e.target.value) || 0))} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo afectación IGV</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.igv_affectation_type} onChange={e => {
                const v = e.target.value
                setF('igv_affectation_type', v)
                if (!isGravadoIgv(v)) setF('price_includes_igv', false)
              }}>
              {IGV_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {isGravadoIgv(form.igv_affectation_type) && (
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => setF('price_includes_igv', !form.price_includes_igv)}
            className={`w-10 h-5 rounded-full transition-colors ${form.price_includes_igv ? 'bg-[rgb(var(--p500))]' : 'bg-gray-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${form.price_includes_igv ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs text-gray-600">Precio incluye IGV</span>
        </label>
        )}

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Inventario (bebidas, insumos)</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.manage_stock} onChange={e => setF('manage_stock', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Control de inventario</span>
          </label>
          {form.manage_stock && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock mínimo</label>
              <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.min_stock ?? 0} onChange={e => setF('min_stock', Number(e.target.value))} />
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Modificadores (tamaño, adicionales, cocción)</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.has_modifiers ?? false} onChange={e => setF('has_modifiers', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Usar modificadores</span>
          </label>
          {form.has_modifiers && modifierGroups.length > 0 && (
            <div className="space-y-1.5 pl-4">
              <p className="text-xs text-gray-500">Grupos a aplicar:</p>
              {modifierGroups.map(g => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(form.modifier_group_ids ?? []).includes(g.id)} onChange={e => {
                    const ids = form.modifier_group_ids ?? []
                    setF('modifier_group_ids', e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id))
                  }} className="rounded" />
                  <span className="text-sm text-gray-700">{g.name}</span>
                  {g.required && <span className="text-xs text-amber-600">(obligatorio)</span>}
                </label>
              ))}
            </div>
          )}
          {form.has_modifiers && modifierGroups.length === 0 && (
            <p className="text-xs text-amber-600">Crea grupos de modificadores en Productos → Opciones avanzadas.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
        </div>
      </Modal>
    </div>
  )
}
