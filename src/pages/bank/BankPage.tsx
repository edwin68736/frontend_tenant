import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Plus, X, ArrowUpRight, ArrowDownLeft, Banknote, Pencil, Undo2 } from 'lucide-react'
import { cashbankService, type BankAccount, type BankMovement } from '@/services/cashbank.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { getTodayPeru } from '@/utils/datesPeru'

const emptyAccount = () => ({ name: '', bank_name: '', account_number: '', currency: 'PEN', type: 'bank', initial_balance: 0, active: true })
const emptyMov = () => ({ type: 'credit' as 'credit' | 'debit', description: '', reference: '', amount: 0, date: getTodayPeru() })
const MOV_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

type MovFilters = { from: string; to: string; type: '' | 'credit' | 'debit' }
const emptyMovFilters = (): MovFilters => ({ from: '', to: '', type: '' })

/**
 * Origen del movimiento, inferido de reversal_of_id/reference/sale_id/purchase_id — no hay un
 * campo "origin" en la API, así que se deriva acá para el badge. reversal_of_id manda primero:
 * una reversión también tiene sale_id (heredado del original), pero lo que importa mostrar es
 * que ESTE movimiento es la contrapartida de otro, no la venta en sí.
 */
function movementOrigin(m: BankMovement): { label: string; className: string } {
  if (m.reversal_of_id) return { label: 'Reversión', className: 'bg-orange-100 text-orange-700' }
  const ref = (m.reference || '').toUpperCase()
  if (ref.startsWith('NC/')) return { label: 'Nota de crédito', className: 'bg-violet-100 text-violet-700' }
  if (m.purchase_id) return { label: 'Compra', className: 'bg-blue-100 text-blue-700' }
  if (m.sale_id) return { label: 'Venta', className: 'bg-green-100 text-green-700' }
  return { label: 'Manual', className: 'bg-gray-100 text-gray-600' }
}

export default function BankPage() {
  return <RequireModule moduleKey="cashbank"><BankContent /></RequireModule>
}

function BankContent() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selected, setSelected] = useState<BankAccount | null>(null)
  const [movements, setMovements] = useState<BankMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMovs, setLoadingMovs] = useState(false)

  const [movTotal, setMovTotal] = useState(0)
  const [movPage, setMovPage] = useState(1)
  const [movPerPage, setMovPerPage] = useState(25)
  const [movSummary, setMovSummary] = useState({ sum_credit: 0, sum_debit: 0 })
  const [movFilters, setMovFilters] = useState<MovFilters>(emptyMovFilters())

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

  const loadMovements = async (accountId: number, page: number, filters: MovFilters, perPage: number) => {
    setLoadingMovs(true)
    try {
      const { data, total, summary } = await cashbankService.listBankMovements(accountId, {
        page,
        per_page: perPage,
        from: filters.from || undefined,
        to: filters.to || undefined,
        type: filters.type || undefined,
      })
      setMovements(data)
      setMovTotal(total)
      setMovSummary(summary)
    } catch { toast.error('Error') }
    finally { setLoadingMovs(false) }
  }

  const selectAccount = (acc: BankAccount) => {
    setSelected(acc)
    setMovPage(1)
    setMovFilters(emptyMovFilters())
  }

  const updateMovFilter = (patch: Partial<MovFilters>) => {
    setMovPage(1)
    setMovFilters(f => ({ ...f, ...patch }))
  }

  useEffect(() => {
    if (!selected) return
    void loadMovements(selected.id, movPage, movFilters, movPerPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, movPage, movPerPage, movFilters])

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
    try {
      await cashbankService.addBankMovement(selected.id, movForm)
      toast.success('Movimiento registrado')
      setShowMov(false)
      await loadMovements(selected.id, movPage, movFilters, movPerPage)
    }
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

          {/* Filtros + resumen del período filtrado */}
          <div className="flex flex-wrap items-end gap-3 px-3 sm:px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Desde</label>
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                value={movFilters.from}
                onChange={e => updateMovFilter({ from: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Hasta</label>
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                value={movFilters.to}
                onChange={e => updateMovFilter({ to: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo</label>
              <select
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                value={movFilters.type}
                onChange={e => updateMovFilter({ type: e.target.value as MovFilters['type'] })}
              >
                <option value="">Todos</option>
                <option value="credit">Ingresos</option>
                <option value="debit">Egresos</option>
              </select>
            </div>
            {(movFilters.from || movFilters.to || movFilters.type) && (
              <button
                type="button"
                onClick={() => updateMovFilter(emptyMovFilters())}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 pb-1.5"
              >
                Limpiar filtros
              </button>
            )}
            <div className="ml-auto flex items-center gap-3 text-xs pb-1">
              <span className="text-green-700 font-semibold">+ S/ {movSummary.sum_credit.toFixed(2)}</span>
              <span className="text-red-600 font-semibold">- S/ {movSummary.sum_debit.toFixed(2)}</span>
            </div>
          </div>

          {loadingMovs ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              {movements.map(m => {
                const origin = movementOrigin(m)
                return (
                  <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {m.type === 'credit' ? <ArrowDownLeft size={14} className="text-green-500 flex-shrink-0" /> : <ArrowUpRight size={14} className="text-red-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-sm font-medium truncate ${m.is_reversed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                            {m.description || origin.label}
                          </p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${origin.className}`}>{origin.label}</span>
                          {m.is_reversed && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 flex-shrink-0" title="Este ingreso ya se revirtió — ver el movimiento de egreso con la misma referencia.">
                              <Undo2 size={10} /> Anulado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{m.reference || '-'} · {new Date(m.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <p className={`font-bold text-sm flex-shrink-0 ${m.is_reversed ? 'text-gray-400 line-through' : m.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                      {m.type === 'credit' ? '+' : '-'} S/ {Number(m.amount).toFixed(2)}
                    </p>
                  </div>
                )
              })}
              {movements.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos para los filtros seleccionados</div>}
            </div>
          )}

          {movTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 sm:px-4 py-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-gray-600">
                  Mostrando {(movPage - 1) * movPerPage + 1}-{Math.min(movPage * movPerPage, movTotal)} de {movTotal}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 whitespace-nowrap">Mostrar</span>
                  <select
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                    value={movPerPage}
                    onChange={e => { setMovPerPage(Number(e.target.value)); setMovPage(1) }}
                  >
                    {MOV_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMovPage(p => Math.max(1, p - 1))}
                  disabled={movPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-xs text-gray-600">
                  Página {movPage} de {Math.max(1, Math.ceil(movTotal / movPerPage))}
                </span>
                <button
                  type="button"
                  onClick={() => setMovPage(p => Math.min(Math.ceil(movTotal / movPerPage), p + 1))}
                  disabled={movPage >= Math.ceil(movTotal / movPerPage)}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
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
