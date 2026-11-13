import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { FileText, Loader2, Receipt, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { PdfBlobViewer } from '@/components/PdfBlobViewer'
import { generatePurchasePdf, type PurchasePdfFormat, type PurchasePdfInput } from '@/utils/purchasePdf'

const FORMAT_BTN =
  'flex w-full min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl px-2 text-white touch-manipulation select-none transition-transform hover:opacity-95 disabled:pointer-events-none disabled:opacity-50'

const FORMAT_LABEL = 'text-[10px] font-semibold uppercase tracking-wide sm:text-xs'

interface PurchasePreviewModalProps {
  open: boolean
  onClose: () => void
  input: PurchasePdfInput | null
}

/**
 * Previsualización de la compra antes de registrarla. Mismo patrón que la de ventas (SaleReceiptPreviewModal): alternador
 * Ticket / A4 arriba, visor del PDF embebido y aviso de documento no válido. Abre en ticket, como ventas.
 */
export function PurchasePreviewModal({ open, onClose, input }: PurchasePreviewModalProps) {
  const [format, setFormat] = useState<PurchasePdfFormat>('ticket')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const urlRef = useRef<string | null>(null)
  const loadedFormatRef = useRef<PurchasePdfFormat | null>(null)

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setPdfUrl(null)
    loadedFormatRef.current = null
  }, [])

  const loadPdf = useCallback(
    async (next: PurchasePdfFormat) => {
      if (!input) return
      if (loadedFormatRef.current === next && urlRef.current) {
        setFormat(next)
        return
      }
      setLoading(true)
      revokeUrl()
      try {
        const doc = await generatePurchasePdf(input, next)
        const url = URL.createObjectURL(doc.output('blob'))
        urlRef.current = url
        loadedFormatRef.current = next
        setPdfUrl(url)
        setFormat(next)
      } catch (e) {
        console.error(e)
        toast.error('No se pudo generar la previsualización')
      } finally {
        setLoading(false)
      }
    },
    [input, revokeUrl],
  )

  useEffect(() => {
    if (!open) {
      revokeUrl()
      setFormat('ticket')
      return
    }
    if (input) void loadPdf('ticket')
  }, [open, input, loadPdf, revokeUrl])

  const handleClose = () => {
    revokeUrl()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} contentClassName="max-w-4xl" stacked>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800">Previsualización de la compra</h3>
          <p className="text-xs text-gray-500">Vista previa antes de registrar la compra</p>
        </div>
        <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <div className="border-b border-stone-200 bg-stone-50 px-3 py-2.5">
          <div className="mx-auto grid max-w-xs grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadPdf('ticket')}
              aria-pressed={format === 'ticket'}
              className={clsx(FORMAT_BTN, format === 'ticket' ? 'bg-amber-600 ring-2 ring-amber-300 ring-offset-1' : 'bg-amber-500/90')}
            >
              <Receipt className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              <span className={FORMAT_LABEL}>Ticket</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadPdf('a4')}
              aria-pressed={format === 'a4'}
              className={clsx(FORMAT_BTN, format === 'a4' ? 'bg-[#E4002B] ring-2 ring-red-300 ring-offset-1' : 'bg-[#E4002B]/85')}
            >
              <FileText className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              <span className={FORMAT_LABEL}>A4</span>
            </button>
          </div>
        </div>
        {loading || !pdfUrl ? (
          <div className="flex min-h-[320px] items-center justify-center md:min-h-[420px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <PdfBlobViewer
            url={pdfUrl}
            title="Previsualización de la compra"
            embedOptions={format === 'a4' ? { fit: 'page' } : undefined}
          />
        )}
      </div>

      <p className="text-[11px] text-center text-red-600/80">
        Documento de previsualización con marca de agua — la compra aún no está registrada.
      </p>
    </Modal>
  )
}
