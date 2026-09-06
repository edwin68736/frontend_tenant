import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, FileDown, FileSpreadsheet } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import {
  cashbankService,
  type CashSession,
  type CashSessionReport,
  type SessionBalanceSummary,
  type CashMovement,
} from '@/services/cashbank.service'
import { formatPaymentMethodLabel, isDetractionPaymentMethod } from '@/utils/paymentMethodLabel'
import { DETRACCION_PAYMENT_METHOD_NAME } from '@/utils/fiscalDetraction'
import { downloadCashSessionReportPdf } from '@/utils/cashSessionReportPdf'
import { downloadCashSessionReportExcel } from '@/utils/cashReportExcel'
import { categoryLabel } from '@/utils/cashMovementCategories'
import { MethodBalanceGrid } from '@/components/cash/MethodBalanceGrid'
import { MovementsList } from '@/components/cash/MovementsList'
import { ArqueoTable, sumArqueo, arqueoSumColorClass, parseArqueoJson } from '@/components/cash/ArqueoTable'

function isEfectivo(m: string): boolean {
  const c = (m?.toLowerCase() ?? '')
  return c === 'efectivo' || c === 'cash'
}

// Mismo criterio que CashReportsPage.tsx (independiente a propósito — vista aparte, no
// compartida — ver la nota en el commit): un tipo desconocido nunca cae silenciosamente en
// "Egreso/Ingreso manual".
function expenseTypeLabel(type: string): string {
  switch (type) {
    case 'compra': return 'Compra'
    case 'gasto': return 'Gasto'
    case 'egreso_manual': return 'Egreso manual'
    case 'pago_proveedor': return 'Pago a proveedor'
    default: return type || 'Egreso'
  }
}

function incomeTypeLabel(type: string): string {
  switch (type) {
    case 'venta': return 'Venta'
    case 'cobro_cxc': return 'Cobro CxC'
    case 'ingreso_manual': return 'Ingreso manual'
    default: return type || 'Ingreso'
  }
}

export default function CashSessionDetailPage() {
  return (
    <RequireModule moduleKey="cashbank">
      <CashSessionDetailContent />
    </RequireModule>
  )
}

