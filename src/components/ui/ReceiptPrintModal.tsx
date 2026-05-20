import { useState } from 'react'
import { FileText, Printer, Download, X } from 'lucide-react'
import { Modal } from './Modal'
import { downloadReceiptPdf, openReceiptPdfInNewTab } from '@/utils/receiptPdf'
import type { PrintData } from '@/types/printData'
import { formatMoney } from '@/utils/format'

interface ReceiptPrintModalProps {
  open: boolean
  onClose: () => void
  printData: PrintData | null
  /** Número de comprobante para mostrar (ej. B001-00001234) */
  saleNumber?: string
  total?: number
}

export function ReceiptPrintModal({
  open,
  onClose,
  printData,
  saleNumber,
  total,
}: ReceiptPrintModalProps) {
  const [loading, setLoading] = useState(false)
  const [format, setFormat] = useState<'a4' | 'ticket'>('a4')

  const handleView = async () => {
    if (!printData) return
    setLoading(true)
    try {
      await openReceiptPdfInNewTab(printData, format)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!printData) return
    setLoading(true)
    try {
      await downloadReceiptPdf(printData, format)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = async () => {
    if (!printData) return
    setLoading(true)
    try {
      await openReceiptPdfInNewTab(printData, format)
      // El usuario puede usar Ctrl+P en la nueva pestaña para imprimir
      // Alternativa: generar PDF y abrir diálogo de impresión (más complejo)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Comprobante registrado</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>
      {printData && (
        <>
          <p className="text-sm text-gray-600">
            {saleNumber || printData.number} — Total: {formatMoney(total ?? printData.total)}
          </p>
          <div className="flex gap-2">
            <label className="text-sm text-gray-600">Formato:</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as 'a4' | 'ticket')}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
            >
              <option value="a4">A4</option>
              <option value="ticket">Ticket (80mm)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={handleView}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <FileText size={16} />
              Ver PDF
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <Download size={16} />
              Descargar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <Printer size={16} />
              Imprimir
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Al hacer clic en &quot;Ver PDF&quot; o &quot;Imprimir&quot;, se abrirá el comprobante en una nueva pestaña. Use Ctrl+P para imprimir desde el navegador.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            Nueva venta
          </button>
        </>
      )}
      {!printData && (
        <p className="text-sm text-gray-500">No hay datos de impresión disponibles.</p>
      )}
    </Modal>
  )
}
