import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Eye, Download } from 'lucide-react'
import { cashbankService, type MovementReportRow } from '@/services/cashbank.service'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { categoryLabel } from '@/utils/cashMovementCategories'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import {
  downloadCashMovementReceiptPdf,
  openCashMovementReceiptPdfViewer,
  type CashMovementReceiptContext,
  type CashMovementReceiptInput,
} from '@/utils/cashMovementReceiptPdf'

type MovementType = 'income' | 'expense'

const PER_PAGE_OPTIONS = [20, 50, 100] as const

const COPY: Record<MovementType, { title: string; subtitle: string; emptyLabel: string; amountLabel: string }> = {
  income: {
    title: 'Ingresos',
    subtitle: 'Histórico de ingresos manuales y ventas cobradas — de mis cajas (abiertas y cerradas)',
    emptyLabel: 'Sin ingresos registrados',
    amountLabel: 'Total ingresado',
  },
  expense: {
    title: 'Egresos',
    subtitle: 'Histórico de egresos — de mis cajas (abiertas y cerradas)',
    emptyLabel: 'Sin egresos registrados',
    amountLabel: 'Total retirado',
  },
}

/** Vista de Ingresos o Egresos (mismo componente, parametrizado por `type`) — CashIncomePage.tsx
 *  y CashExpensePage.tsx solo lo envuelven con RequireModule.
 *
 * Fuente de datos: el reporte de movimientos multi-sesión (listMovementsReport), que YA incluye
 * caja abierta y cerradas, y que el backend acota a "mis" movimientos automáticamente
 * (callerUserIDOrZero en cashbank_api.go) salvo que el usuario administre cualquier caja —
 * mismo criterio de alcance que usa el resto de Caja, sin filtro extra desde el frontend. */
export function CashMovementTypeView({ type }: { type: MovementType }) {
  const { activeBranchId } = useBranch()
  const { user } = useAuth()
  const copy = COPY[type]

  const [rows, setRows] = useState<MovementReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ sumIncome: 0, sumExpense: 0 })
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(20)

  const load = async () => {
    setLoading(true)
    try {
      const res = await cashbankService.listMovementsReport({
        branch_id: activeBranchId || undefined,
        type,
        page,
        per_page: perPage,
      })
      setRows(res.data)
      setTotal(res.total)
      setSummary({ sumIncome: res.summary.sum_income, sumExpense: res.summary.sum_expense })
    } catch {
      toast.error('Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeBranchId) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, type, page, perPage])

  // Cambiar de sucursal o de tipo vuelve a la página 1 (una página que existía antes puede no
  // existir en el nuevo filtro, con menos movimientos).
  useEffect(() => {
    setPage(1)
  }, [activeBranchId, type])

  const toReceiptInput = (m: MovementReportRow): CashMovementReceiptInput => ({
    id: m.movement_id,
    type,
    category: m.category || m.type,
    reference: m.cash_reference || m.doc_number || undefined,
    payment_method: m.payment_method,
    notes: m.notes_detail,
    amount: Math.abs(m.amount),
    created_at: m.date,
  })

  const toReceiptCtx = (m: MovementReportRow): CashMovementReceiptContext => ({
    sessionId: m.cash_session_id,
    cashierName: m.user_name || user?.name,
    branchName: m.branch_name,
  })

  const handleViewTicket = async (m: MovementReportRow, key: string) => {
    setBusyKey(key)
    try {
      if (m.sale_id) {
        const { url, fileName } = await createLocalReceiptPdfObjectUrl(m.sale_id, 'ticket')
        openPdfViewer({ url, title: 'Comprobante de venta', fileName, onClose: () => URL.revokeObjectURL(url) })
      } else {
        await openCashMovementReceiptPdfViewer(toReceiptInput(m), toReceiptCtx(m))
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDownloadTicket = async (m: MovementReportRow, key: string) => {
    setBusyKey(key)
    try {
      if (m.sale_id) {
        await downloadLocalReceiptPdf(m.sale_id, 'ticket')
      } else {
        await downloadCashMovementReceiptPdf(toReceiptInput(m), toReceiptCtx(m))
      }
      toast.success('PDF descargado')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const totalAmount = type === 'income' ? summary.sumIncome : summary.sumExpense

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{copy.title}</h2>
          <p className="text-sm text-gray-500">{copy.subtitle}</p>
        </div>
        <div className={`px-3 py-2 rounded-xl text-sm font-semibold ${type === 'income' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {copy.amountLabel}: S/ {totalAmount.toFixed(2)}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {type === 'income' ? <TrendingUp size={14} className="text-green-500" /> : <TrendingDown size={14} className="text-red-400" />}
          <p className="text-sm font-semibold text-gray-700">Historial</p>
          <span className="ml-auto text-xs text-gray-400">{total} registros</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr>
                    {['Fecha', 'Sesión', 'Categoría', 'Documento / Referencia', 'Usuario', 'Método de pago', 'Monto', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-3 sm:px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, idx) => {
                    const key = `${m.movement_id}-${m.type}-${idx}`
                    const busy = busyKey === key
                    const isLinkedSale = Boolean(m.sale_id)
                    const isLinkedPurchase = Boolean(m.purchase_id)
                    return (
                      <tr key={key} className="border-b border-gray-50">
                        <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{new Date(m.date).toLocaleString()}</td>
                        <td className="px-3 sm:px-4 py-2 text-xs text-gray-500 whitespace-nowrap">#{m.cash_session_id || '—'}</td>
                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                          {categoryLabel(m.category || m.type) || m.category || m.type}
                          {isLinkedSale && (
                            <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Venta</span>
                          )}
                          {isLinkedPurchase && (
                            <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600">Compra</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2 text-xs text-gray-500">{m.doc_number || m.cash_reference || 'Sin referencia'}</td>
                        <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{m.user_name || '—'}</td>
                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">{formatPaymentMethodLabel(m.payment_method)}</td>
                        <td className={`px-3 sm:px-4 py-2 font-semibold whitespace-nowrap ${type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                          {type === 'income' ? '+' : '-'} S/ {Math.abs(m.amount).toFixed(2)}
                        </td>
                        <td className="px-3 sm:px-4 py-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              title={isLinkedSale ? 'Ver ticket de la venta' : 'Ver comprobante interno en formato ticket'}
                              disabled={busy}
                              onClick={() => void handleViewTicket(m, key)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium disabled:opacity-50"
                            >
                              <Eye size={14} /> Ver ticket
                            </button>
                            <button
                              type="button"
                              title="Descargar PDF en formato ticket"
                              disabled={busy}
                              onClick={() => void handleDownloadTicket(m, key)}
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
              {rows.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">{copy.emptyLabel}</p>
              )}
            </div>

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 sm:px-4 py-3 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-gray-600">
                    Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 whitespace-nowrap">Mostrar</span>
                    <select
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                      value={perPage}
                      onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                    >
                      {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-gray-600">
                    Página {page} de {Math.max(1, Math.ceil(total / perPage))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(Math.ceil(total / perPage), p + 1))}
                    disabled={page >= Math.ceil(total / perPage)}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
