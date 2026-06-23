import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Star, Car } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { fleetService, type GreVehicle } from '@/services/fleet.service'

export default function VehiculosPage() {
  return (
    <RequireModule moduleKey="billing">
      <VehiculosContent />
    </RequireModule>
  )
}

function VehiculosContent() {
  const [list, setList] = useState<GreVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<GreVehicle | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    plate: '',
    brand: '',
    model: '',
    habilitation_cert: '',
    is_default: false,
    active: true,
  })

  const load = () => {
    setLoading(true)
    fleetService
      .listVehicles({ q: q.trim() || undefined })
      .then(setList)
      .catch(() => toast.error('Error al cargar vehículos'))
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
      plate: '',
      brand: '',
      model: '',
      habilitation_cert: '',
      is_default: false,
      active: true,
    })
    setShowModal(true)
  }

  const openEdit = (row: GreVehicle) => {
    setEditing(row)
    setForm({
      plate: row.plate,
      brand: row.brand ?? '',
      model: row.model ?? '',
      habilitation_cert: row.habilitation_cert ?? '',
      is_default: row.is_default,
      active: row.active,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.plate.trim()) {
      toast.error('La placa es obligatoria')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await fleetService.updateVehicle(editing.id, form)
        toast.success('Vehículo actualizado')
      } else {
        await fleetService.createVehicle(form)
        toast.success('Vehículo registrado')
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

  const handleToggle = async (row: GreVehicle) => {
    try {
      await fleetService.toggleVehicle(row.id)
      toast.success(row.active ? 'Vehículo desactivado' : 'Vehículo activado')
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
            <Car size={22} className="text-[rgb(var(--p600))]" />
            Vehículos GRE
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Placas y certificado de habilitación vehicular para guías SUNAT.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--p600))] text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Nuevo vehículo
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar por placa, marca o modelo..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No hay vehículos registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Cert. habilitación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((row) => (
                <tr key={row.id} className={!row.active ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-mono font-medium">
                    {row.plate}
                    {row.is_default && (
                      <span className="ml-2 inline-flex text-amber-600" title="Predeterminado">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.brand || '—'}</td>
                  <td className="px-4 py-3">{row.model || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.habilitation_cert || '—'}</td>
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
        <h3 className="font-bold text-gray-900 mb-4">{editing ? 'Editar vehículo' : 'Nuevo vehículo'}</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Placa *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono uppercase"
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
              placeholder="ABC-123"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Certificado habilitación vehicular</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
              value={form.habilitation_cert}
              onChange={(e) => setForm((f) => ({ ...f, habilitation_cert: e.target.value }))}
              placeholder="Nº certificado SUNAT / MTC"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Usar como vehículo predeterminado en guías
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
