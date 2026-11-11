import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Undo2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cashbankService, type AccountTransfer } from '@/services/cashbank.service'
import { formatSaleMoney } from '@/utils/formatMoney'

type Props = { canManage: boolean; refreshKey: number; onChanged: () => void }

/** Transferencias recientes (caja ↔ cuentas) con anulación. */
export function TransfersPanel({ canManage, refreshKey, onChanged }: Props) {
  const [rows, setRows] = useState<AccountTransfer[]>([])
  const [voiding, setVoiding] = useState<AccountTransfer | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    cashbankService.listTransfers(15).then(setRows).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  const confirmVoid = async () => {
    if (!voiding) return
    if (!reason.trim()) return toast.error('Indique el motivo de anulación')
    setSaving(true)
    try {
      await cashbankService.voidTransfer(voiding.id, reason.trim())
      toast.success('Transferencia anulada')
      setVoiding(null)
      setReason('')
      load()
      onChanged()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'No se pudo anular')
    } finally {
      setSaving(false)
    }
  }

  if (rows.length === 0) return null
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <p className="px-3 sm:px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">Transferencias recientes</p>
      {rows.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-50">
          <div className="min-w-0">
            <p className={`text-sm flex items-center gap-1.5 flex-wrap ${t.status === 'voided' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
              <span className="font-medium">{t.from_name}</span> <ArrowRight size={12} /> <span className="font-medium">{t.to_name}</span>
              {t.status === 'voided' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Anulada</span>}
            </p>
            <p className="text-xs text-gray-400">
              TRF-{t.id} · {new Date(t.date).toLocaleDateString()}{t.notes ? ` · ${t.notes}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800">{formatSaleMoney(t.amount_from, t.currency_from)}</p>
              {t.currency_from !== t.currency_to && (
                <p className="text-[11px] text-gray-400">→ {formatSaleMoney(t.amount_to, t.currency_to)} (TC {t.exchange_rate})</p>
              )}
            </div>
            {canManage && t.status !== 'voided' && (
              <button onClick={() => { setVoiding(t); setReason('') }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Anular transferencia">
                <Undo2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
      <Modal open={!!voiding} onClose={() => setVoiding(null)} contentClassName="max-w-sm w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base">Anular transferencia TRF-{voiding?.id}</h3>
        <p className="text-xs text-gray-500">Se devolverá el dinero a la cuenta de origen con movimientos inversos.</p>
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Motivo *" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={() => setVoiding(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Cancelar</button>
          <button onClick={confirmVoid} disabled={saving} className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? '...' : 'Anular'}</button>
        </div>
      </Modal>
    </div>
  )
}
