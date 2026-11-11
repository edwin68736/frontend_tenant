import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Send, Ban, ShoppingCart, Eye, Printer, Download } from 'lucide-react'
import { contactsService } from '@/services/contacts.service'
import { openPurchaseOrderPdfViewer, downloadPurchaseOrderPdf } from '@/utils/purchaseOrderPdf'
import {
  purchaseOrdersService,
  PURCHASE_ORDER_STATUS_LABEL,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '@/services/purchaseOrders.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useBranchWriteGuard } from '@/hooks/useBranchWriteGuard'
import { formatDisplayDatePeru } from '@/utils/datesPeru'

export const currencySymbol = (c: string) => (c === 'USD' ? 'US$' : 'S/')

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  received: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

export default function PurchaseOrdersPage() {
  return (
    <RequireModule moduleKey="purchases">
      <PurchaseOrdersContent />
    </RequireModule>
  )
}

function PurchaseOrdersContent() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { canWrite } = useBranchWriteGuard()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [detail, setDetail] = useState<{ order: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<PurchaseOrder | null>(null)

  const canCreate = canWrite && hasPermission('purchases.create')
  const canDelete = canWrite && hasPermission('purchases.delete')

  const load = () =>
    purchaseOrdersService
      .list({ q: q.trim() || undefined, status: status || undefined, limit: 100 })
      .then(({ data }) => setRows(data))
      .catch(() => toast.error('No se pudieron cargar las órdenes de compra'))
      .finally(() => setLoading(false))

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status])

  const errMsg = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback

  const openDetail = async (id: number) => {
    try {
      setDetail(await purchaseOrdersService.get(id))
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cargar la orden'))
    }
  }

  const printOrder = async (mode: 'view' | 'download') => {
    if (!detail) return
    try {
      // Datos del proveedor para el documento (la orden solo guarda el id).
      const c = detail.order.contact_id ? await contactsService.get(detail.order.contact_id).catch(() => null) : null
      const input = {
        order: detail.order,
        items: detail.items,
        supplier: {
          name: c?.business_name || detail.order.contact_name || '',
          docNumber: c?.doc_number,
          address: c?.address,
        },
      }
      if (mode === 'view') await openPurchaseOrderPdfViewer(input)
      else await downloadPurchaseOrderPdf(input)
    } catch {
      toast.error('No se pudo generar el PDF de la orden')
    }
  }

  const markSent = async (o: PurchaseOrder) => {
    try {
      await purchaseOrdersService.send(o.id)
      toast.success('Orden marcada como enviada')
      setDetail(null)
      void load()
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo actualizar'))
    }
  }

  const cancel = async () => {
    if (!confirmCancel) return
    try {
      await purchaseOrdersService.cancel(confirmCancel.id)
      toast.success('Orden anulada')
      setConfirmCancel(null)
      setDetail(null)
      void load()
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo anular'))
      setConfirmCancel(null)
    }
  }

  const open = (o: PurchaseOrder) => o.status === 'draft' || o.status === 'sent'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Órdenes de compra</h2>
          <p className="text-sm text-gray-500">Pedidos al proveedor. No mueven stock ni caja hasta registrar la compra.</p>
        </div>
        {canCreate && (
          <Link
            to="/purchases/orders/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> Nueva orden
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar por número o proveedor..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(PURCHASE_ORDER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Fecha', 'Orden', 'Proveedor', 'Entrega', 'Total', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDisplayDatePeru(o.issue_date)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{o.number}</td>
                  <td className="px-4 py-3 text-gray-700">{o.contact_name || 'Sin proveedor'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {o.expected_date ? formatDisplayDatePeru(o.expected_date) : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {currencySymbol(o.currency)} {Number(o.total).toFixed(2)}
                    {o.currency === 'USD' && o.exchange_rate ? (
                      <span className="block text-xs font-normal text-gray-400">
                        ≈ S/ {(Number(o.total) * Number(o.exchange_rate)).toFixed(2)} (TC {Number(o.exchange_rate).toFixed(3)})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] ?? ''}`}>
                      {PURCHASE_ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Ver"
                        onClick={() => void openDetail(o.id)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                      >
                        <Eye size={15} />
                      </button>
                      {canCreate && open(o) && (
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => navigate(`/purchases/orders/${o.id}/edit`)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No hay órdenes de compra.</div>
          )}
        </div>
      </div>

      <Modal open={detail !== null} onClose={() => setDetail(null)} contentClassName="max-w-3xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-800">Orden {detail.order.number}</h3>
                <p className="text-sm text-gray-500">{detail.order.contact_name}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[detail.order.status] ?? ''}`}>
                {PURCHASE_ORDER_STATUS_LABEL[detail.order.status]}
              </span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-xs text-gray-500">Emisión</dt><dd>{formatDisplayDatePeru(detail.order.issue_date)}</dd></div>
              <div><dt className="text-xs text-gray-500">Entrega</dt><dd>{detail.order.expected_date ? formatDisplayDatePeru(detail.order.expected_date) : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Moneda</dt><dd>{detail.order.currency}{detail.order.exchange_rate ? ` · TC ${Number(detail.order.exchange_rate).toFixed(3)}` : ''}</dd></div>
              <div><dt className="text-xs text-gray-500">Condición de pago</dt><dd>{detail.order.payment_condition || '—'}</dd></div>
            </dl>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Producto</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Cant.</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Costo</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id} className="border-t border-gray-50">
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(it.unit_cost).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(it.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm space-y-0.5">
              <p className="text-gray-600">Subtotal {currencySymbol(detail.order.currency)} {Number(detail.order.subtotal).toFixed(2)}</p>
              <p className="text-gray-600">IGV {currencySymbol(detail.order.currency)} {Number(detail.order.tax_amount).toFixed(2)}</p>
              <p className="font-bold text-gray-800 text-base">Total {currencySymbol(detail.order.currency)} {Number(detail.order.total).toFixed(2)}</p>
            </div>
            {detail.order.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.order.notes}</p>}
            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-gray-100">
              <button type="button" onClick={() => void printOrder('view')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
                <Printer size={14} /> Imprimir / PDF
              </button>
              <button type="button" onClick={() => void printOrder('download')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
                <Download size={14} /> Descargar
              </button>
              {canCreate && detail.order.status === 'draft' && (
                <button type="button" onClick={() => void markSent(detail.order)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
                  <Send size={14} /> Marcar como enviada
                </button>
              )}
              {canDelete && open(detail.order) && (
                <button type="button" onClick={() => setConfirmCancel(detail.order)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm hover:bg-red-50">
                  <Ban size={14} /> Anular
                </button>
              )}
              {canCreate && open(detail.order) && (
                <Link
                  to={`/purchases/register?order=${detail.order.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90"
                >
                  <ShoppingCart size={14} /> Registrar compra
                </Link>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmCancel !== null}
        title="Anular orden de compra"
        message={`¿Anular la orden ${confirmCancel?.number ?? ''}? No se puede deshacer.`}
        confirmLabel="Anular"
        variant="danger"
        stacked
        onConfirm={cancel}
        onClose={() => setConfirmCancel(null)}
      />
    </div>
  )
}
