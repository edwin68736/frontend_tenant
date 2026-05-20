import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Plus, X, ArrowUpRight, ArrowDownLeft, Banknote, Pencil } from 'lucide-react'
import { cashbankService, type BankAccount, type BankMovement } from '@/services/cashbank.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { getTodayPeru } from '@/utils/datesPeru'

const emptyAccount = () => ({ name: '', bank_name: '', account_number: '', currency: 'PEN', type: 'bank', initial_balance: 0, active: true })
const emptyMov = () => ({ type: 'credit' as 'credit' | 'debit', description: '', reference: '', amount: 0, date: getTodayPeru() })

export default function BankPage() {
  return <RequireModule moduleKey="cashbank"><BankContent /></RequireModule>
}

function BankContent() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selected, setSelected] = useState<BankAccount | null>(null)
  const [movements, setMovements] = useState<BankMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMovs, setLoadingMovs] = useState(false)

  const [showAccount, setShowAccount] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [accountForm, setAccountForm] = useState(emptyAccount())

  const [showMov, setShowMov] = useState(false)
  const [movForm, setMovForm] = useState(emptyMov())
  const [saving, setSaving] = useState(false)

  const load = () => cashbankService.listBankAccounts(true)
    .then(d => setAccounts(d ?? []))
    .catch(() => toast.error('Error'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const selectAccount = async (acc: BankAccount) => {
    setSelected(acc)
    setLoadingMovs(true)
    try { setMovements(await cashbankService.listBankMovements(acc.id)) }
    catch { toast.error('Error') }
    finally { setLoadingMovs(false) }
  }

  const handleCreateAccount = async () => {
    if (!accountForm.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      await cashbankService.createBankAccount({ ...accountForm, bank_name: accountForm.bank_name || accountForm.name })
      toast.success('Cuenta creada')
      setShowAccount(false)
      setEditingAccount(null)
      setAccountForm(emptyAccount())
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleUpdateAccount = async () => {
    if (!editingAccount || !accountForm.name) { toast.error('Nombre requerido'); return }
    setSaving(true)
    try {
      await cashbankService.updateBankAccount(editingAccount.id, {
        name: accountForm.name,
        bank_name: accountForm.bank_name,
        account_number: accountForm.account_number,
        type: accountForm.type,
        active: accountForm.active !== false,
      })
      toast.success('Cuenta actualizada')
      setShowAccount(false)
      setEditingAccount(null)
      setAccountForm(emptyAccount())
      load()
      if (selected?.id === editingAccount.id) setSelected(null)
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const openEdit = (acc: BankAccount, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingAccount(acc)
    setAccountForm({
      name: acc.name,
      bank_name: acc.bank_name,
      account_number: acc.account_number || '',
      currency: acc.currency || 'PEN',
      type: acc.type || 'bank',
      initial_balance: acc.balance,
      active: acc.active,
    })
    setShowAccount(true)
  }

  const handleAddMovement = async () => {
    if (!selected || !movForm.amount) { toast.error('Monto requerido'); return }
    setSaving(true)
    try { await cashbankService.addBankMovement(selected.id, movForm); toast.success('Movimiento registrado'); setShowMov(false); selectAccount(selected) }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Cuentas Bancarias</h2>
          <p className="text-sm text-gray-500">Gestión de cuentas y movimientos</p>
        </div>
        <button
          onClick={() => { setEditingAccount(null); setAccountForm(emptyAccount()); setShowAccount(true) }}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 flex-shrink-0"
        >
          <Plus size={15} /> Nueva cuenta
        </button>
      </div>

      {/* Grid de cuentas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {accounts.map(acc => (
          <div key={acc.id} onClick={() => selectAccount(acc)}
            className={`text-left bg-white rounded-2xl shadow-sm p-4 border-2 transition-all hover:shadow-md cursor-pointer ${selected?.id === acc.id ? 'border-[rgb(var(--p400))]' : 'border-transparent'}`}>
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 bg-[rgb(var(--p50))] rounded-xl flex items-center justify-center"><Banknote size={18} className="text-[rgb(var(--p500))]" /></div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${acc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{acc.active ? 'Activa' : 'Inactiva'}</span>
                <button onClick={e => openEdit(acc, e)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={14} /></button>
              </div>
            </div>
            <p className="font-bold text-gray-800 mt-3">{acc.name}</p>
            <p className="text-xs text-gray-500">
              {acc.type === 'wallet' ? 'Billetera' : acc.type === 'cash' ? 'Caja' : acc.bank_name}
              {acc.account_number ? ` · ${acc.account_number}` : ''}
            </p>
            <p className="text-xl font-bold text-[rgb(var(--p600))] mt-2">{acc.currency} {Number(acc.balance).toFixed(2)}</p>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center py-16 text-center">
            <Banknote size={32} className="text-gray-300 mb-3" />
            <p className="text-gray-500">No hay cuentas bancarias registradas</p>
          </div>
        )}
      </div>

      {/* Movimientos de la cuenta seleccionada */}
      {selected && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-100">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700 truncate">{selected.name} — Movimientos</p>
              <p className="text-xs text-gray-400">Saldo actual: {selected.currency} {Number(selected.balance).toFixed(2)}</p>
            </div>
            <button
              onClick={() => { setMovForm(emptyMov()); setShowMov(true) }}
              className="flex items-center justify-center gap-1 w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-xs sm:text-sm font-medium hover:opacity-90 flex-shrink-0"
            >
              <Plus size={12} /> Movimiento
            </button>
          </div>
          {loadingMovs ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              {movements.map(m => (
                <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {m.type === 'credit' ? <ArrowDownLeft size={14} className="text-green-500 flex-shrink-0" /> : <ArrowUpRight size={14} className="text-red-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{m.description}</p>
                      <p className="text-xs text-gray-400">{m.reference || '-'} · {new Date(m.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className={`font-bold text-sm flex-shrink-0 ${m.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {m.type === 'credit' ? '+' : '-'} S/ {Number(m.amount).toFixed(2)}
                  </p>
                </div>
              ))}
              {movements.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos registrados</div>}
            </div>
          )}
        </div>
      )}

      {/* Modal nueva/editar cuenta */}
      <Modal open={showAccount} onClose={() => { setShowAccount(false); setEditingAccount(null); setAccountForm(emptyAccount()) }} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-800 text-base sm:text-lg truncate">{editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <button onClick={() => setShowAccount(false)} className="p-1 -m-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Alias *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={accountForm.name}
              onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cuenta</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={accountForm.type}
              onChange={e => setAccountForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="bank">Cuenta bancaria</option>
              <option value="wallet">Billetera digital</option>
              <option value="cash">Caja / Efectivo</option>
            </select>
          </div>
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            Para vincular esta cuenta a pagos de ventas (Yape, Plin, transferencia, etc.), configúralo en{' '}
            <Link to="/cashbank/payment-methods" className="text-[rgb(var(--p600))] font-medium hover:underline">Métodos de pago</Link>.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Banco / Entidad</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={accountForm.bank_name}
              onChange={e => setAccountForm(f => ({ ...f, bank_name: e.target.value }))}
              placeholder="Ej. BCP, Yape, Caja"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">N° Cuenta / Referencia</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={accountForm.account_number}
              onChange={e => setAccountForm(f => ({ ...f, account_number: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={accountForm.currency}
                onChange={e => setAccountForm(f => ({ ...f, currency: e.target.value }))}
              >
                {['PEN', 'USD', 'EUR'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {!editingAccount ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Saldo inicial</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={accountForm.initial_balance}
                  onChange={e => setAccountForm(f => ({ ...f, initial_balance: Number(e.target.value) }))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Saldo actual</label>
                <p className="py-2 text-sm font-medium text-gray-700">{editingAccount.currency} {Number(editingAccount.balance).toFixed(2)}</p>
              </div>
            )}
          </div>
          {editingAccount && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="acc-active"
                checked={accountForm.active}
                onChange={e => setAccountForm(f => ({ ...f, active: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="acc-active" className="text-sm text-gray-700">Cuenta activa</label>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              onClick={() => setShowAccount(false)}
              className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={editingAccount ? handleUpdateAccount : handleCreateAccount}
              disabled={saving}
              className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {saving ? '...' : editingAccount ? 'Guardar' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal nuevo movimiento */}
      <Modal open={showMov} onClose={() => setShowMov(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-800 text-base sm:text-lg">Nuevo movimiento</h3>
          <button onClick={() => setShowMov(false)} className="p-1 -m-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[['credit', 'Abono'], ['debit', 'Cargo']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setMovForm(f => ({ ...f, type: v as 'credit' | 'debit' }))}
                  className={`py-2.5 sm:py-2 rounded-xl text-sm font-medium transition-colors ${
                    movForm.type === v
                      ? v === 'credit'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {[['description', 'Descripción *'], ['reference', 'Referencia']].map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={(movForm as any)[k]}
                onChange={e => setMovForm(f => ({ ...f, [k]: e.target.value }))}
              />
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto *</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={movForm.amount}
                onChange={e => setMovForm(f => ({ ...f, amount: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={movForm.date}
                onChange={e => setMovForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              onClick={() => setShowMov(false)}
              className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddMovement}
              disabled={saving}
              className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
