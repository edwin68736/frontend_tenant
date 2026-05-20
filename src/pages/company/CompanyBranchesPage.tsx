import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { companyService } from '@/services/company.service'
import { Modal } from '@/components/ui/Modal'

interface Branch {
  id: number; name: string; address: string; phone: string; is_main: boolean; active?: boolean
}

const empty = (): Partial<Branch> => ({ name: '', address: '', phone: '', is_main: false })

export default function CompanyBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [form, setForm] = useState<Partial<Branch>>(empty())
  const [saving, setSaving] = useState(false)

  const load = () => companyService.listBranches().then(d => { setBranches(d ?? []); setLoading(false) }).catch(() => { toast.error('Error'); setLoading(false) })
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = (b: Branch) => { setEditing(b); setForm({ name: b.name, address: b.address, phone: b.phone, is_main: b.is_main }); setShow(true) }

  const handleSave = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      if (editing) await companyService.updateBranch(editing.id, form)
      else await companyService.createBranch(form as any)
      toast.success(editing ? 'Sucursal actualizada' : 'Sucursal creada')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta sucursal?')) return
    try { await companyService.deleteBranch(id); toast.success('Eliminada'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error al eliminar') }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-gray-800">Sucursales</h2><p className="text-sm text-gray-500">Sedes y puntos de venta</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nueva sucursal
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['Nombre','Dirección','Teléfono','Principal',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2"><MapPin size={14} className="text-gray-400" />{b.name}</td>
                <td className="px-4 py-3 text-gray-600">{b.address || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{b.phone || '-'}</td>
                <td className="px-4 py-3">{b.is_main && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Principal</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={14} /></button>
                    {!b.is_main && <button onClick={() => handleDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {branches.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No hay sucursales registradas</div>}
      </div>

      <Modal open={show} onClose={() => setShow(false)}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
        {[['name','Nombre *'],['address','Dirección'],['phone','Teléfono']].map(([k,l]) => (
          <div key={k}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={(form as any)[k] ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
        ))}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_main" checked={form.is_main ?? false} onChange={e => setForm(f => ({ ...f, is_main: e.target.checked }))} className="rounded" />
          <label htmlFor="is_main" className="text-sm text-gray-700">Sucursal principal</label>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
