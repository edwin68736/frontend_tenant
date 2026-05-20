import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Wallet, Building2 } from 'lucide-react'
import { cashbankService, type PaymentMethodRecord, type BankAccount } from '@/services/cashbank.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export default function PaymentMethodsPage() {
  return (
    <RequireModule moduleKey="cashbank">
      <PaymentMethodsContent />
    </RequireModule>
  )
}

function PaymentMethodsContent() {
  const [list, setList] = useState<PaymentMethodRecord[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PaymentMethodRecord | null>(null)
  const [form, setForm] = useState({
    name: '',
    code: '',
    destination_type: 'cash' as 'cash' | 'bank_account',
    bank_account_id: null as number | null,
    active: true,
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodRecord | null>(null)

  const load = () => {
    Promise.all([
      cashbankService.listPaymentMethods(true),
      cashbankService.listBankAccounts(true),
    ])
      .then(([methods, accounts]) => {
        setList(Array.isArray(methods) ? methods : [])
        setBankAccounts(Array.isArray(accounts) ? accounts : [])
      })
      .catch(() => toast.error('Error cargando'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', destination_type: 'cash', bank_account_id: null, active: true })
    setShowModal(true)
  }

  const openEdit = (pm: PaymentMethodRecord) => {
    setEditing(pm)
    setForm({
      name: pm.name,
      code: pm.code,
      destination_type: pm.destination_type as 'cash' | 'bank_account',
      bank_account_id: pm.bank_account_id ?? null,
      active: pm.active,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return }
    if (!form.code.trim()) { toast.error('Código requerido'); return }
    if (form.destination_type === 'bank_account' && !form.bank_account_id) {
      toast.error('Seleccione la cuenta bancaria de destino')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await cashbankService.updatePaymentMethod(editing.id, {
          name: form.name,
          code: form.code,
          destination_type: form.destination_type,
          bank_account_id: form.bank_account_id ?? undefined,
          active: form.active,
        })
        toast.success('Método actualizado')
      } else {
        await cashbankService.createPaymentMethod({
          name: form.name,
          code: form.code,
          destination_type: form.destination_type,
          bank_account_id: form.bank_account_id ?? undefined,
        })
        toast.success('Método creado')
      }
      setShowModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await cashbankService.deletePaymentMethod(deleteTarget.id)
      toast.success('Método eliminado')
      setDeleteTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Métodos de pago</h2>
          <p className="text-sm text-gray-500">Configure cómo se registran los pagos: en caja o en cuenta bancaria</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus size={15} /> Nuevo método
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Destino</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Estado</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.map(pm => (
                <tr key={pm.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{pm.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">{pm.code}</td>
                  <td className="px-4 py-3">
                    {pm.destination_type === 'cash' ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 whitespace-nowrap">
                        <Wallet size={14} /> Caja
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-blue-700">
                        <Building2 size={14} /> Cuenta bancaria
                        {pm.bank_account_id && (
                          <span className="text-gray-500">
                            (ID: {pm.bank_account_id})
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${pm.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {pm.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(pm)}
                        className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] rounded-lg hover:bg-gray-100"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      {!pm.is_system && (
                        <button
                          onClick={() => setDeleteTarget(pm)}
                          className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">{editing ? 'Editar método de pago' : 'Nuevo método de pago'}</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Efectivo, Yape"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
              placeholder="cash, yape, plin"
              disabled={editing?.is_system}
            />
            {editing?.is_system && <p className="text-xs text-amber-600 mt-1">El método efectivo no puede cambiar su código</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Destino del dinero</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.destination_type}
              onChange={e => setForm(f => ({ ...f, destination_type: e.target.value as 'cash' | 'bank_account', bank_account_id: e.target.value === 'cash' ? null : f.bank_account_id }))}
            >
              <option value="cash">Caja (efectivo físico)</option>
              <option value="bank_account">Cuenta bancaria</option>
            </select>
          </div>
          {form.destination_type === 'bank_account' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta bancaria</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.bank_account_id ?? ''}
                onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Seleccionar cuenta...</option>
                {bankAccounts.filter(a => a.active).map(a => (
                  <option key={a.id} value={a.id}>{a.name} {a.bank_name ? `— ${a.bank_name}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              />
              <label htmlFor="active" className="text-sm text-gray-600">Activo</label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar método de pago"
        message={deleteTarget ? `¿Eliminar "${deleteTarget.name}"?` : ''}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
