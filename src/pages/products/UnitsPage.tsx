import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Ruler, Plus, Pencil, Trash2, Search } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { productsService, type Unit } from '@/services/products.service'

const FORM_INPUT =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))] focus:border-[rgb(var(--p400))]'

const MODAL_CLASS =
  'w-full max-w-none sm:max-w-lg max-h-[min(92dvh,640px)] !overflow-hidden flex flex-col gap-0 !p-0'

type UnitFormState = {
  code: string
  name: string
  symbol: string
  active: boolean
}

function emptyForm(): UnitFormState {
  return { code: '', name: '', symbol: '', active: true }
}

function formFromUnit(u: Unit): UnitFormState {
  return { code: u.code, name: u.name, symbol: u.symbol ?? '', active: u.active }
}

export default function UnitsPage() {
  return (
    <RequireModule moduleKey="products">
      <UnitsContent />
    </RequireModule>
  )
}

function UnitsContent() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [form, setForm] = useState<UnitFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    productsService
      .listUnits({ all: true })
      .then((list) => setUnits(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Error al cargar unidades de medida'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return units
    return units.filter(
      (u) =>
        u.code.toLowerCase().includes(term) ||
        u.name.toLowerCase().includes(term) ||
        (u.symbol ?? '').toLowerCase().includes(term),
    )
  }, [units, q])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (u: Unit) => {
    setEditing(u)
    setForm(formFromUnit(u))
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase()
    const name = form.name.trim()
    if (!code) {
      toast.error('Ingresa el código SUNAT (ej. NIU, KGM, ZZ)')
      return
    }
    if (!name) {
      toast.error('Ingresa un nombre')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await productsService.updateUnit(editing.id, {
          code,
          name,
          symbol: form.symbol.trim(),
          active: form.active,
        })
        toast.success('Unidad actualizada')
      } else {
        await productsService.createUnit({ code, name, symbol: form.symbol.trim() })
        toast.success('Unidad creada')
      }
      closeModal()
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al guardar la unidad')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await productsService.deleteUnit(deleteTarget.id)
      toast.success('Unidad eliminada')
      if (editing?.id === deleteTarget.id) closeModal()
      setDeleteTarget(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'No se pudo eliminar la unidad')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Ruler size={20} className="text-[rgb(var(--p600))]" />
            Unidades de medida
          </h2>
          <p className="text-sm text-gray-500">
            Catálogo SUNAT (N°03) de tus productos — se usa en Tukifac y Tukichef al crear o
            editar un producto. Las marcadas "Sistema" vienen precargadas; agrega las tuyas
            libremente.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} />
            Nueva unidad
          </button>
        )}
      </div>

      <div className="relative flex-1 min-w-52 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar por código, nombre o símbolo…"
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
                {['Código', 'Nombre', 'Símbolo', 'Origen', 'Estado', ''].map((h) => (
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
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {loading
                      ? 'Cargando…'
                      : q.trim()
                        ? 'No hay unidades que coincidan con la búsqueda'
                        : 'No hay unidades registradas'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-gray-800">{u.code}</td>
                    <td className="px-4 py-3 text-gray-800">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.symbol?.trim() || '—'}</td>
                    <td className="px-4 py-3">
                      {u.is_system ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Sistema
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--p50))] text-[rgb(var(--p700))]">
                          Propia
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {u.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-24">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                            aria-label={`Editar ${u.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && !u.is_system && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            aria-label={`Eliminar ${u.name}`}
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
            {editing ? 'Editar unidad de medida' : 'Nueva unidad de medida'}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            El código debe coincidir con el catálogo SUNAT N°03 (ej. NIU, KGM, LTR, ZZ) para que
            se facture correctamente.
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código SUNAT *</label>
            <input
              className={`${FORM_INPUT} font-mono uppercase`}
              placeholder="Ej. NIU"
              value={form.code}
              maxLength={10}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              disabled={!!editing?.is_system}
              autoFocus
            />
            {editing?.is_system && (
              <p className="text-xs text-amber-600 mt-1">
                Las unidades del sistema no cambian de código — desactívala si no la usas.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input
              className={FORM_INPUT}
              placeholder="Ej. Unidades, Kilos, Servicio…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Símbolo (opcional)</label>
            <input
              className={FORM_INPUT}
              placeholder="Ej. UND, KG, SERV"
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            />
          </div>
          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="unit-active"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <label htmlFor="unit-active" className="text-sm text-gray-600">
                Activa (visible en el select de productos)
              </label>
            </div>
          )}
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
            disabled={saving || !form.name.trim() || !form.code.trim()}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear unidad'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar unidad de medida"
        message={deleteTarget ? <>¿Eliminar la unidad <strong>{deleteTarget.name}</strong>?</> : null}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
