import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Mail, MessageCircle, Printer, Receipt, RefreshCw, Send, X } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { PortalModal } from '@/components/ui/PortalModal'
import { PdfBlobViewer } from '@/components/PdfBlobViewer'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import type { PurchaseOrder, PurchaseOrderItem } from '@/services/purchaseOrders.service'
import {
  buildPurchaseOrderPdfInput,
  downloadPurchaseOrderPdf,
  generatePurchaseOrderPdf,
  type PurchaseOrderPdfFormat,
  type PurchaseOrderPdfInput,
} from '@/utils/purchaseOrderPdf'
import { sendPurchaseOrder, type PurchaseOrderChannel } from '@/utils/purchaseOrderShare'
import { printPdfBlobInIframe } from '@/utils/receiptPng'
import { formatMoney } from '@/utils/format'

const ACTION_BTN =
  'flex w-full min-w-0 min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-white touch-manipulation select-none active:scale-[0.98] transition-transform hover:opacity-95 disabled:pointer-events-none disabled:opacity-50 sm:min-h-[44px] sm:py-2'
const ACTION_ICON = 'h-4 w-4 sm:h-5 sm:w-5 shrink-0'
const ACTION_LABEL = 'min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs sm:tracking-wider'

type Detail = { order: PurchaseOrder; items: PurchaseOrderItem[] }

/**
 * Modal que aparece al guardar una orden de compra (como el de cotizaciones y ventas): el PDF incrustado con
 * selector Ticket / A4 y las acciones para imprimirlo, enviarlo al proveedor y descargarlo.
 *
 * WhatsApp y correo piden/confirman el destinatario (precargado con el contacto del proveedor): no hay envío de
 * correo desde el servidor para órdenes de compra, así que el correo se abre ya redactado con el PDF descargado.
 */
