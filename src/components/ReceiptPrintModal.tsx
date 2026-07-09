import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileText, Loader2, Mail, MessageCircle, Printer, Receipt, X } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { PortalModal } from '@/components/ui/PortalModal'
import { ReceiptEmailModal } from '@/components/ReceiptEmailModal'
import { formatMoney } from '@/utils/format'
import { receiptItemDisplayDescription, receiptItemDisplayTotal } from '@/utils/receiptBonificacion'
import { resolvePrintChangeAmount, receiptDirectPaidAmount } from '@/utils/receiptTotals'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { pdfEmbedSrc } from '@/utils/pdfEmbedSrc'
import { downloadReceiptPdf, printDataToPdfBlob, printReceiptPdf, type ReceiptPdfOptions } from '@/utils/receiptPdf'
import { shareReceiptPdf } from '@/utils/receiptShare'
import {
  getConfiguredPrinter,
  isAutoPrintEnabled,
  isNativePrintAvailable,
  printDocumentAuto,
} from '@/services/printers.service'

type PanelView = 'details' | 'receipt'
type PdfFormat = 'ticket' | 'a4'

/** Botón de acción: icono + texto, color sólido (grid 2 columnas; táctil ≥44px en Android). */
const ACTION_ICON_BTN =
  'flex w-full min-w-0 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-white touch-manipulation select-none active:scale-[0.98] transition-transform hover:opacity-95 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100'

const ACTION_ICON = 'h-4 w-4 sm:h-5 sm:w-5 shrink-0'

const ACTION_LABEL =
  'min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs sm:tracking-wider'

interface ReceiptPrintModalProps {
  open: boolean
  onClose: () => void
  printData: PrintData | null
  /** ID de venta para envío por correo (comprobante / nota / POS). */
  saleId?: number
  /** ID de cotización cuando documentKind es quotation. */
  quotationId?: number
  /** Correo precargado del cliente. */
  defaultEmail?: string
  saleNumber?: string
  total?: number
  /** POS en navegador: abrir directamente el comprobante en formato ticket (sin impresión nativa). */
  autoShowTicketOnWeb?: boolean
  /** Etiqueta del documento generado (venta vs cotización). */
  documentKind?: 'sale' | 'quotation'
}

