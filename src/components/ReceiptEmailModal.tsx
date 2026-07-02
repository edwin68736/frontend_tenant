import { useEffect, useState } from 'react'
import { Loader2, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { PortalModal } from '@/components/ui/PortalModal'
import { salesService } from '@/services/sales.service'
import { quotationsService } from '@/services/quotations.service'
import type { PrintData } from '@/types/printData'
import { printDataToPdfBlob, type ReceiptPdfOptions } from '@/utils/receiptPdf'

type Props = {
  open: boolean
  onClose: () => void
  documentKind?: 'sale' | 'quotation'
  documentId: number
  printData: PrintData
  defaultEmail?: string
  ticketPdfOptions?: ReceiptPdfOptions
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('No se pudo leer el PDF'))
    reader.readAsDataURL(blob)
  })
}

export function ReceiptEmailModal({
  open,
  onClose,
  documentKind = 'sale',
  documentId,
  printData,
  defaultEmail = '',
  ticketPdfOptions,
}: Props) {
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) setEmail(defaultEmail)
  }, [open, defaultEmail])

  const handleSend = async () => {
    const to = email.trim()
    if (!to || !to.includes('@')) {
      toast.error('Ingresa un correo válido')
      return
    }
    setSending(true)
    try {
      const blob = await printDataToPdfBlob(printData, 'ticket', ticketPdfOptions)
      const pdfBase64 = await blobToBase64(blob)
      if (documentKind === 'quotation') {
        await quotationsService.sendReceiptEmail(documentId, to, pdfBase64, 'ticket')
      } else {
        await salesService.sendReceiptEmail(documentId, to, pdfBase64)
      }
      toast.success('Comprobante enviado por correo')
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } } }
      const msg = err.response?.data?.error ?? (e as Error)?.message ?? 'No se pudo enviar el correo'
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <PortalModal open={open} onClose={sending ? () => {} : onClose} className="max-w-md" stacked>
      <div className="w-full rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
              <Mail className="h-5 w-5 text-orange-600" aria-hidden />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Enviar por correo</h3>
              <p className="text-xs text-stone-500">Se adjuntará el PDF en formato ticket</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-stone-600">Correo del cliente</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@ejemplo.com"
          autoComplete="email"
          className="mb-4 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-800 focus:border-[rgb(var(--p400))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p200))]"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSend()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Enviar
          </button>
        </div>
      </div>
    </PortalModal>
  )
}
