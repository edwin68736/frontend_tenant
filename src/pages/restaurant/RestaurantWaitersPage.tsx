import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, UserCog } from 'lucide-react'
import { restaurantService, type Waiter } from '@/services/restaurant.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'

const empty = () => ({ name: '', code: '' })

export default function RestaurantWaitersPage() {
  return <RequireModule moduleKey="restaurant"><WaitersContent /></RequireModule>
}

function WaitersContent() {
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Waiter | null>(null)
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)

  const load = () => restaurantService.listWaiters()
    .then(d => setWaiters(d ?? []))
    .catch(() => toast.error('Error'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = (w: Waiter) => { setEditing(w); setForm({ name: w.name, code: w.code }); setShow(true) }

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Nombre y código requeridos'); return }
    setSaving(true)
    try {
      if (editing) await restaurantService.updateWaiter(editing.id, form)
      else await restaurantService.createWaiter(form)
      toast.success(editing ? 'Mozo actualizado' : 'Mozo registrado')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este mozo?')) return
    try { await restaurantService.deleteWaiter(id); toast.success('Eliminado'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
  }

  const handleToggle = async (w: Waiter) => {
    try { await restaurantService.updateWaiter(w.id, { active: !w.active }); load() }
    catch { toast.error('Error') }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-gray-800">Mozos</h2><p className="text-sm text-gray-500">Personal de atención</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo mozo
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['Código','Nombre','Estado',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {waiters.map(w => (
              <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-bold text-[rgb(var(--p600))] text-xs">{w.code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[rgb(var(--p50))] rounded-lg flex items-center justify-center"><UserCog size={13} className="text-[rgb(var(--p500))]" /></div>
                    <span className="font-medium text-gray-800">{w.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{w.active ? 'Activo' : 'Inactivo'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => handleToggle(w)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg">
                      {w.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => openEdit(w)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(w.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {waiters.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Sin mozos registrados</div>}
      </div>

      <Modal open={show} onClose={() => setShow(false)}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar mozo' : 'Nuevo mozo'}</h3>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Código único *</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono uppercase"
            placeholder="MZ01" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
        <div className="flex gap-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
        </div>
      </Modal>
    </div>
  )
}
