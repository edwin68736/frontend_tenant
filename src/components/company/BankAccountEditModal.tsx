import { useEffect, useState } from 'react'
import { Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { cashbankService, type BankAccount } from '@/services/cashbank.service'

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Banco' },
  { value: 'wallet', label: 'Billetera' },
  { value: 'cash', label: 'Efectivo' },
]

type Props = {
  open: boolean
  account: BankAccount | null
  onClose: () => void
  /** Recibe la cuenta con los campos actualizados para refrescar la lista sin recargar. */
  onSaved: (updated: BankAccount) => void
}

/** Edición rápida de una cuenta bancaria vía modal (reutilizable fuera de la vista de Bancos). */
export function BankAccountEditModal({ open, account, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [type, setType] = useState('bank')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!account) return
    setName(account.name ?? '')
    setBankName(account.bank_name ?? '')
    setAccountNumber(account.account_number ?? '')
    setType(account.type || 'bank')
    setActive(account.active !== false)
  }, [account])

  const handleSave = async () => {
    if (!account) return
    if (!name.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setSaving(true)
    try {
      await cashbankService.updateBankAccount(account.id, {
        name: name.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        type,
        active,
      })
      toast.success('Cuenta actualizada')
      onSaved({
        ...account,
        name: name.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        type,
        active,
      })
      onClose()
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Error al actualizar la cuenta',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-md" stacked>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Editar cuenta bancaria</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre / Alias</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Cuenta principal"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p500))]/30"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <input
              value={account?.currency || 'PEN'}
              readOnly
              disabled
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Banco / Entidad</label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Ej. BCP, Interbank, Yape..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p500))]/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Número de cuenta</label>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Número o CCI"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p500))]/30"
          />
        </div>

        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-gray-300 text-[rgb(var(--p600))]"
          />
          <span className="text-sm text-gray-700">Cuenta activa</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-[rgb(var(--p600))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
