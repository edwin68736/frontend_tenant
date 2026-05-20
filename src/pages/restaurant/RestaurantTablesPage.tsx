import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Armchair } from 'lucide-react'
import { restaurantService, type RestaurantTable, type Floor } from '@/services/restaurant.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'

const STATUS_COLORS: Record<string, string> = {
  libre: 'bg-green-100 text-green-700 border-green-200',
  ocupada: 'bg-red-100 text-red-600 border-red-200',
  en_consumo: 'bg-orange-100 text-orange-700 border-orange-200',
  reservada: 'bg-blue-100 text-blue-700 border-blue-200',
}
const STATUS_LABELS: Record<string, string> = {
  libre: 'Libre', ocupada: 'Ocupada', en_consumo: 'En consumo', reservada: 'Reservada',
}

const empty = (floorId?: number) => ({ floor_id: floorId ?? 0, name: '', capacity: 4 })

export default function RestaurantTablesPage() {
  return <RequireModule moduleKey="restaurant"><TablesContent /></RequireModule>
}

function TablesContent() {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [filterFloor, setFilterFloor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<RestaurantTable | null>(null)
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([restaurantService.listTables(filterFloor ?? undefined), restaurantService.listFloors()])
    .then(([t, f]) => { setTables(t ?? []); setFloors(f ?? []) })
    .catch((e: any) => toast.error(e?.response?.data?.error ?? 'Error cargando mesas'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [filterFloor])

  const openNew = () => { setEditing(null); setForm(empty(filterFloor ?? undefined)); setShow(true) }
  const openEdit = (t: RestaurantTable) => { setEditing(t); setForm({ floor_id: t.floor_id, name: t.name, capacity: t.capacity }); setShow(true) }

  const handleSave = async () => {
    if (!form.name || !form.floor_id) { toast.error('Nombre y piso requeridos'); return }
    setSaving(true)
    try {
      if (editing) await restaurantService.updateTable(editing.id, form)
      else await restaurantService.createTable(form)
      toast.success(editing ? 'Mesa actualizada' : 'Mesa creada')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta mesa?')) return
    try { await restaurantService.deleteTable(id); toast.success('Eliminada'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-lg font-bold text-gray-800">Mesas</h2><p className="text-sm text-gray-500">Configuración de mesas (vista operativa en app de comandas)</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nueva mesa
        </button>
      </div>

      {/* Filtro por piso */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterFloor(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${filterFloor === null ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Todos los pisos
        </button>
        {floors.map(f => (
          <button key={f.id} onClick={() => setFilterFloor(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filterFloor === f.id ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}>
            {f.name}
          </button>
        ))}
      </div>

      {/* Grid de mesas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {tables.map(t => (
          <div key={t.id} className={`relative bg-white rounded-2xl shadow-sm p-4 border-2 ${STATUS_COLORS[t.status] ?? 'border-gray-200'}`}>
            <div className="absolute top-2 right-2 flex gap-0.5">
              <button onClick={() => openEdit(t)} className="p-1 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-white rounded-lg"><Pencil size={11} /></button>
              <button onClick={() => handleDelete(t.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg"><Trash2 size={11} /></button>
            </div>
            <div className="flex flex-col items-center text-center pt-2">
              <Armchair size={24} className={t.status === 'libre' ? 'text-green-500' : 'text-gray-400'} />
              <p className="font-bold text-gray-800 text-sm mt-2">{t.name}</p>
              <p className="text-xs text-gray-400">{t.capacity} personas</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 ${STATUS_COLORS[t.status] ?? ''}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
            </div>
          </div>
        ))}
      </div>
      {tables.length === 0 && <div className="bg-white rounded-2xl shadow-sm text-center py-12 text-gray-400 text-sm">Sin mesas registradas</div>}

      <Modal open={show} onClose={() => setShow(false)}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar mesa' : 'Nueva mesa'}</h3>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Piso *</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.floor_id} onChange={e => setForm(f => ({ ...f, floor_id: Number(e.target.value) }))}>
            <option value={0}>Seleccionar...</option>
            {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre de mesa *</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Mesa 1, Terraza A..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Capacidad (personas)</label>
          <input type="number" min={1} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} /></div>
        <div className="flex gap-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
        </div>
      </Modal>
    </div>
  )
}
