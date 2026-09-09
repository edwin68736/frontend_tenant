import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Eye, Download, Wallet } from 'lucide-react'
import { cashbankService, type CashSession, type CashMovement } from '@/services/cashbank.service'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { categoryLabel } from '@/utils/cashMovementCategories'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { downloadCashMovementReceiptPdf, openCashMovementReceiptPdfViewer } from '@/utils/cashMovementReceiptPdf'

type MovementType = 'income' | 'expense'

const COPY: Record<MovementType, { title: string; subtitle: string; emptyLabel: string; amountLabel: string }> = {
  income: {
    title: 'Ingresos',
    subtitle: 'Ingresos manuales y ventas cobradas en tu caja abierta',
    emptyLabel: 'Sin ingresos registrados en tu caja abierta',
    amountLabel: 'Total ingresado',
  },
  expense: {
    title: 'Egresos',
    subtitle: 'Egresos manuales registrados en tu caja abierta',
    emptyLabel: 'Sin egresos registrados en tu caja abierta',
    amountLabel: 'Total retirado',
  },
}

/** Vista de Ingresos o Egresos (mismo componente, parametrizado por `type`) — CashIncomePage.tsx
 *  y CashExpensePage.tsx solo lo envuelven con RequireModule. Lista los movimientos de ESE tipo
 *  en MI caja abierta (GetOpenSession ya la resuelve por usuario, igual que en CashPage.tsx), con
 *  vínculo a la venta cuando el movimiento viene de una (sale_id) — mismo criterio que
 *  MovementsList.tsx en el detalle de sesión. */
export function CashMovementTypeView({ type }: { type: MovementType }) {
  const { activeBranchId } = useBranch()
  const { user } = useAuth()
  const copy = COPY[type]

  const [session, setSession] = useState<CashSession | null | undefined>(undefined)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const sess = await cashbankService.getOpenSession(activeBranchId || undefined)
      setSession(sess ?? null)
      if (sess?.id != null) {
        const movs = await cashbankService.listMovements(sess.id)
        setMovements((movs ?? []).filter(m => m.type === type))
      } else {
        setMovements([])
      }
    } catch {
      toast.error('Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeBranchId) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, type])

  const rowKey = (m: CashMovement) => `${m.kind}-${m.id}`

  const receiptCtx = session
    ? { sessionId: session.id, cashierName: user?.name, branchName: session.branch_name }
    : null

  const handleViewTicket = async (m: CashMovement) => {
    setBusyKey(rowKey(m))
    try {
      if (m.sale_id) {
        const { url, fileName } = await createLocalReceiptPdfObjectUrl(m.sale_id, 'ticket')
        openPdfViewer({ url, title: 'Comprobante de venta', fileName, onClose: () => URL.revokeObjectURL(url) })
      } else if (receiptCtx) {
        await openCashMovementReceiptPdfViewer(m, receiptCtx)
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDownloadTicket = async (m: CashMovement) => {
    setBusyKey(rowKey(m))
    try {
      if (m.sale_id) {
        await downloadLocalReceiptPdf(m.sale_id, 'ticket')
      } else if (receiptCtx) {
        await downloadCashMovementReceiptPdf(m, receiptCtx)
      }
      toast.success('PDF descargado')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const total = movements.reduce((s, m) => s + Number(m.amount || 0), 0)

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{copy.title}</h2>
          <p className="text-sm text-gray-500">{copy.subtitle}</p>
        </div>
        {session && (
          <div className={`px-3 py-2 rounded-xl text-sm font-semibold ${type === 'income' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {copy.amountLabel}: S/ {total.toFixed(2)}
          </div>
        )}
      </div>

      {!session ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <Wallet size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No tienes una caja abierta en esta sucursal.</p>
          <Link to="/cashbank/cash" className="inline-block mt-3 text-sm text-[rgb(var(--p600))] hover:underline">
            Ir a Caja para abrirla
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            {type === 'income' ? <TrendingUp size={14} className="text-green-500" /> : <TrendingDown size={14} className="text-red-400" />}
            <p className="text-sm font-semibold text-gray-700">Caja #{session.id} · Sesión abierta</p>
            <span className="ml-auto text-xs text-gray-400">{movements.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  {['Fecha', 'Categoría', 'Referencia', 'Método de pago', 'Monto', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-3 sm:px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const key = rowKey(m)
                  const busy = busyKey === key
                  const isLinkedSale = Boolean(m.sale_id)
                  const isLinkedPurchase = Boolean(m.purchase_id)
                  return (
                    <tr key={key} className="border-b border-gray-50">
                      <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                      <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                        {categoryLabel(m.category) || m.category}
                        {isLinkedSale && (
                          <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Venta</span>
                        )}
                        {isLinkedPurchase && (
                          <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600">Compra</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-2 text-xs text-gray-500">{m.reference || 'Sin referencia'}</td>
                      <td className="px-3 sm:px-4 py-2 whitespace-nowrap">{formatPaymentMethodLabel(m.payment_method)}</td>
                      <td className={`px-3 sm:px-4 py-2 font-semibold whitespace-nowrap ${type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                        {type === 'income' ? '+' : '-'} S/ {Number(m.amount).toFixed(2)}
                      </td>
                      <td className="px-3 sm:px-4 py-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            title={isLinkedSale ? 'Ver ticket de la venta' : 'Ver comprobante interno en formato ticket'}
                            disabled={busy}
                            onClick={() => void handleViewTicket(m)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium disabled:opacity-50"
                          >
                            <Eye size={14} /> Ver ticket
                          </button>
                          <button
                            type="button"
                            title="Descargar PDF en formato ticket"
                            disabled={busy}
                            onClick={() => void handleDownloadTicket(m)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium disabled:opacity-50"
                          >
                            <Download size={14} /> Descargar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {movements.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">{copy.emptyLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