export function ReceiptPrintModal({
  open,
  onClose,
  printData,
  saleId,
  quotationId,
  defaultEmail = '',
  saleNumber,
  total,
  autoShowTicketOnWeb = false,
  documentKind = 'sale',
}: ReceiptPrintModalProps) {
  const [panelView, setPanelView] = useState<PanelView>('details')
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>('ticket')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const pdfUrlRef = useRef<string | null>(null)
  const loadedFormatRef = useRef<PdfFormat | null>(null)
  const autoPrintedRef = useRef(false)
  const autoShowReceiptRef = useRef(false)

  const printerCfg = getConfiguredPrinter('documentos')
  const hasDirectPrinter = isNativePrintAvailable() && Boolean(printerCfg)
  const isNativeApp = isNativePrintAvailable()
  const isWebBrowser = !isNativeApp

  const heading =
    documentKind === 'quotation'
      ? { title: 'Cotización registrada', subtitle: 'Documento generado correctamente', footer: 'Cotización registrada' }
      : { title: 'Recibo de venta', subtitle: 'Comprobante generado correctamente', footer: 'Venta registrada' }

  const ticketPdfOptions = useCallback((): ReceiptPdfOptions => {
    const mm = printerCfg?.paperWidthMm === 58 ? 58 : 80
    return { paperWidthMm: mm }
  }, [printerCfg?.paperWidthMm])

  const displayNumber = saleNumber || printData?.number || '—'
  const displayTotal = total ?? printData?.total ?? 0
  const emailDocumentId = documentKind === 'quotation' ? quotationId : saleId
  const resolvedDefaultEmail =
    defaultEmail.trim() ||
    printData?.client?.email?.trim() ||
    ''

  const paidTotal = useMemo(() => {
    if (!printData) return displayTotal
    if (printData.payments?.length) return receiptDirectPaidAmount(printData)
    return displayTotal
  }, [printData, displayTotal])

  const change = useMemo(() => {
    if (!printData) return 0
    return resolvePrintChangeAmount(printData)
  }, [printData])

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
        const pdfOpts = format === 'ticket' ? ticketPdfOptions() : undefined
        const blob = await printDataToPdfBlob(printData, format, pdfOpts)
        const url = URL.createObjectURL(blob)
        pdfUrlRef.current = url
        loadedFormatRef.current = format
        setPdfUrl(url)
        setPdfFormat(format)
      } catch (e) {
        console.error(e)
        toast.error('No se pudo generar el PDF')
        setPanelView('details')
      } finally {
        setPdfLoading(false)
      }
    },
    [printData, revokePdfUrl, ticketPdfOptions],
  )

  const showReceipt = useCallback(async () => {
    if (!printData) return
    setPanelView('receipt')
    await loadPdf('ticket')
  }, [printData, loadPdf])

  const showDetails = useCallback(() => {
    setPanelView('details')
  }, [])

  const switchPdfFormat = useCallback(
    (format: PdfFormat) => {
      if (format === pdfFormat && pdfUrl) return
      void loadPdf(format)
    },
    [loadPdf, pdfFormat, pdfUrl],
  )

  useEffect(() => {
    if (!open) {
      autoPrintedRef.current = false
      autoShowReceiptRef.current = false
      revokePdfUrl()
      setPanelView('details')
      setPdfFormat('ticket')
      setBusy(null)
      setEmailModalOpen(false)
      return
    }
    revokePdfUrl()
    setPdfFormat('ticket')
    const showTicketOnWeb =
      autoShowTicketOnWeb && !isNativePrintAvailable() && Boolean(printData)
    if (showTicketOnWeb) {
      autoShowReceiptRef.current = true
      setPanelView('receipt')
      void loadPdf('ticket')
    } else {
      setPanelView('details')
    }
  }, [open, revokePdfUrl, autoShowTicketOnWeb, printData, loadPdf])

  useEffect(() => {
    if (!open || !printData || autoPrintedRef.current) return
    if (!isNativePrintAvailable() || !isAutoPrintEnabled('documentos') || !getConfiguredPrinter('documentos')) return

    autoPrintedRef.current = true
    void printDocumentAuto(printData).catch((e) => {
      console.error('[receipt auto-print]', e)
    })
  }, [open, printData])

  const handleClose = () => {
    revokePdfUrl()
    onClose()
  }

  const handleDirectPrint = async () => {
    if (!printData) return
    if (!hasDirectPrinter) {
      toast.error('Configura la impresora en Ajustes')
      return
    }
    setBusy('print')
    try {
      const msg = await printDocumentAuto(printData)
      toast.success(msg || 'Comprobante enviado a la impresora')
    } catch (e) {
      console.error(e)
      toast.error('No se pudo imprimir')
    } finally {
      setBusy(null)
    }
  }

  const handleShareWhatsApp = async () => {
    if (!printData) return
    setBusy('share')
    try {
      await shareReceiptPdf(printData, 'ticket')
    } catch (e) {
      console.error(e)
      toast.error((e as Error)?.message ?? 'No se pudo compartir el PDF')
    } finally {
      setBusy(null)
    }
  }

  const handleDownloadPdf = async (format: PdfFormat) => {
    if (!printData) return
    const busyKey = format === 'ticket' ? 'download-ticket' : 'download-a4'
    setBusy(busyKey)
    try {
      const pdfOpts = format === 'ticket' ? ticketPdfOptions() : undefined
      await downloadReceiptPdf(printData, format, pdfOpts)
      toast.success(format === 'ticket' ? 'PDF ticket descargado' : 'PDF A4 descargado')
    } catch (e) {
      console.error(e)
      toast.error('No se pudo descargar el PDF')
    } finally {
      setBusy(null)
    }
  }

  const handleBrowserPrint = async () => {
    if (!printData) return
    setBusy('browser-print')
    try {
      const pdfOpts = pdfFormat === 'ticket' ? ticketPdfOptions() : undefined
      await printReceiptPdf(printData, pdfFormat, pdfOpts)
    } catch (e) {
      console.error(e)
      toast.error('No se pudo abrir la impresión del PDF')
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  const client = printData?.client
  const showReceiptPanel = panelView === 'receipt'

  return (
    <PortalModal
      open={open}
      onClose={handleClose}
      className="max-w-5xl"
      overlayClassName="items-center bg-black/40 backdrop-blur-sm p-3 sm:p-4 md:p-6"
    >
      <div className="relative flex max-h-[min(92dvh,720px)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-20 rounded-full border border-stone-200 bg-white p-2 shadow-md hover:bg-stone-50 sm:right-4 sm:top-4"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4 text-stone-600 sm:h-5 sm:w-5" />
        </button>

        <div className="scrollbar-checkout min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mb-4 flex items-center gap-2 pr-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 md:h-10 md:w-10">
              <Receipt className="h-5 w-5 text-green-600 md:h-6 md:w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-800 md:text-lg">{heading.title}</h2>
              <p className="text-xs text-stone-500 md:text-sm">{heading.subtitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
            {/* Panel izquierdo: resumen y acciones */}
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <div className="rounded-xl border border-green-200/80 bg-green-50/60 p-3 md:p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <span className="text-green-600">●</span> Resumen de pago
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-stone-200/80 py-2">
                    <span className="font-semibold text-stone-800">Total</span>
                    <span className="text-lg font-bold text-green-700">
                      {formatMoney(displayTotal, printData?.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-stone-600">
                    <span>Pagado</span>
                    <span className="font-semibold text-stone-800">
                      {formatMoney(paidTotal, printData?.currency)}
                    </span>
                  </div>
                  {change > 0.009 && (
                    <div className="flex justify-between rounded-lg border border-amber-200 bg-amber-50 px-2 py-2">
                      <span className="font-semibold text-amber-900">Vuelto</span>
                      <span className="font-bold text-amber-700">
                        {formatMoney(change, printData?.currency)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/90 p-3">
                <h3 className="mb-2.5 text-xs font-semibold text-stone-700">Acciones</h3>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  {showReceiptPanel ? (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={showDetails}
                      title="Ver detalles"
                      aria-label="Ver detalles"
                      className={clsx(ACTION_ICON_BTN, 'bg-stone-600 hover:opacity-90')}
                    >
                      <ArrowLeft className={ACTION_ICON} strokeWidth={2.25} />
                      <span className={ACTION_LABEL}>Detalles</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!!busy || !printData || pdfLoading}
                      onClick={() => void showReceipt()}
                      title="Ver comprobante"
                      aria-label="Ver comprobante"
                      className={clsx(ACTION_ICON_BTN, 'bg-blue-800')}
                    >
                      {pdfLoading ? (
                        <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                      ) : (
                        <FileText className={ACTION_ICON} strokeWidth={2.25} />
                      )}
                      <span className={ACTION_LABEL}>Comprobante</span>
                    </button>
                  )}

                  {isNativeApp && (
                    <button
                      type="button"
                      disabled={!!busy || !printData}
                      onClick={() => void handleDirectPrint()}
                      title="Volver a imprimir"
                      aria-label="Volver a imprimir"
                      className={clsx(ACTION_ICON_BTN, 'bg-stone-700')}
                    >
                      {busy === 'print' ? (
                        <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                      ) : (
                        <Printer className={ACTION_ICON} strokeWidth={2.25} />
                      )}
                      <span className={ACTION_LABEL}>Reimprimir</span>
                    </button>
                  )}

                  {isWebBrowser && (
                    <button
                      type="button"
                      disabled={!!busy || !printData}
                      onClick={() => void handleBrowserPrint()}
                      title="Imprimir PDF (visor del navegador)"
                      aria-label="Imprimir PDF"
                      className={clsx(ACTION_ICON_BTN, 'bg-slate-700 hover:bg-slate-800')}
                    >
                      {busy === 'browser-print' ? (
                        <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                      ) : (
                        <Printer className={ACTION_ICON} strokeWidth={2.25} />
                      )}
                      <span className={ACTION_LABEL}>Imprimir</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!!busy || !printData}
                    onClick={() => void handleShareWhatsApp()}
                    title="Enviar por WhatsApp"
                    aria-label="Enviar por WhatsApp"
                    className={clsx(ACTION_ICON_BTN, 'bg-[#25D366]')}
                  >
                    {busy === 'share' ? (
                      <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                    ) : (
                      <MessageCircle className={ACTION_ICON} strokeWidth={2.25} />
                    )}
                    <span className={ACTION_LABEL}>Whatsapp</span>
                  </button>

                  <button
                    type="button"
                    disabled={!!busy || !printData || !emailDocumentId}
                    onClick={() => setEmailModalOpen(true)}
                    title="Enviar por correo"
                    aria-label="Enviar por correo"
                    className={clsx(ACTION_ICON_BTN, 'bg-orange-500 hover:bg-orange-600')}
                  >
                    <Mail className={ACTION_ICON} strokeWidth={2.25} />
                    <span className={ACTION_LABEL}>Correo</span>
                  </button>

                  <button
                    type="button"
                    disabled={!!busy || !printData}
                    onClick={() => void handleDownloadPdf('ticket')}
                    title="Descargar PDF ticket"
                    aria-label="Descargar PDF ticket"
                    className={clsx(ACTION_ICON_BTN, 'bg-amber-600 text-white')}
                  >
                    {busy === 'download-ticket' ? (
                      <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                    ) : (
                      <Download className={ACTION_ICON} strokeWidth={2.25} />
                    )}
                    <span className={ACTION_LABEL}>Ticket</span>
                  </button>

                  <button
                    type="button"
                    disabled={!!busy || !printData}
                    onClick={() => void handleDownloadPdf('a4')}
                    title="Descargar PDF A4"
                    aria-label="Descargar PDF A4"
                    className={clsx(ACTION_ICON_BTN, 'bg-[#E4002B]')}
                  >
                    {busy === 'download-a4' ? (
                      <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} />
                    ) : (
                      <Download className={ACTION_ICON} strokeWidth={2.25} />
                    )}
                    <span className={ACTION_LABEL}>PDF</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Panel derecho: detalle o PDF */}
            <div className="lg:col-span-3">
              {showReceiptPanel ? (
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                  <div className="border-b border-stone-200 bg-stone-50 px-3 py-2.5">
                    <div className="mx-auto grid max-w-xs grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={pdfLoading}
                        onClick={() => switchPdfFormat('ticket')}
                        title="Vista ticket"
                        aria-label="Vista ticket"
                        aria-pressed={pdfFormat === 'ticket'}
                        className={clsx(
                          ACTION_ICON_BTN,
                          'min-h-[2.75rem]',
                          pdfFormat === 'ticket' ? 'bg-amber-600 ring-2 ring-amber-300 ring-offset-1' : 'bg-amber-500/90',
                        )}
                      >
                        <Receipt className={ACTION_ICON} strokeWidth={2.25} />
                        <span className={ACTION_LABEL}>Ticket</span>
                      </button>
                      <button
                        type="button"
                        disabled={pdfLoading}
                        onClick={() => switchPdfFormat('a4')}
                        title="Vista A4"
                        aria-label="Vista A4"
                        aria-pressed={pdfFormat === 'a4'}
                        className={clsx(
                          ACTION_ICON_BTN,
                          'min-h-[2.75rem]',
                          pdfFormat === 'a4' ? 'bg-[#E4002B] ring-2 ring-red-300 ring-offset-1' : 'bg-[#E4002B]/85',
                        )}
                      >
                        <FileText className={ACTION_ICON} strokeWidth={2.25} />
                        <span className={ACTION_LABEL}>A4</span>
                      </button>
                    </div>
                  </div>
                  {pdfLoading || !pdfUrl ? (
                    <div className="flex min-h-[280px] items-center justify-center md:min-h-[360px]">
                      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                    </div>
                  ) : (
                    <div className="bg-stone-100 p-1">
                      <iframe
                        src={pdfEmbedSrc(pdfUrl)}
                        title="Comprobante PDF"
                        className="h-[min(70vh,520px)] min-h-[320px] w-full border-0 bg-white"
                      />
                    </div>
                  )}
                </div>
              ) : printData ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 md:p-4">
                  {client && (
                    <div className="mb-4 rounded-lg border border-stone-200 bg-white p-3">
                      <h4 className="mb-2 text-xs font-semibold text-stone-700">Datos del cliente</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-stone-500">Nombre</span>
                          <p className="font-medium text-stone-900">{client.business_name}</p>
                        </div>
                        <div>
                          <span className="text-stone-500">Documento</span>
                          <p className="font-medium text-stone-900">{client.doc_number}</p>
                        </div>
                        {client.address && (
                          <div className="col-span-2">
                            <span className="text-stone-500">Dirección</span>
                            <p className="font-medium text-stone-900">{client.address}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                    <table className="w-full text-xs md:text-sm">
                      <thead className="bg-blue-900 text-white">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Producto</th>
                          <th className="w-14 px-2 py-2 text-center font-semibold">Cant.</th>
                          <th className="w-20 px-2 py-2 text-right font-semibold">P. unit.</th>
                          <th className="w-24 px-3 py-2 text-right font-semibold">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {printData.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/80">
                            <td className="px-3 py-2 font-medium text-stone-800">
                              {receiptItemDisplayDescription(item)}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-green-100 px-1.5 text-xs font-semibold text-green-800">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-stone-700">
                              {formatMoney(item.unit_price ?? 0, printData.currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-stone-800">
                              {receiptItemDisplayTotal(item, (n) => formatMoney(n, printData.currency))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 space-y-1 rounded-lg border border-stone-200 bg-white p-3 text-sm">
                    {buildReceiptTotalLines(printData).map((row, i) => (
                      <div
                        key={i}
                        className={`flex justify-between ${
                          row.negative
                            ? 'text-amber-800'
                            : row.bold
                              ? 'font-bold text-stone-900 border-t border-stone-200 pt-2'
                              : 'text-stone-600'
                        }`}
                      >
                        <span>{row.label.replace(/:$/, '')}</span>
                        <span>
                          {row.negative ? '− ' : ''}
                          {formatMoney(Math.abs(row.amount), printData.currency)}
                        </span>
                      </div>
                    ))}
                    {printData.payments.length > 0 && (
                      <div className="border-t border-dashed border-stone-200 pt-2 text-xs text-stone-600">
                        {printData.payments.map((p, i) => (
                          <div key={i} className="flex justify-between py-0.5">
                            <span>{salePaymentMethodLabelEs(p.method)}</span>
                            <span>{formatMoney(p.amount, printData.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-500">No hay datos del comprobante.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
          <p className="hidden text-xs text-green-700 sm:block">
            <span className="font-medium">✓</span> {heading.footer} · {displayNumber}
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>

      {printData && emailDocumentId ? (
        <ReceiptEmailModal
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          documentKind={documentKind}
          documentId={emailDocumentId}
          printData={printData}
          defaultEmail={resolvedDefaultEmail}
          ticketPdfOptions={ticketPdfOptions()}
        />
      ) : null}
    </PortalModal>
  )
}
