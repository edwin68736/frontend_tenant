import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FolderTree, Plus, Pencil, Trash2, Search } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import {
  productsService,
  type Category,
  type CreateCategoryInput,
} from '@/services/products.service'

const FORM_INPUT =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))] focus:border-[rgb(var(--p400))]'

const MODAL_CLASS =
  'w-full max-w-none sm:max-w-lg max-h-[min(92dvh,640px)] !overflow-hidden flex flex-col gap-0 !p-0'

type CategoryFormState = {
  name: string
  description: string
  sort_order: string
}

function emptyForm(): CategoryFormState {
  return { name: '', description: '', sort_order: '' }
}

function formFromCategory(c: Category): CategoryFormState {
  return {
    name: c.name,
    description: c.description ?? '',
    sort_order: c.sort_order != null ? String(c.sort_order) : '',
  }
}

export default function CategoriesPage() {
  return (
    <RequireModule moduleKey="products">
      <CategoriesContent />
    </RequireModule>
  )
}

function CategoriesContent() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    productsService
      .listCategories({ withCounts: true })
      .then((list) => setCategories(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Error al cargar categorías'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return categories
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.description ?? '').toLowerCase().includes(term),
    )
  }, [categories, q])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (c: Category) => {
    setEditing(c)
    setForm(formFromCategory(c))
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Ingresa un nombre')
      return
    }
    const sortRaw = form.sort_order.trim()
    let sort_order: number | undefined
    if (sortRaw !== '') {
      const n = Number(sortRaw)
      if (!Number.isFinite(n) || n < 0) {
        toast.error('El orden debe ser un número válido')
        return
      }
      sort_order = Math.floor(n)
    }

    const payload: CreateCategoryInput = {
      name,
      description: form.description.trim(),
      ...(sort_order != null ? { sort_order } : {}),
    }

    setSaving(true)
    try {
      if (editing) {
        await productsService.updateCategory(editing.id, {
          name: payload.name,
          description: payload.description,
          sort_order: sort_order ?? editing.sort_order ?? 0,
        })
        toast.success('Categoría actualizada')
      } else {
        await productsService.createCategory(payload)
        toast.success('Categoría creada')
      }
      closeModal()
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al guardar categoría')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await productsService.deleteCategory(deleteTarget.id)
      toast.success('Categoría eliminada')
      if (editing?.id === deleteTarget.id) closeModal()
      setDeleteTarget(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'No se pudo eliminar la categoría')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FolderTree size={20} className="text-[rgb(var(--p600))]" />
            Categorías
          </h2>
          <p className="text-sm text-gray-500">
            Organiza tu catálogo de productos y servicios.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} />
            Nueva categoría
          </button>
        )}
      </div>

      <div className="relative flex-1 min-w-52 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar categoría…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[200px]">
        {loading && (
          <div
            className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center"
            aria-busy="true"
          >
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Orden', 'Nombre', 'Descripción', 'Productos', ''].map((h) => (
                  <th
                    key={h || 'actions'}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {loading
                      ? 'Cargando…'
                      : q.trim()
                        ? 'No hay categorías que coincidan con la búsqueda'
                        : 'No hay categorías registradas'}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 tabular-nums w-20">
                      {c.sort_order ?? 0}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {c.description?.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums w-24">
                      {c.product_count ?? 0}
                    </td>
                    <td className="px-4 py-3 w-24">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                            aria-label={`Editar ${c.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              if ((c.product_count ?? 0) > 0) {
                                toast.error(
                                  `No se puede eliminar: hay ${c.product_count} producto(s) vinculados`,
                                )
                                return
                              }
                              setDeleteTarget(c)
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            aria-label={`Eliminar ${c.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} contentClassName={MODAL_CLASS} closeOnBackdropClick={!saving}>
        <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">
            {editing ? 'Editar categoría' : 'Nueva categoría'}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Las categorías agrupan productos y servicios en listados, POS y reportes.
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input
              className={FORM_INPUT}
              placeholder="Ej. Bebidas, Electrónica…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
            <textarea
              className={`${FORM_INPUT} resize-none min-h-[4.5rem]`}
              rows={2}
              placeholder="Detalle breve de la categoría"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Orden (opcional)</label>
            <input
              className={FORM_INPUT}
              type="number"
              min={0}
              step={1}
              placeholder="Automático si se deja vacío"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
            <p className="text-xs text-gray-400 mt-1">Menor número = aparece primero en listados.</p>
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 py-3 bg-white flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar categoría"
        message={
          deleteTarget ? (
            <>
              ¿Eliminar la categoría <strong>{deleteTarget.name}</strong>?
              {(deleteTarget.product_count ?? 0) > 0 && (
                <span className="block mt-2 text-red-700 text-sm">
                  Tiene {deleteTarget.product_count} producto(s) vinculados. Debes reasignarlos antes de eliminar.
                </span>
              )}
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
