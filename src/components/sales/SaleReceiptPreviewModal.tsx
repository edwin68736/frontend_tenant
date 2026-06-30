import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { FileText, Loader2, Receipt, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { Modal } from '@/components/ui/Modal'
import { pdfEmbedSrc } from '@/utils/pdfEmbedSrc'
import { printDataToPdfBlob } from '@/utils/receiptPdf'

type PdfFormat = 'ticket' | 'a4'

const FORMAT_BTN =
  'flex w-full min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl px-2 text-white touch-manipulation select-none transition-transform hover:opacity-95 disabled:pointer-events-none disabled:opacity-50'

const FORMAT_LABEL = 'text-[10px] font-semibold uppercase tracking-wide sm:text-xs'

interface SaleReceiptPreviewModalProps {
  open: boolean
  onClose: () => void
  printData: PrintData | null
}

export function SaleReceiptPreviewModal({ open, onClose, printData }: SaleReceiptPreviewModalProps) {
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>('ticket')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const pdfUrlRef = useRef<string | null>(null)
  const loadedFormatRef = useRef<PdfFormat | null>(null)

  const revokePdfUrl = useCallback(() => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    setPdfUrl(null)
    loadedFormatRef.current = null
  }, [])

  const loadPdf = useCallback(
    async (format: PdfFormat) => {
      if (!printData) return
      if (loadedFormatRef.current === format && pdfUrlRef.current) {
        setPdfFormat(format)
        return
      }
      setPdfLoading(true)
      revokePdfUrl()
      try {
        const blob = await printDataToPdfBlob(printData, format)
        const url = URL.createObjectURL(blob)
        pdfUrlRef.current = url
        loadedFormatRef.current = format
        setPdfUrl(url)
        setPdfFormat(format)
      } catch (e) {
        console.error(e)
        toast.error('No se pudo generar la previsualización')
      } finally {
        setPdfLoading(false)
      }
    },
    [printData, revokePdfUrl],
  )

  useEffect(() => {
    if (!open) {
      revokePdfUrl()
      setPdfFormat('ticket')
      return
    }
    if (printData) void loadPdf('ticket')
  }, [open, printData, loadPdf, revokePdfUrl])

  const handleClose = () => {
    revokePdfUrl()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} contentClassName="max-w-4xl" stacked>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800">Previsualización del comprobante</h3>
          <p className="text-xs text-gray-500">Vista previa antes de registrar la venta</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-gray-100"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <div className="border-b border-stone-200 bg-stone-50 px-3 py-2.5">
          <div className="mx-auto grid max-w-xs grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pdfLoading}
              onClick={() => void loadPdf('ticket')}
              aria-pressed={pdfFormat === 'ticket'}
              className={clsx(
                FORMAT_BTN,
                pdfFormat === 'ticket' ? 'bg-amber-600 ring-2 ring-amber-300 ring-offset-1' : 'bg-amber-500/90',
              )}
            >
              <Receipt className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              <span className={FORMAT_LABEL}>Ticket</span>
            </button>
            <button
              type="button"
              disabled={pdfLoading}
              onClick={() => void loadPdf('a4')}
              aria-pressed={pdfFormat === 'a4'}
              className={clsx(
                FORMAT_BTN,
                pdfFormat === 'a4' ? 'bg-[#E4002B] ring-2 ring-red-300 ring-offset-1' : 'bg-[#E4002B]/85',
              )}
            >
              <FileText className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              <span className={FORMAT_LABEL}>A4</span>
            </button>
          </div>
        </div>
        {pdfLoading || !pdfUrl ? (
          <div className="flex min-h-[320px] items-center justify-center md:min-h-[420px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="bg-stone-100 p-1">
            <iframe
              src={pdfEmbedSrc(pdfUrl)}
              title="Previsualización comprobante"
              className="h-[min(70vh,520px)] min-h-[320px] w-full border-0 bg-white"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
