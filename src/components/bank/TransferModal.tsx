import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cashbankService, type BankAccount } from '@/services/cashbank.service'
import { formatSaleMoney } from '@/utils/formatMoney'
import { getTodayPeru } from '@/utils/datesPeru'

type Props = {
  open: boolean
  onClose: () => void
  accounts: BankAccount[]
  /** Cuenta preseleccionada como origen (la que se está viendo). */
  defaultFromId?: number
  onDone: () => void
}

const CASH = 'cash'
const keyOf = (a: BankAccount) => `b:${a.id}`
const curOf = (a?: BankAccount) => (String(a?.currency || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN')

/** Transferencia entre la caja y una cuenta, o entre dos cuentas. Si las monedas difieren pide/usa el tipo de cambio. */
export function TransferModal({ open, onClose, accounts, defaultFromId, onDone }: Props) {
  const active = useMemo(() => accounts.filter((a) => a.active !== false), [accounts])
  const [fromKey, setFromKey] = useState<string>(defaultFromId ? `b:${defaultFromId}` : CASH)
  const [toKey, setToKey] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [date, setDate] = useState(getTodayPeru())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  // Al abrir se parte limpio: origen = la cuenta que se está viendo, sin destino ni montos de la vez anterior.
  useEffect(() => {
    if (!open) return
    setFromKey(defaultFromId ? `b:${defaultFromId}` : CASH)
    setToKey('')
    setAmount('')
    setRate('')
    setNotes('')
    setDate(getTodayPeru())
  }, [open, defaultFromId])

  const find = (k: string) => active.find((a) => keyOf(a) === k)
  const fromCur = fromKey === CASH ? 'PEN' : curOf(find(fromKey))
  const toCur = toKey === CASH ? 'PEN' : toKey ? curOf(find(toKey)) : fromCur
  const crossCurrency = !!toKey && fromCur !== toCur
  const amt = Number(amount) || 0
  const r = Number(rate) || 0
  const receives = crossCurrency && r > 0 && amt > 0 ? (fromCur === 'USD' ? amt * r : amt / r) : amt

  const endpoint = (k: string) =>
    k === CASH ? { kind: 'cash' as const, account_id: 0 } : { kind: 'bank' as const, account_id: Number(k.slice(2)) }

  const submit = async () => {
    if (!toKey) return toast.error('Elija el destino de la transferencia')
    if (amt <= 0) return toast.error('Indique el monto a transferir')
    if (submitting.current) return // evita el doble envío antes de que el botón se deshabilite
    submitting.current = true
    setSaving(true)
    try {
      await cashbankService.createTransfer({
        from: endpoint(fromKey),
        to: endpoint(toKey),
        amount: amt,
        exchange_rate: crossCurrency && r > 0 ? r : undefined,
        date,
        notes: notes.trim() || undefined,
      })
      toast.success('Transferencia registrada')
      setAmount('')
      setNotes('')
      onDone()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo registrar la transferencia')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  const options = (exclude?: string) => (
    <>
      <option value={CASH} disabled={exclude === CASH}>Caja (efectivo de mi sesión)</option>
      {active.map((a) => (
        <option key={a.id} value={keyOf(a)} disabled={exclude === keyOf(a)}>
          {a.name} ({curOf(a)}) — saldo {formatSaleMoney(Number(a.balance), curOf(a))}
        </option>
      ))}
    </>
  )

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-lg w-full mx-2 sm:mx-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Transferir entre cuentas</h3>
        <button onClick={onClose} className="p-1 -m-1 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={fromKey} onChange={(e) => setFromKey(e.target.value)}>
              {options(toKey)}
            </select>
          </div>
          <ArrowRight size={16} className="hidden sm:block text-gray-400 mb-3" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hacia</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={toKey} onChange={(e) => setToKey(e.target.value)}>
              <option value="">Seleccione…</option>
              {options(fromKey)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto que sale ({fromCur === 'USD' ? 'US$' : 'S/'})</label>
            <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {crossCurrency && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-xs text-amber-800">
              Las cuentas están en monedas distintas ({fromCur} → {toCur}). Indique el tipo de cambio de la operación o déjelo vacío para usar el oficial del día.
            </p>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cambio (S/ por US$)</label>
                <input type="number" min={0} step={0.001} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="TC del día" />
              </div>
              <p className="text-sm text-gray-700 pb-2">
                Recibe: <strong>{r > 0 && amt > 0 ? formatSaleMoney(Math.round(receives * 100) / 100, toCur) : '—'}</strong>
              </p>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional (ej. depósito de la recaudación del día)" />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? '...' : 'Transferir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
