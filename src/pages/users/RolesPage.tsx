import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { usersService, type Role, type Permission } from '@/services/users.service'
import { Modal } from '@/components/ui/Modal'

const empty = () => ({ name: '', description: '', permission_ids: [] as number[] })

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [form, setForm] = useState<ReturnType<typeof empty>>(empty())
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([usersService.listRoles(), usersService.listPermissions()])
    .then(([r, p]) => { setRoles(r ?? []); setPermissions(p ?? []) })
    .catch(() => toast.error('Error'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = async (r: Role) => {
    try {
      const detail = await usersService.getRole(r.id)
      setEditing(r)
      setForm({ name: r.name, description: r.description, permission_ids: detail.permission_ids ?? [] })
      setShow(true)
    } catch { toast.error('Error cargando rol') }
  }

  const togglePerm = (id: number) =>
    setForm(f => ({
      ...f,
      permission_ids: f.permission_ids.includes(id) ? f.permission_ids.filter(p => p !== id) : [...f.permission_ids, id],
    }))

  const handleSave = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      if (editing) await usersService.updateRole(editing.id, form)
      else await usersService.createRole(form)
      toast.success(editing ? 'Rol actualizado' : 'Rol creado')
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este rol?')) return
    try { await usersService.deleteRole(id); toast.success('Eliminado'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'No se puede eliminar') }
  }

  // Agrupar permisos por módulo
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const mod = p.module || 'general'
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(p)
    return acc
  }, {})

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-gray-800">Roles y Permisos</h2><p className="text-sm text-gray-500">Control de acceso por perfil</p></div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo rol
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {roles.map(r => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800">{r.name}</p>
                {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={13} /></button>
                <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {roles.length === 0 && <div className="bg-white rounded-2xl shadow-sm text-center py-10 text-gray-400 text-sm">No hay roles registrados</div>}

      <Modal open={show} onClose={() => setShow(false)}>
        <h3 className="font-bold text-gray-800">{editing ? 'Editar rol' : 'Nuevo rol'}</h3>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Permisos ({form.permission_ids.length} seleccionados)</label>
          <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-100 rounded-xl p-3">
            {Object.entries(grouped).map(([mod, perms]) => (
              <div key={mod}>
                <div className="flex items-center gap-2 mb-1.5">
                  <ChevronDown size={12} className="text-gray-400" />
                  <span className="text-xs font-semibold uppercase text-gray-500">{mod}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pl-4">
                  {perms.map(p => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                      <input type="checkbox" checked={form.permission_ids.includes(p.id)} onChange={() => togglePerm(p.id)} className="rounded" />
                      {p.action}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {permissions.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Sin permisos disponibles</p>}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
