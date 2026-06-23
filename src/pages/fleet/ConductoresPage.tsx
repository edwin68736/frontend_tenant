import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Star, UserCircle } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { fleetService, type GreDriver } from '@/services/fleet.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'
import { isValidGreLicencia, normalizeGreLicencia } from '@/utils/greDriver'

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
      setShowModal(false)
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserCircle size={22} className="text-[rgb(var(--p600))]" />
            Conductores GRE
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Choferes para traslado privado y guías transportista (DriverPerson SUNAT).
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--p600))] text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Nuevo conductor
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar por documento o nombre..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No hay conductores registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Licencia</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((row) => (
                <tr key={row.id} className={!row.active ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.doc_type}-{row.doc_number}
                    {row.is_default && (
                      <span className="ml-2 inline-flex text-amber-600" title="Predeterminado">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.license_number || '—'}</td>
                  <td className="px-4 py-3">{row.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggle(row)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(row)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Editar">
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} contentClassName="max-w-lg">
        <h3 className="font-bold text-gray-900 mb-4">{editing ? 'Editar conductor' : 'Nuevo conductor'}</h3>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
                value={form.doc_number}
                onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº licencia de conducir *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
              value={form.license_number}
              onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value.toUpperCase() }))}
              placeholder="9-10 caracteres (ej. 0001122020)"
            />
            <p className="text-[11px] text-gray-500 mt-1">No use el DNI. Valide en slcp.mtc.gob.pe</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Usar como conductor predeterminado en guías
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
