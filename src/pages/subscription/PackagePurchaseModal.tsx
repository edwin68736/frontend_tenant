import { useState } from 'react'
import { toast } from 'sonner'
import { FileUp, Loader2, X } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import {
  subscriptionService,
  type DocumentPackageCatalog,
  type PaymentConfigView,
} from '@/services/subscription.service'
import { formatMoney } from './subscriptionUx'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

type Props = {
  open: boolean
  onClose: () => void
  pkg: DocumentPackageCatalog | null
  cfg: PaymentConfigView
  onSuccess: () => void
}

export default function PackagePurchaseModal({ open, onClose, pkg, cfg, onSuccess }: Props) {
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!pkg) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!receipt) {
      toast.error('Adjunte comprobante de pago')
      return
    }
    const form = new FormData()
    form.append('package_id', String(pkg.id))
    if (reference.trim()) form.append('reference', reference.trim())
    form.append('receipt', receipt)
    setSubmitting(true)
    try {
      await subscriptionService.purchaseDocumentPackage(form)
      toast.success('Solicitud enviada; pendiente de aprobación')
      setReceipt(null)
      setReference('')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      toast.error(apiErr?.response?.data?.error ?? 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-lg" overlayClassName="items-end sm:items-center" stacked>
      <div className="w-full max-w-lg max-h-[min(92dvh,900px)] overflow-y-auto rounded-2xl bg-white shadow-xl border border-gray-100">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-white rounded-t-2xl">
          <div>
            <h3 className="text-base font-bold text-gray-900">Comprar paquete</h3>
            <p className="text-sm text-gray-600">{pkg.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-primary-50 border border-primary-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-gray-900">{pkg.documents_qty} documentos</p>
            <p className="text-lg font-bold text-primary-700 mt-0.5">{formatMoney(pkg.price, pkg.currency)}</p>
            {pkg.description ? <p className="text-xs text-gray-500 mt-1">{pkg.description}</p> : null}
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Referencia de pago</label>
              <input
                className={`${inputClass} mt-1`}
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Nº operación"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Comprobante</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,.webp"
                className="text-sm mt-1 block w-full"
                onChange={e => setReceipt(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              Enviar comprobante
            </button>
          </form>
          {cfg.methods.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Métodos de pago</p>
              <ul className="flex flex-wrap gap-2">
                {cfg.methods.map(m => (
                  <li key={m.key} className="px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
                    {m.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </PortalModal>
  )
}
