import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, FileText, Receipt } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { WhatsAppGlyph } from '@/components/icons/WhatsAppGlyph'
import { ecommerceService, type EcommerceOrder, type EcommerceOrderItem } from '@/services/ecommerce.service'
import { formatMoney } from '@/utils/format'
import { downloadReceiptPdf } from '@/utils/receiptPdf'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import ConvertOrderModal from './ConvertOrderModal'

const STATUS_LABEL: Record<EcommerceOrder['status'], string> = {
  nuevo: 'Nuevo',
  atendido: 'Atendido',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

const STATUS_BADGE: Record<EcommerceOrder['status'], string> = {
  nuevo: 'bg-blue-50 text-blue-700 border-blue-200',
  atendido: 'bg-amber-50 text-amber-700 border-amber-200',
  cerrado: 'bg-green-50 text-green-700 border-green-200',
  cancelado: 'bg-gray-100 text-gray-500 border-gray-200',
}

function parseItems(itemsJSON: string): EcommerceOrderItem[] {
  try {
    const arr = JSON.parse(itemsJSON)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export default function PedidosWebPage() {
  return (
    <RequireModule moduleKey="ecommerce">
      <PedidosWebContent />
    </RequireModule>
  )
}

function PedidosWebContent() {
  const [orders, setOrders] = useState<EcommerceOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | EcommerceOrder['status']>('all')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [generatingPdfId, setGeneratingPdfId] = useState<number | null>(null)
  const [convertOrder, setConvertOrder] = useState<EcommerceOrder | null>(null)

  const load = () => {
    setLoading(true)
    ecommerceService
      .listOrders(statusFilter === 'all' ? undefined : statusFilter)
      .then(setOrders)
      .catch(() => toast.error('Error cargando pedidos'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [statusFilter])

  const handleStatusChange = async (id: number, status: EcommerceOrder['status']) => {
    try {
      await ecommerceService.updateOrderStatus(id, status)
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, status } : o)))
      toast.success('Estado actualizado')
    } catch {
      toast.error('Error al actualizar el estado')
    }
  }

  const handleGeneratePdf = async (id: number) => {
    setGeneratingPdfId(id)
    try {
      const printData = await ecommerceService.getOrderPrintData(id)
      await downloadReceiptPdf(printData, 'a4')
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setGeneratingPdfId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Pedidos web</h2>
          <p className="text-sm text-gray-500">Pedidos armados en tu Catálogo Digital. La negociación continúa por WhatsApp.</p>
        </div>
        <select
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Todos los estados</option>
          <option value="nuevo">Nuevo</option>
          <option value="atendido">Atendido</option>
          <option value="cerrado">Cerrado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
          <ShoppingBag size={28} className="mx-auto mb-3 text-gray-300" />
          Sin pedidos todavía.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Fecha</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Cliente</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Productos</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Total</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Estado</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const items = parseItems(o.items_json)
                  const expanded = expandedId === o.id
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{new Date(o.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-800">{o.customer_name || 'Sin nombre'}</p>
                          <p className="text-xs text-gray-400">{o.customer_phone || '—'}</p>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : o.id)}
                            className="text-xs text-[rgb(var(--p600))] hover:underline"
                          >
                            {items.length} producto{items.length === 1 ? '' : 's'} {expanded ? '▲' : '▼'}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatMoney(o.total)}</td>
                        <td className="px-4 py-2">
                          <select
                            value={o.status}
                            onChange={e => handleStatusChange(o.id, e.target.value as EcommerceOrder['status'])}
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[o.status]}`}
                          >
                            {(Object.keys(STATUS_LABEL) as EcommerceOrder['status'][]).map(s => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {(() => {
                              const wa = normalizePhoneForWhatsApp(o.customer_phone)
                              return wa ? (
                                <a
                                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${o.customer_name || ''}, te escribo por tu pedido web #${o.id}.`)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Chatear por WhatsApp"
                                  className="inline-flex items-center p-1.5 text-green-600 hover:bg-green-50 rounded-lg ring-1 ring-green-200/80"
                                >
                                  <WhatsAppGlyph className="w-4 h-4" />
                                </a>
                              ) : null
                            })()}
                            <button
                              type="button"
                              onClick={() => void handleGeneratePdf(o.id)}
                              disabled={generatingPdfId === o.id}
                              title="Generar PDF"
                              className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg disabled:opacity-40"
                            >
                              <FileText size={14} />
                            </button>
                            {o.converted_sale_id ? (
                              <span className="text-xs text-green-700 font-medium whitespace-nowrap">Venta #{o.converted_sale_id}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConvertOrder(o)}
                                title="Convertir en venta"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[rgb(var(--p600))] border border-[rgb(var(--p200))] hover:bg-[rgb(var(--p50))]"
                              >
                                <Receipt size={14} /> Convertir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-gray-50 bg-gray-50/50">
                          <td />
                          <td colSpan={5} className="px-4 py-2">
                            <ul className="text-xs text-gray-600 space-y-1">
                              {items.map((it, i) => (
                                <li key={i} className="flex justify-between max-w-md">
                                  <span>{it.name} × {it.quantity}</span>
                                  <span className="font-mono">{formatMoney(it.quantity * it.unit_price)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {convertOrder && (
        <ConvertOrderModal
          order={convertOrder}
          onClose={() => setConvertOrder(null)}
          onConverted={load}
        />
      )}
    </div>
  )
}
