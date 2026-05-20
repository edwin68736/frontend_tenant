import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search } from 'lucide-react'
import { usersService, type TenantUser, type Role } from '@/services/users.service'
import { restaurantService } from '@/services/restaurant.service'
import { companyService } from '@/services/company.service'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SearchSelect, MIN_OPTIONS_FOR_SEARCH } from '@/components/ui/SearchSelect'

const RESTAURANT_ROLES = [
  { value: '', label: 'Sin rol' },
  { value: 'admin', label: 'Administrador de restaurante' },
  { value: 'vendedor', label: 'Vendedor / Cajero' },
  { value: 'mozo', label: 'Mozo' },
  { value: 'cocinero', label: 'Cocinero' },
]

const empty = () => ({ name: '', email: '', password: '', role_id: 0, branch_id: 0 })

export default function UsersPage() {
  const { hasModule } = useAuth()
  const hasRestaurant = hasModule('restaurant')
  const [users, setUsers] = useState<TenantUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [restaurantRoles, setRestaurantRoles] = useState<Record<string, string>>({})
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<TenantUser | null>(null)
  const [form, setForm] = useState<ReturnType<typeof empty>>(empty())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    const promises: Promise<unknown>[] = [
      usersService.listUsers(q).then(u => setUsers(u ?? [])),
      usersService.listRoles().then(r => setRoles(r ?? [])),
      companyService.listBranches().then(b => setBranches(b ?? [])),
    ]
    if (hasRestaurant) {
      promises.push(restaurantService.listRestaurantRoleAssignments().then(m => setRestaurantRoles(m ?? {})))
    }
    return Promise.all(promises)
      .catch(() => toast.error('Error cargando usuarios'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [q, hasRestaurant])

  const openNew = () => { setEditing(null); setForm(empty()); setShow(true) }
  const openEdit = (u: TenantUser) => {
    setEditing(u)
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role_id: u.role_id ?? 0,
      branch_id: u.branch_id != null ? u.branch_id : 0,
    })
    setShow(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email || (!editing && !form.password) || !form.role_id) {
      toast.error('Nombre, email, rol y contraseña son requeridos'); return
    }
    setSaving(true)
    try {
      if (editing != null && typeof editing.id === 'number' && editing.id > 0) {
        const payload: { name: string; email: string; password?: string; role_id: number; branch_id?: number | null; active: boolean } = {
          name: form.name,
          email: form.email,
          role_id: form.role_id,
          branch_id: form.branch_id === 0 ? null : form.branch_id,
          active: editing.active,
        }
        if (form.password.trim()) payload.password = form.password
        await usersService.updateUser(editing.id, payload)
        toast.success('Usuario actualizado')
      } else {
        await usersService.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role_id: form.role_id,
          branch_id: form.branch_id === 0 ? undefined : form.branch_id,
        })
        toast.success('Usuario creado')
      }
      setShow(false)
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? e.response?.data?.message ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await usersService.deleteUser(id)
      toast.success('Eliminado')
      setConfirmDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (u: TenantUser) => {
    try { await usersService.toggleUser(u.id); load() }
    catch { toast.error('Error') }
  }

  const handleRestaurantRoleChange = async (userId: number, role: string) => {
    if (!hasRestaurant) return
    try {
      await restaurantService.setUserRestaurantRole(userId, role)
      toast.success('Rol de restaurante actualizado')
      setRestaurantRoles(prev => ({ ...prev, [String(userId)]: role }))
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error')
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Usuarios</h2>
          <p className="text-sm text-gray-500">Acceso al sistema</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 flex-shrink-0"
        >
          <Plus size={15} /> Nuevo usuario
        </button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm" placeholder="Buscar usuario..."
          value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Nombre','Email','Rol','Estado', ...(hasRestaurant ? ['Rol restaurante'] : []), ''].map(h => (
                  <th key={h} className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 sm:px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{u.name}</td>
                  <td className="px-3 sm:px-4 py-3 text-gray-500 text-xs sm:text-sm min-w-0 max-w-[180px] sm:max-w-none truncate">{u.email}</td>
                  <td className="px-3 sm:px-4 py-3"><span className="bg-[rgb(var(--p100))] text-[rgb(var(--p700))] text-xs px-2 py-0.5 rounded-full whitespace-nowrap">{u.role_name ?? `Rol #${u.role_id}`}</span></td>
                  <td className="px-3 sm:px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{u.active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  {hasRestaurant && (
                    <td className="px-3 sm:px-4 py-3">
                      <select
                        value={restaurantRoles[String(u.id)] ?? ''}
                        onChange={e => handleRestaurantRoleChange(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white min-w-[120px] sm:min-w-[140px]"
                      >
                        {RESTAURANT_ROLES.map(r => (
                          <option key={r.value || 'none'} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleToggle(u)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg" title={u.active ? 'Desactivar' : 'Activar'}>
                        {u.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDeleteId(u.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No se encontraron usuarios</div>}
      </div>

      <Modal open={show} onClose={() => setShow(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h3>
        <div className="space-y-4">
          {[['name','Nombre *'],['email','Email *']].map(([k,l]) => (
            <div key={k}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
              <input type={k === 'email' ? 'email' : 'text'} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
          ))}
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Contraseña {editing && '(dejar vacío para no cambiar)'}</label>
            <input type="password" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Rol *</label>
              {roles.length >= MIN_OPTIONS_FOR_SEARCH ? (
                <SearchSelect
                  options={roles.map(r => ({ value: String(r.id), label: r.name }))}
                  value={form.role_id > 0 ? String(form.role_id) : ''}
                  onChange={v => setForm(f => ({ ...f, role_id: v ? Number(v) : 0 }))}
                  placeholder="Seleccionar..."
                />
              ) : (
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.role_id > 0 ? form.role_id : ''}
                  onChange={e => setForm(f => ({ ...f, role_id: Number(e.target.value) || 0 }))}>
                  <option value="">Seleccionar...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
              {branches.length >= MIN_OPTIONS_FOR_SEARCH ? (
                <SearchSelect
                  options={branches.map(b => ({ value: String(b.id), label: b.name }))}
                  value={form.branch_id > 0 ? String(form.branch_id) : ''}
                  onChange={v => setForm(f => ({ ...f, branch_id: v ? Number(v) : 0 }))}
                  placeholder="Todas"
                />
              ) : (
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.branch_id > 0 ? form.branch_id : ''}
                  onChange={e => setForm(f => ({ ...f, branch_id: Number(e.target.value) || 0 }))}>
                  <option value="">Todas</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button onClick={() => setShow(false)} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteId != null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => { if (confirmDeleteId != null) await handleDelete(confirmDeleteId) }}
        title="Eliminar usuario"
        message="¿Está seguro de eliminar este usuario? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
