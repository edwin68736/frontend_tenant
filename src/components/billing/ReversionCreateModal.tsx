import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { billingService, type SunatReversion, type VoidedDetailInput } from '@/services/billing.service'

export type ReversionPrefill = VoidedDetailInput

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (r: SunatReversion) => void
  prefill?: ReversionPrefill | null
  locked?: boolean
}

export function ReversionCreateModal({ open, onClose, onCreated, prefill, locked }: Props) {
  const [sending, setSending] = useState(false)
  const [details, setDetails] = useState<VoidedDetailInput[]>([
    { tipo_doc: '40', serie: 'P001', correlativo: '', des_motivo_baja: 'Reversión de comprobante' },
  ])

  useEffect(() => {
    if (!open) return
    if (prefill) {
      setDetails([{ ...prefill, des_motivo_baja: prefill.des_motivo_baja || 'Reversión de comprobante' }])
    } else {
      setDetails([{ tipo_doc: '40', serie: 'P001', correlativo: '', des_motivo_baja: 'Reversión de comprobante' }])
    }
  }, [open, prefill])

  const handleSubmit = () => {
    if (!details.every((d) => d.serie && d.correlativo && d.des_motivo_baja.trim())) {
      toast.error('Complete serie, correlativo y motivo')
      return
    }
    setSending(true)
    billingService.createReversion(details)
      .then(({ reversion }) => {
        toast.success('Reversión enviada a SUNAT')
        onCreated(reversion)
        onClose()
      })
      .catch((e: { response?: { data?: { error?: string } } }) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-xl">
      <div className="flex justify-between border-b pb-3 mb-4">
        <h3 className="font-bold">Nueva reversión (RR)</h3>
        <button type="button" onClick={onClose}><X size={16} /></button>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Comunicación de reversión de retención (20) o percepción (40). Solo ingrese el motivo si los datos del comprobante ya están precargados.
      </p>
      <div className="space-y-2">
        {details.map((d, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select
              value={d.tipo_doc}
              disabled={locked}
              onChange={(e) => setDetails((prev) => prev.map((x, j) => (j === i ? { ...x, tipo_doc: e.target.value } : x)))}
              className="col-span-2 border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50"
            >
              <option value="40">40 Percepción</option>
              <option value="20">20 Retención</option>
            </select>
            <input
              placeholder="Serie"
              value={d.serie}
              readOnly={locked}
              onChange={(e) => setDetails((prev) => prev.map((x, j) => (j === i ? { ...x, serie: e.target.value } : x)))}
              className="col-span-2 border rounded-lg px-2 py-1.5 text-sm read-only:bg-gray-50"
            />
            <input
              placeholder="Correlativo"
              value={d.correlativo}
              readOnly={locked}
              onChange={(e) => setDetails((prev) => prev.map((x, j) => (j === i ? { ...x, correlativo: e.target.value } : x)))}
              className="col-span-2 border rounded-lg px-2 py-1.5 text-sm read-only:bg-gray-50"
            />
            <input
              placeholder="Motivo de reversión"
              value={d.des_motivo_baja}
              onChange={(e) => setDetails((prev) => prev.map((x, j) => (j === i ? { ...x, des_motivo_baja: e.target.value } : x)))}
              className="col-span-5 border rounded-lg px-2 py-1.5 text-sm"
            />
            {!locked && details.length > 1 && (
              <button type="button" onClick={() => setDetails((prev) => prev.filter((_, j) => j !== i))} className="text-red-600 text-xs">Quitar</button>
            )}
          </div>
        ))}
        {!locked && (
          <button
            type="button"
            onClick={() => setDetails((prev) => [...prev, { tipo_doc: '40', serie: 'P001', correlativo: '', des_motivo_baja: '' }])}
            className="text-sm text-[rgb(var(--p600))]"
          >
            + Añadir comprobante
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={sending} className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {sending ? 'Enviando…' : 'Enviar a SUNAT'}
        </button>
      </div>
    </Modal>
  )
}
