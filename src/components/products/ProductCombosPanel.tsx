import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, ImagePlus, UtensilsCrossed, Layers } from 'lucide-react'
import {
  getProductImageUrl,
  productsService,
  type ComboGroup,
  type Category,
  type Product,
} from '@/services/products.service'
import { PortalModal } from '@/components/ui/PortalModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ComboGroupsEditor } from '@/components/products/ComboGroupsEditor'
import { formatAmountDisplay } from '@/utils/money'
import { MODAL_FOOTER_SAFE } from '@/utils/safeAreaClasses'

const emptyForm = () => ({
  name: '',
  code: '',
  description: '',
  sale_price: 0,
  category_id: null as number | null,
  // Afectación del combo como tal: el comprobante lo lleva como una sola línea.
  igv_affectation_type: '10',
  price_includes_igv: true,
})

type Props = {
  branchId?: number | null
  categories?: Category[]
}

export function ProductCombosPanel({ branchId, categories = [] }: Props) {
  const [combos, setCombos] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [groups, setGroups] = useState<ComboGroup[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    setLoading(true)
    productsService
      .listCombos('')
      .then((rows) => setCombos(rows ?? []))
      .catch(() => setCombos([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [branchId])

  const resetForm = () => {
    setForm(emptyForm())
    setGroups([])
    setImageFile(null)
    setImagePreview(null)
  }

  const openCreate = () => {
    setEditing(null)
    resetForm()
    setModalOpen(true)
  }

  const openEdit = async (combo: Product) => {
    setEditing(combo)
    resetForm()
    setModalOpen(true)
    setLoadingDetail(true)
    try {
      const detail = await productsService.get(combo.id)
      setForm({
        name: detail.data.name,
        code: detail.data.code ?? '',
        description: detail.data.description ?? '',
        sale_price: Number(detail.data.sale_price) || 0,
        category_id: detail.data.category_id ?? null,
        igv_affectation_type: detail.data.igv_affectation_type || '10',
        price_includes_igv: detail.data.price_includes_igv ?? true,
      })
      setGroups(detail.combo_groups ?? [])
      setImagePreview(getProductImageUrl(detail.data.image_url) || null)
    } catch {
      toast.error('No se pudo cargar el combo')
      setModalOpen(false)
    } finally {
      setLoadingDetail(false)
    }
  }

  /** Suma de los componentes a precio de lista: es el «antes» frente al precio del combo. */
  const componentsTotal = useMemo(() => {
    let total = 0
    for (const g of groups) {
      if (g.selection_type === 'fixed') {
        for (const it of g.items) {
          total += (Number(it.product_sale_price) || 0) * (Number(it.default_quantity) || 1)
        }
        continue
      }
      const ref = g.items.find((it) => it.is_default) ?? g.items[0]
      if (!ref) continue
      const times = g.selection_type === 'multiple' ? Math.max(1, g.min_select) : 1
      total += (Number(ref.product_sale_price) || 0) * (Number(ref.default_quantity) || 1) * times
    }
    return total
  }, [groups])

  const savings = componentsTotal - (Number(form.sale_price) || 0)

  const onPickImage = (file: File | null) => {
    setImageFile(file)
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre del combo es requerido')
      return
    }
    if (!(Number(form.sale_price) > 0)) {
      toast.error('El precio del combo debe ser mayor a 0')
      return
    }
    if (groups.length === 0) {
      toast.error('Agrega al menos un grupo al combo')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        unit: 'NIU',
        sale_price: Number(form.sale_price),
        category_id: form.category_id,
        igv_affectation_type: form.igv_affectation_type,
        price_includes_igv: form.price_includes_igv,
        // El combo no lleva stock propio: lo descuentan sus componentes, cada uno según
        // tenga o no control de inventario.
        manage_stock: false,
        is_restaurant: false,
        combo_groups: groups,
      }
      // El backend valida de verdad (sucursal, anidamiento, mín/máx) y devuelve el error en español.
      const id = editing
        ? (await productsService.update(editing.id, payload), editing.id)
        : (await productsService.create(payload)).id
      if (imageFile) {
        await productsService.uploadImage(id, imageFile)
      }
      toast.success(editing ? 'Combo actualizado' : 'Combo creado')
      setModalOpen(false)
      resetForm()
      load()
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo guardar el combo'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await productsService.delete(deleteTarget.id)
      toast.success('Combo eliminado')
      setDeleteTarget(null)
      load()
    } catch {
      toast.error('No se pudo eliminar el combo')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <p className="text-xs text-stone-500">
          Un combo agrupa varios productos a un precio fijo. El stock se descuenta de cada
          componente que tenga control de inventario.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 shadow-sm shrink-0"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Agregar combo</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
      ) : combos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <Layers className="mx-auto text-gray-300" size={32} />
          <p className="mt-2 font-medium text-gray-700">Aún no hay combos</p>
          <p className="mt-1 text-sm text-gray-500">
            Cree uno para vender varios productos juntos a un precio especial.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 overflow-y-auto">
          {combos.map((combo) => {
            const img = getProductImageUrl(combo.image_url)
            return (
              <div
                key={combo.id}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3"
              >
                {img ? (
                  <img src={img} alt={combo.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <UtensilsCrossed size={18} className="text-amber-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{combo.name}</p>
                  <p className="text-xs text-stone-500">
                    {formatAmountDisplay(Number(combo.sale_price) || 0)}
                    {combo.code ? ` · ${combo.code}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(combo)}
                    className="p-2 rounded-lg text-stone-400 hover:text-primary-600 hover:bg-stone-50"
                    aria-label="Editar combo"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(combo)}
                    className="p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Eliminar combo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <PortalModal open onClose={() => setModalOpen(false)} className="max-w-2xl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-stone-200 shrink-0">
              <h3 className="font-bold text-stone-900 text-lg">
                {editing ? 'Editar combo' : 'Nuevo combo'}
              </h3>
            </div>

            {loadingDetail ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="flex gap-3">
                  <label className="shrink-0 cursor-pointer">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                    />
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Combo"
                        className="w-20 h-20 rounded-xl object-cover border border-stone-200"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 hover:border-primary-400">
                        <ImagePlus size={18} />
                        <span className="text-[10px] mt-0.5">Imagen</span>
                      </div>
                    )}
                  </label>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Nombre del combo (ej: Combo Familiar)"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex gap-2">
                      <input
                        value={form.code}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="Código (opcional)"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 text-sm"
                      />
                      <select
                        value={form.category_id ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            category_id: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 text-sm bg-white"
                      >
                        <option value="">Sin categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 p-3 space-y-2">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-stone-700">Precio del combo</span>
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={form.sale_price}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sale_price: Number(e.target.value) || 0 }))
                      }
                      className="w-28 px-3 py-2 rounded-lg border border-stone-200 text-sm text-right font-semibold"
                    />
                  </label>
                  {componentsTotal > 0 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-100">
                      <span className="text-stone-500">
                        Componentes por separado: {formatAmountDisplay(componentsTotal)}
                      </span>
                      <span
                        className={
                          savings > 0 ? 'font-semibold text-emerald-600' : 'text-stone-400'
                        }
                      >
                        {savings > 0
                          ? `El cliente ahorra ${formatAmountDisplay(savings)}`
                          : 'Sin ahorro frente a comprarlos sueltos'}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">Grupos del combo</p>
                  <ComboGroupsEditor
                    groups={groups}
                    onChange={setGroups}
                    branchId={branchId}
                    excludeProductId={editing?.id ?? null}
                  />
                </div>
              </div>
            )}

            <div className={`p-4 border-t border-stone-200 flex gap-2 shrink-0 ${MODAL_FOOTER_SAFE}`}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || loadingDetail}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear combo'}
              </button>
            </div>
          </div>
        </PortalModal>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar combo"
        message={
          deleteTarget
            ? `¿Eliminar «${deleteTarget.name}»? Los productos que lo componen no se tocan.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
