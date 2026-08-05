import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Star, UserCircle, Search } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { fleetService, type GreDriver } from '@/services/fleet.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'
import { isValidGreLicencia, normalizeGreLicencia } from '@/utils/greDriver'

const FORM_INPUT =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))] focus:border-[rgb(var(--p400))]'

const MODAL_CLASS =
  'w-full max-w-none sm:max-w-lg max-h-[min(92dvh,720px)] !overflow-hidden flex flex-col gap-0 !p-0'

export default function ConductoresPage() {
  return (
    <RequireModule moduleKey="billing">
      <ConductoresContent />
    </RequireModule>
  )
}

function ConductoresContent() {
  const [list, setList] = useState<GreDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<GreDriver | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    doc_type: '1',
    doc_number: '',
    full_name: '',
    license_number: '',
    phone: '',
    is_default: false,
    active: true,
  })

  const load = () => {
    setLoading(true)
    fleetService
      .listDrivers({ q: q.trim() || undefined })
      .then(setList)
      .catch(() => toast.error('Error al cargar conductores'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [q])

  const openNew = () => {
    setEditing(null)
    setForm({
      doc_type: '1',
      doc_number: '',
      full_name: '',
      license_number: '',
      phone: '',
      is_default: false,
      active: true,
    })
    setShowModal(true)
  }

  const openEdit = (row: GreDriver) => {
    setEditing(row)
    setForm({
      doc_type: row.doc_type || '1',
      doc_number: row.doc_number,
      full_name: row.full_name,
      license_number: row.license_number ?? '',
      phone: row.phone ?? '',
      is_default: row.is_default,
      active: row.active,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowModal(false)
    setEditing(null)
  }

  const handleSave = async () => {
    if (!form.doc_number.trim() || !form.full_name.trim()) {
      toast.error('Documento y nombre son obligatorios')
      return
    }
    const licNorm = normalizeGreLicencia(form.license_number)
    if (!licNorm) {
      toast.error('La licencia de conducir es obligatoria para guías GRE')
      return
    }
    if (!isValidGreLicencia(licNorm)) {
      toast.error('Licencia inválida: use 9-10 caracteres alfanuméricos (no el DNI)')
      return
    }
    if (form.doc_number.trim() === licNorm) {
      toast.error('La licencia no puede ser igual al documento')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, license_number: licNorm }
      if (editing) {
        await fleetService.updateDriver(editing.id, body)
        toast.success('Conductor actualizado')
      } else {
        await fleetService.createDriver(body)
        toast.success('Conductor registrado')
      }
      closeModal()
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (row: GreDriver) => {
    try {
      await fleetService.toggleDriver(row.id)
      toast.success(row.active ? 'Conductor desactivado' : 'Conductor activado')
      load()
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserCircle size={20} className="text-[rgb(var(--p600))]" />
            Conductores GRE
          </h2>
          <p className="text-sm text-gray-500">
            Choferes para traslado privado y guías transportista.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus size={15} />
          Nuevo conductor
        </button>
      </div>

      <div className="relative flex-1 min-w-52 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar por documento o nombre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center" aria-busy="true">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Documento', 'Nombre', 'Licencia', 'Teléfono', 'Estado', ''].map((h) => (
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
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {loading
                      ? 'Cargando…'
                      : q.trim()
                        ? 'No hay conductores que coincidan con la búsqueda'
                        : 'No hay conductores registrados'}
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!row.active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {row.doc_type}-{row.doc_number}
                      {row.is_default && (
                        <span className="ml-2 inline-flex text-amber-500" title="Predeterminado">
                          <Star size={12} fill="currentColor" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.license_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{row.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(row)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {row.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 w-16">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                          aria-label={`Editar ${row.full_name}`}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={closeModal} contentClassName={MODAL_CLASS} closeOnBackdropClick={!saving}>
        <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{editing ? 'Editar conductor' : 'Nuevo conductor'}</h3>
          <p className="text-xs text-gray-500 mt-1">Catálogo reutilizable al armar guías de remisión.</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
              <select
                className={FORM_INPUT}
                value={form.doc_type}
                onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
              >
                {SUNAT_TIPO_DOC_IDENTIDAD_LIST.filter((d) => ['1', '4', '7', '0'].includes(d.code)).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº documento *</label>
              <input
                className={`${FORM_INPUT} font-mono`}
                value={form.doc_number}
                onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
            <input
              className={FORM_INPUT}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº licencia de conducir *</label>
            <input
              className={`${FORM_INPUT} font-mono`}
              value={form.license_number}
              onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value.toUpperCase() }))}
              placeholder="9-10 caracteres (ej. 0001122020)"
            />
            <p className="text-xs text-gray-400 mt-1">No use el DNI. Valide en slcp.mtc.gob.pe</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              className={FORM_INPUT}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Usar como conductor predeterminado en guías
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
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
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar conductor'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