export function PurchaseOrderDoneModal({
  open,
  detail,
  edited,
  onGoToList,
  onNewOrder,
}: {
  open: boolean
  detail: Detail | null
  /** true cuando se editó una orden existente (cambia el texto del encabezado). */
  edited?: boolean
  onGoToList: () => void
  onNewOrder?: () => void
}) {
  const [input, setInput] = useState<PurchaseOrderPdfInput | null>(null)
  const [format, setFormat] = useState<PurchaseOrderPdfFormat>('ticket')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sendTo, setSendTo] = useState<PurchaseOrderChannel | null>(null)
  const [recipient, setRecipient] = useState('')
  const cacheRef = useRef<Partial<Record<PurchaseOrderPdfFormat, string>>>({})
  const wantedRef = useRef<PurchaseOrderPdfFormat>('ticket')
  const epochRef = useRef(0)

  const revokeAll = useCallback(() => {
    epochRef.current += 1
    for (const u of Object.values(cacheRef.current)) if (u) URL.revokeObjectURL(u)
    cacheRef.current = {}
    setPdfUrl(null)
  }, [])

  const loadPdf = useCallback(
    async (inp: PurchaseOrderPdfInput, fmt: PurchaseOrderPdfFormat) => {
      wantedRef.current = fmt
      setFormat(fmt)
      setError(false)
      const cached = cacheRef.current[fmt]
      if (cached) {
        setPdfUrl(cached)
        return
      }
      const epoch = epochRef.current
      setLoading(true)
      try {
        const doc = await generatePurchaseOrderPdf(inp, fmt)
        const url = URL.createObjectURL(doc.output('blob'))
        if (epoch !== epochRef.current) {
          URL.revokeObjectURL(url)
          return
        }
        cacheRef.current[fmt] = url
        if (wantedRef.current === fmt) setPdfUrl(url)
      } catch (e) {
        console.error(e)
        if (wantedRef.current === fmt) setError(true)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Al abrirse (o cambiar la orden): se arma la entrada del PDF con los datos del proveedor y se muestra el ticket.
  useEffect(() => {
    revokeAll()
    setSendTo(null)
    setBusy(null)
    if (!open || !detail) {
      setInput(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void buildPurchaseOrderPdfInput(detail)
      .then((inp) => {
        if (cancelled) return
        setInput(inp)
        void loadPdf(inp, 'ticket')
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, detail, revokeAll, loadPdf])

  useEffect(() => () => revokeAll(), [revokeAll])

  if (!open || !detail) return null

  const { order } = detail
  const company = () => {
    const cfg = getCompanyConfigCache()
    return String(cfg?.trade_name || cfg?.business_name || '').trim()
  }

  const download = async (fmt: PurchaseOrderPdfFormat) => {
    if (!input) return
    setBusy(`download-${fmt}`)
    try {
      await downloadPurchaseOrderPdf(input, fmt)
      toast.success(fmt === 'ticket' ? 'PDF ticket descargado' : 'PDF A4 descargado')
    } catch {
      toast.error('No se pudo descargar el PDF')
    } finally {
      setBusy(null)
    }
  }

  const print = async () => {
    if (!input) return
    setBusy('print')
    try {
      const doc = await generatePurchaseOrderPdf(input, format)
      await printPdfBlobInIframe(doc.output('blob'))
    } catch {
      toast.error('No se pudo abrir la impresión del PDF')
    } finally {
      setBusy(null)
    }
  }

  const openSend = (channel: PurchaseOrderChannel) => {
    if (!input) return
    setRecipient(channel === 'whatsapp' ? (input.supplier.phone ?? '') : (input.supplier.email ?? ''))
    setSendTo(channel)
  }

  const confirmSend = async () => {
    if (!input || !sendTo) return
    const value = recipient.trim()
    if (!value) return toast.error(sendTo === 'whatsapp' ? 'Escribe el teléfono' : 'Escribe el correo')
    if (sendTo === 'email' && !/^\S+@\S+\.\S+$/.test(value)) return toast.error('El correo no es válido')
    setBusy('send')
    try {
      // El destinatario tecleado reemplaza al del proveedor solo para este envío (no se guarda en el contacto).
      const patched: PurchaseOrderPdfInput = {
        ...input,
        supplier: { ...input.supplier, ...(sendTo === 'whatsapp' ? { phone: value } : { email: value }) },
      }
      const started = await sendPurchaseOrder(patched, sendTo, company())
      if (started) setSendTo(null)
    } catch {
      toast.error('No se pudo preparar el envío')
    } finally {
      setBusy(null)
    }
  }

  const symCurrency = order.currency === 'USD' ? 'USD' : 'PEN'

  return (
    <PortalModal
      open
      onClose={onGoToList}
      className="max-w-5xl"
      overlayClassName="items-center bg-black/40 backdrop-blur-sm p-3 sm:p-4 md:p-6"
    >
      <div className="relative flex max-h-[min(92dvh,720px)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onGoToList}
          className="absolute right-3 top-3 z-20 rounded-full border border-stone-200 bg-white p-2 shadow-md hover:bg-stone-50 sm:right-4 sm:top-4"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4 text-stone-600 sm:h-5 sm:w-5" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
          <div className="mb-2 flex items-center gap-2 pr-10 md:mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-100 md:h-10 md:w-10">
              <Receipt className="h-4 w-4 text-green-600 md:h-6 md:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-stone-800 md:text-lg">
                {edited ? 'Orden de compra actualizada' : 'Orden de compra registrada'}
              </h2>
              <p className="hidden text-xs text-stone-500 md:block md:text-sm">Documento generado correctamente</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <div className="hidden rounded-xl border border-green-200/80 bg-green-50/60 p-3 md:p-4 lg:block">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <span className="text-green-600">●</span> Resumen
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-stone-200/80 py-2">
                    <span className="font-semibold text-stone-800">Total</span>
                    <span className="text-lg font-bold text-green-700">{formatMoney(Number(order.total), symCurrency)}</span>
                  </div>
                  <div className="flex justify-between gap-3 py-1 text-stone-600">
                    <span className="shrink-0">Proveedor</span>
                    <span className="truncate text-right font-semibold text-stone-800">{input?.supplier.name || order.contact_name || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/90 p-2 md:p-3">
                <h3 className="mb-2.5 hidden text-xs font-semibold text-stone-700 lg:block">Acciones</h3>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!!busy || !input}
                    onClick={() => void print()}
                    aria-label="Imprimir PDF"
                    className={clsx(ACTION_BTN, 'col-span-2 bg-slate-700 hover:bg-slate-800')}
                  >
                    {busy === 'print' ? <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} /> : <Printer className={ACTION_ICON} strokeWidth={2.25} />}
                    <span className={ACTION_LABEL}>Imprimir</span>
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !input}
                    onClick={() => openSend('whatsapp')}
                    aria-label="Enviar por WhatsApp"
                    className={clsx(ACTION_BTN, 'bg-[#25D366]')}
                  >
                    <MessageCircle className={ACTION_ICON} strokeWidth={2.25} />
                    <span className={ACTION_LABEL}>Whatsapp</span>
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !input}
                    onClick={() => openSend('email')}
                    aria-label="Enviar por correo"
                    className={clsx(ACTION_BTN, 'bg-orange-500 hover:bg-orange-600')}
                  >
                    <Mail className={ACTION_ICON} strokeWidth={2.25} />
                    <span className={ACTION_LABEL}>Correo</span>
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !input}
                    onClick={() => void download('ticket')}
                    aria-label="Descargar PDF ticket"
                    className={clsx(ACTION_BTN, 'bg-amber-600')}
                  >
                    {busy === 'download-ticket' ? <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} /> : <Download className={ACTION_ICON} strokeWidth={2.25} />}
                    <span className={ACTION_LABEL}>Ticket</span>
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !input}
                    onClick={() => void download('a4')}
                    aria-label="Descargar PDF A4"
                    className={clsx(ACTION_BTN, 'bg-[#E4002B]')}
                  >
                    {busy === 'download-a4' ? <Loader2 className={clsx(ACTION_ICON, 'animate-spin')} /> : <Download className={ACTION_ICON} strokeWidth={2.25} />}
                    <span className={ACTION_LABEL}>PDF</span>
                  </button>
                </div>

                {sendTo && (
                  <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 space-y-2">
                    <label className="block text-xs font-medium text-stone-600" htmlFor="po-send-to">
                      {sendTo === 'whatsapp' ? 'WhatsApp del proveedor' : 'Correo del proveedor'}
                    </label>
                    <input
                      id="po-send-to"
                      type={sendTo === 'whatsapp' ? 'tel' : 'email'}
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void confirmSend()
                      }}
                      placeholder={sendTo === 'whatsapp' ? '987654321' : 'proveedor@correo.com'}
                      autoFocus
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                    <p className="text-[11px] text-stone-500">
                      {sendTo === 'whatsapp'
                        ? 'Se abre el chat con el mensaje listo; si tu equipo lo permite, se comparte el PDF adjunto.'
                        : 'Se descarga el PDF y se abre tu correo con el mensaje listo: adjunta el archivo descargado.'}
                    </p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setSendTo(null)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busy === 'send'}
                        onClick={() => void confirmSend()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                      >
                        {busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                <div className="flex justify-center border-b border-stone-200 bg-stone-50 px-3 py-1.5">
                  <div role="group" aria-label="Formato del documento" className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
                    {(
                      [
                        { id: 'ticket', label: 'Ticket', icon: Receipt, active: 'bg-amber-600' },
                        { id: 'a4', label: 'A4', icon: FileText, active: 'bg-[#E4002B]' },
                      ] as const
                    ).map(({ id, label, icon: Icon, active }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={loading || !input}
                        onClick={() => input && format !== id && void loadPdf(input, id)}
                        aria-pressed={format === id}
                        aria-label={`Vista ${label}`}
                        className={clsx(
                          'inline-flex h-7 min-w-[4.25rem] items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors touch-manipulation',
                          format === id ? `${active} text-white shadow-sm` : 'text-stone-600 hover:bg-stone-100',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {error ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 p-6 text-center md:min-h-[360px]">
                    <FileText className="h-10 w-10 text-stone-300" aria-hidden />
                    <p className="text-sm text-stone-600">No se pudo generar el PDF.</p>
                    <button
                      type="button"
                      onClick={() => input && void loadPdf(input, format)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
                    >
                      <RefreshCw size={16} aria-hidden /> Reintentar
                    </button>
                  </div>
                ) : loading || !pdfUrl ? (
                  <div className="flex min-h-[280px] items-center justify-center md:min-h-[360px]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  </div>
                ) : (
                  <PdfBlobViewer url={pdfUrl} title="Orden de compra PDF" embedOptions={format === 'a4' ? { fit: 'page' } : undefined} />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
          <p className="hidden text-xs text-green-700 sm:block">
            <span className="font-medium">✓</span> Orden de compra · {order.number}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onGoToList} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              Ir a la lista
            </button>
            {onNewOrder && (
              <button type="button" onClick={onNewOrder} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
                Nueva orden
              </button>
            )}
          </div>
        </div>
      </div>
    </PortalModal>
  )
}