function CashSessionDetailContent() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)

  const [session, setSession] = useState<CashSession | null>(null)
  const [report, setReport] = useState<CashSessionReport | null>(null)
  const [balanceSummary, setBalanceSummary] = useState<SessionBalanceSummary | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Revertir movimiento manual — solo tiene sentido con la sesión abierta (el backend rechaza
  // revertir sobre una sesión cerrada); reversingId es "kind-id" porque tenant_cash_movements y
  // tenant_bank_movements manuales tienen cada una su propia secuencia de IDs.
  const [reverseTarget, setReverseTarget] = useState<CashMovement | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)

  const load = async () => {
    if (!Number.isFinite(sessionId) || sessionId <= 0) { setLoading(false); return }
    setLoading(true)
    try {
      const [sess, rep, bal, movs] = await Promise.all([
        cashbankService.getSession(sessionId),
        cashbankService.getSessionReport(sessionId),
        cashbankService.getSessionBalance(sessionId),
        cashbankService.listMovements(sessionId),
      ])
      setSession(sess)
      setReport(rep)
      setBalanceSummary(bal)
      setMovements(movs ?? [])
    } catch {
      toast.error('No se pudo cargar el detalle de la sesión')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [sessionId])

  const methodLabelFor = (method?: string): string => {
    if (!method) return '—'
    const found = balanceSummary?.by_method.find(m => m.method === method.toLowerCase())
    if (found) return found.label
    return method.charAt(0).toUpperCase() + method.slice(1)
  }

  const handleReverseMovement = async () => {
    if (!reverseTarget) return
    setReversingId(`${reverseTarget.kind}-${reverseTarget.id}`)
    try {
      await cashbankService.reverseMovement(reverseTarget.id, reverseTarget.kind)
      toast.success('Movimiento revertido')
      setReverseTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo revertir el movimiento')
    } finally {
      setReversingId(null)
    }
  }

  const exportPdf = async () => {
    if (!report) return
    setExporting(true)
    try {
      downloadCashSessionReportPdf(report)
      toast.success('PDF descargado')
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExporting(false)
    }
  }

  const exportExcel = async () => {
    if (!report) return
    setExporting(true)
    try {
      await downloadCashSessionReportExcel(report, formatPaymentMethodLabel)
      toast.success('Excel descargado')
    } catch {
      toast.error('No se pudo exportar el Excel')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  if (!session || !report) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No se encontró la sesión.{' '}
        <Link to="/cashbank/cash" className="text-[rgb(var(--p600))] hover:underline">Volver al historial</Link>
      </div>
    )
  }

  const formatMoney = (n: number) => `S/ ${Number(n).toFixed(2)}`
  const cashExpected = report.cash_physical?.physical_balance ?? balanceSummary?.cash_expected ?? 0
  const spotTotal = report.detraction?.total_spot ?? report.totals.total_detraccion_spot ?? 0
  const directSalesTotal = report.totals.total_sales_direct ?? report.totals.total_sales ?? 0
  const commercialTotal = report.totals.total_sales_commercial ?? directSalesTotal + spotTotal
  // Mismo criterio que CashReportsPage.tsx: "cobrado directo" es venta o cobro CxC, nunca una
  // detracción (SPOT tiene su propia sección, sin impacto en arqueo).
  const directIncomeRows = report.income_detail.filter(
    row => (row.type === 'venta' || row.type === 'cobro_cxc') && !isDetractionPaymentMethod(row.payment_method),
  )
  const arqueoCounted = session.arqueo_json ? parseArqueoJson(session.arqueo_json) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/cashbank/cash" title="Volver al historial" className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Detalle de sesión #{session.id}</h2>
            <p className="text-sm text-gray-500">{session.status === 'open' ? 'Abierta' : 'Cerrada'} · {new Date(session.opened_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Encabezado sesión */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div><span className="text-gray-500">Sucursal</span><p className="font-medium">{report.session.branch_name}</p></div>
          <div><span className="text-gray-500">Abierta por</span><p className="font-medium">{report.session.opened_by_user_name}</p></div>
          <div><span className="text-gray-500">Apertura</span><p className="font-medium">{new Date(report.session.opened_at).toLocaleString()}</p></div>
          <div><span className="text-gray-500">Cierre</span><p className="font-medium">{report.session.closed_at ? new Date(report.session.closed_at).toLocaleString() : '-'}</p></div>
          <div><span className="text-gray-500">Monto inicial</span><p className="font-medium">{formatMoney(report.session.opening_balance)}</p></div>
        </div>
      </div>

      {/* Saldos por método + total de la sesión (todos los métodos) */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Saldos por método</p>
        <MethodBalanceGrid byMethod={balanceSummary?.by_method ?? []} />
      </div>
      <div className="bg-[rgb(var(--p50))] rounded-2xl shadow-sm p-3 sm:p-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-[rgb(var(--p800))]">Total de la sesión</p>
        <p className="text-xl font-bold text-[rgb(var(--p700))]">{formatMoney(balanceSummary?.total ?? report.totals.final_balance)}</p>
      </div>

      {/* Efectivo / Arqueo — exclusivamente físico, nunca el total. */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Efectivo / Arqueo</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Solo efectivo físico</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Efectivo esperado</p>
            <p className="font-bold text-gray-800">{formatMoney(cashExpected)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Efectivo contado</p>
            <p className="font-bold text-gray-800">{arqueoCounted ? formatMoney(sumArqueo(arqueoCounted)) : '— (sin arqueo aún)'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Diferencia</p>
            {arqueoCounted ? (
              <p className={arqueoSumColorClass(sumArqueo(arqueoCounted), cashExpected)}>{formatMoney(sumArqueo(arqueoCounted) - cashExpected)}</p>
            ) : (
              <p className="font-bold text-gray-400">—</p>
            )}
          </div>
        </div>
        {arqueoCounted && (
          <div className="mt-3">
            <ArqueoTable arqueo={arqueoCounted} editable={false} totalColorClass={arqueoSumColorClass(sumArqueo(arqueoCounted), cashExpected)} />
          </div>
        )}
      </div>

      {/* Totales generales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Cobrado directo', val: directSalesTotal, color: 'text-emerald-700', bg: 'bg-emerald-50', hint: 'Efectivo, Yape, Plin, etc.' },
          { label: DETRACCION_PAYMENT_METHOD_NAME, val: spotTotal, color: 'text-amber-800', bg: 'bg-amber-50', hint: 'Sin impacto en arqueo' },
          { label: 'Total comercial', val: commercialTotal, color: 'text-gray-800', bg: 'bg-gray-50', hint: 'Directo + SPOT' },
          { label: 'Total ingresos caja', val: report.totals.total_income, color: 'text-green-600', bg: 'bg-green-50', hint: 'Movimientos físicos' },
          { label: 'Total egresos', val: report.totals.total_expense, color: 'text-red-600', bg: 'bg-red-50', hint: '' },
          { label: 'Saldo final', val: report.totals.final_balance, color: 'text-[rgb(var(--p700))]', bg: 'bg-[rgb(var(--p50))]', hint: '' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-2xl shadow-sm p-4`}>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{formatMoney(c.val)}</p>
            {c.hint && <p className="text-[10px] text-gray-500 mt-0.5">{c.hint}</p>}
          </div>
        ))}
      </div>

      {(report.credit_generated?.total ?? 0) > 0 && (
        <div className="bg-blue-50 rounded-2xl shadow-sm p-4 border border-blue-100">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Crédito generado (CxC)</h3>
          <p className="text-xs text-blue-800 mb-3">
            Ventas a crédito registradas en esta sesión, todavía sin cobrar. No es dinero recibido: no entra
            a "Cobrado directo" ni al arqueo. El saldo pendiente se cobra desde Cuentas por cobrar.
          </p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-blue-800">Total generado</span>
            <span className="text-sm font-bold text-blue-900">{formatMoney(report.credit_generated?.total ?? 0)}</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-100/50 sticky top-0">
                <tr>{['Fecha', 'Comprobante', 'Monto'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-blue-900">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(report.credit_generated?.sales ?? []).map((row, i) => (
                  <tr key={i} className="border-b border-blue-100/80">
                    <td className="px-3 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.doc_number || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-blue-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(report.payable_generated?.total ?? 0) > 0 && (
        <div className="bg-orange-50 rounded-2xl shadow-sm p-4 border border-orange-100">
          <h3 className="text-sm font-semibold text-orange-900 mb-2">Cuenta por pagar generada (CxP)</h3>
          <p className="text-xs text-orange-800 mb-3">
            Compras a crédito registradas en esta sesión, todavía sin pagar al proveedor. No es dinero pagado:
            no entra a "Total egresos" ni al arqueo. El saldo pendiente se paga desde Cuentas por pagar.
          </p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-orange-800">Total generado</span>
            <span className="text-sm font-bold text-orange-900">{formatMoney(report.payable_generated?.total ?? 0)}</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-100/50 sticky top-0">
                <tr>{['Fecha', 'Comprobante', 'Monto'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-orange-900">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(report.payable_generated?.purchases ?? []).map((row, i) => (
                  <tr key={i} className="border-b border-orange-100/80">
                    <td className="px-3 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.doc_number || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-orange-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totales por método de pago */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Totales por método de pago</h3>
        <div className="grid md:grid-cols-3 gap-4 p-4">
          {[
            { label: 'Ventas', list: report.totals_by_method.sales },
            { label: 'Compras', list: report.totals_by_method.purchases },
            { label: 'Movimientos de caja', list: report.totals_by_method.movements },
          ].map(block => (
            <div key={block.label}>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">{block.label}</p>
              <table className="w-full text-sm">
                <tbody>
                  {block.list?.length ? block.list.map((x, idx) => (
                    <tr key={`${x.method}-${idx}`} className="flex justify-between gap-2"><td>{formatPaymentMethodLabel(x.method)}</td><td className="font-medium">{formatMoney(x.total)}</td></tr>
                  )) : <tr><td className="text-gray-400">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle ingresos */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Detalle de ingresos (cobro directo)</h3>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0"><tr>{['Fecha', 'Tipo', 'Documento', 'Referencia', 'Método', 'Caja origen', 'Monto'].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody>
              {directIncomeRows.length ? directIncomeRows.map((row, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                  <td className="px-4 py-2">{incomeTypeLabel(row.type)}</td>
                  <td className="px-4 py-2">{row.doc_number || '-'}</td>
                  <td className="px-4 py-2">{row.reference || '-'}</td>
                  <td className="px-4 py-2">{formatPaymentMethodLabel(row.payment_method)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{row.type === 'cobro_cxc' && row.sale_cash_session_id ? `#${row.sale_cash_session_id}` : '—'}</td>
                  <td className="px-4 py-2 font-medium text-green-600">{formatMoney(row.amount)}</td>
                </tr>
              )) : <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin ingresos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle egresos */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Detalle de egresos</h3>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0"><tr>{['Fecha', 'Tipo', 'Documento', 'Referencia', 'Método', 'Monto'].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody>
              {report.expense_detail?.length ? report.expense_detail.map((row, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                  <td className="px-4 py-2">{expenseTypeLabel(row.type)}</td>
                  <td className="px-4 py-2">{row.doc_number || '-'}</td>
                  <td className="px-4 py-2">{row.reference || '-'}</td>
                  <td className="px-4 py-2">{formatPaymentMethodLabel(row.payment_method)}</td>
                  <td className="px-4 py-2 font-medium text-red-600">{formatMoney(row.amount)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin egresos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movimientos manuales — con reversión si la sesión sigue abierta. */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Movimientos de la sesión</p>
          <span className="text-xs text-gray-400">{movements.length} registros</span>
        </div>
        <MovementsList
          movements={movements}
          methodLabelFor={methodLabelFor}
          onReverse={session.status === 'open' ? setReverseTarget : undefined}
          reversingId={reversingId}
        />
      </div>

      {/* Confirmar reversión de movimiento manual */}
      <Modal open={!!reverseTarget} onClose={() => setReverseTarget(null)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Revertir movimiento</h3>
        {reverseTarget && (
          <p className="text-sm text-gray-600">
            Se creará un movimiento compensatorio de <span className="font-semibold">{methodLabelFor(reverseTarget.payment_method)}</span> por{' '}
            <span className="font-semibold">{formatMoney(reverseTarget.amount)}</span> ({categoryLabel(reverseTarget.category) || reverseTarget.type}).
            El movimiento original no se borra — queda en el historial, referenciado desde la reversión.
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={() => setReverseTarget(null)}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleReverseMovement}
            disabled={reversingId != null}
            className="flex-1 py-2.5 sm:py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {reversingId != null ? 'Revirtiendo…' : 'Revertir'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
