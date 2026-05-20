import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { restaurantService, type Floor } from '@/services/restaurant.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'

const empty = () => ({ name: '', description: '' })

export default function RestaurantFloorsPage() {
  return <RequireModule moduleKey="restaurant"><FloorsContent /></RequireModule>
}

function FloorsContent() {
  const [floors, setFloors] = useState<Floor[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Floor | null>(null)
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)

  const load = () => restaurantService.listFloors()
    .then(d => setFloors(d ?? []))
    .catch((e: any) => toast.error(e?.response?.data?.error ?? 'Error cargando pisos'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = (f: Floor) => { setEditing(f); setForm({ name: f.name, description: f.description }); setShow(true) }

  const handleSave = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      if (editing) await restaurantService.updateFloor(editing.id, form)
      else await restaurantService.createFloor(form)
      toast.success(editing ? 'Piso actualizado' : 'Piso creado')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este piso?')) return
    try { await restaurantService.deleteFloor(id); toast.success('Eliminado'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-gray-800">Pisos / Salones</h2><p className="text-sm text-gray-500">Áreas del restaurante</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo piso
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {floors.map(f => (
          <div key={f.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 bg-[rgb(var(--p50))] rounded-xl flex items-center justify-center text-lg font-bold text-[rgb(var(--p600))]">
                {f.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(f)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={13} /></button>
                <button onClick={() => handleDelete(f.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
              </div>
            </div>
            <p className="font-bold text-gray-800 mt-3">{f.name}</p>
            {f.description && <p className="text-xs text-gray-500 mt-0.5">{f.description}</p>}
          </div>
        ))}
      </div>
      {floors.length === 0 && <div className="bg-white rounded-2xl shadow-sm text-center py-12 text-gray-400 text-sm">Sin pisos registrados</div>}

      <Modal open={show} onClose={() => setShow(false)}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar piso' : 'Nuevo piso'}</h3>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        <div className="flex gap-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
        </div>
      </Modal>
    </div>
  )
}
