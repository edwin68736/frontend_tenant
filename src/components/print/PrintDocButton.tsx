import { useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { isNativePrintAvailable, printDocumentAuto } from '@/services/printers.service'
import { openReceiptPdfInNewTab } from '@/utils/receiptPdf'

/**
 * Botón "Imprimir" reutilizable para las listas de documentos (Ventas, Cotizaciones,
 * Notas de venta, Boletas/Facturas).
 *
 *  - Android / Tauri (impresión nativa disponible): impresión DIRECTA a la ticketera,
 *    exactamente el mismo flujo que al finalizar una venta (printDocumentAuto).
 *  - Web (sin impresión nativa): abre/visualiza el PDF del documento en una pestaña nueva.
 *
 * El `print_data` se carga bajo demanda al hacer clic (loadPrintData), para no pedirlo
 * por cada fila de la lista.
 */
export function PrintDocButton({
  loadPrintData,
  webFormat = 'ticket',
  className,
  title = 'Imprimir',
  iconSize = 14,
}: {
  loadPrintData: () => Promise<PrintData | null | undefined>
  /** Formato del PDF a abrir en web ('ticket' | 'a4'). En nativo no aplica (usa la ticketera). */
  webFormat?: 'ticket' | 'a4'
  className?: string
  title?: string
  iconSize?: number
}) {
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const printData = await loadPrintData()
      if (!printData) {
        toast.error('No hay datos para imprimir este comprobante.')
        return
      }
      if (isNativePrintAvailable()) {
        // Android / Tauri → impresión directa a la ticketera (mismo flujo que al cobrar).
        const msg = await printDocumentAuto(printData)
        toast.success(msg || 'Comprobante enviado a la impresora')
      } else {
        // Web → abrir/visualizar el PDF (la impresión directa solo existe en Android/Tauri).
        await openReceiptPdfInNewTab(printData, webFormat)
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? 'No se pudo imprimir el comprobante')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleClick()}
      title={title}
      aria-label={title}
      className={className ?? 'p-1.5 text-green-700 hover:bg-green-50 rounded-lg disabled:opacity-40'}
    >
      {busy ? <RefreshCw size={iconSize} className="animate-spin" /> : <Printer size={iconSize} />}
    </button>
  )
}
