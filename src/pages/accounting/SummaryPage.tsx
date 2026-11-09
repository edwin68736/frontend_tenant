import { useState } from 'react'
import { Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import { accountingService, type SummaryReport } from '@/services/accounting.service'
import { currentMonth, downloadSimpleSheet, errMessage, money, monthRange } from '@/utils/accountingExport'
import {
  AccountingPage, Card, Field, Spinner, Warnings, btnPrimary, btnSecondary, inputCls,
} from '@/components/accounting/AccountingUi'

/** Reporte resumido – Ventas: por serie, comprobantes confirmados (aceptados por SUNAT) e invalidados. */
export default function SummaryPage() {
  const init = monthRange(currentMonth())
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [loading, setLoading] = useState(false)
  const [rep, setRep] = useState<SummaryReport | null>(null)

  const search = async () => {
    if (!from || !to) return
    if (to < from) {
      toast.error('La fecha final no puede ser menor que la inicial')
      return
    }
    setLoading(true)
    try {
      setRep(await accountingService.summary(from, to))
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    if (!rep) return
    const confirmed = rep.confirmed ?? []
    const voided = rep.voided ?? []
    const rows: (string | number)[][] = [
      ['CONFIRMADOS'],
      ['Comprobante', 'Serie', 'N° inicial', 'N° final', 'Cantidad', 'Valor venta', 'IGV', 'ICBPER', 'Importe', 'Números faltantes'],
      ...confirmed.map((r) => [r.type, r.series, r.first_number, r.last_number, r.quantity, r.taxable_base, r.igv, r.icbper, r.total, r.gaps]),
      ['Total', '', '', '', rep.confirmed_totals.quantity, rep.confirmed_totals.taxable_base, rep.confirmed_totals.igv, rep.confirmed_totals.icbper, rep.confirmed_totals.total, ''],
      [],
      ['INVALIDADOS'],
      ['Comprobante', 'Serie', 'Números', 'Cantidad', 'Importe'],
      ...voided.map((r) => [r.type, r.series, r.numbers, r.quantity, r.total]),
      ['Total', '', '', '', rep.voided_total],
    ]
    await downloadSimpleSheet(
      'Resumen de ventas',
      `reporte-resumido-ventas-${rep.from}-${rep.to}.xlsx`,
      [`Reporte resumido de ventas del ${rep.from} al ${rep.to}`, 'Importes en soles. Las notas de crédito restan.'],
      [],
      rows,
    )
  }

  const th = 'text-left px-2 py-2 font-semibold text-gray-600 whitespace-nowrap'
  const td = 'px-2 py-1.5 whitespace-nowrap'
  return (
    <AccountingPage
      title="Reporte resumido – Ventas"
      subtitle="Resumen por serie de lo aceptado por SUNAT y de lo anulado, con los números faltantes de cada serie."
    >
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Desde">
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button type="button" className={btnPrimary} disabled={loading} onClick={() => void search()}>
            <Search size={16} /> Buscar
          </button>
          <button type="button" className={btnSecondary} disabled={!rep} onClick={() => void exportExcel()}>
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </Card>
      {loading && <Spinner text="Calculando…" />}
      {rep && !loading && (
        <div className="space-y-4">
          <Warnings items={rep.warnings} />
          {rep.not_accepted > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Hay <strong>{rep.not_accepted}</strong> comprobante(s) del rango que todavía no están aceptados por SUNAT (pendientes o enviados);
              no se incluyen en «Confirmados».
            </div>
          )}
          <div>
            <h2 className="font-semibold text-gray-800 mb-2">Confirmados</h2>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Comprobante', 'Serie', 'N° inicial', 'N° final', 'Cantidad', 'Valor venta', 'IGV', 'ICBPER', 'Importe', 'Números faltantes'].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rep.confirmed ?? []).map((r) => (
                    <tr key={r.sunat_code + r.series} className="border-t border-gray-100">
                      <td className={td}>{r.type}</td>
                      <td className={td}>{r.series}</td>
                      <td className={td}>{r.first_number}</td>
                      <td className={td}>{r.last_number}</td>
                      <td className={td}>{r.quantity}</td>
                      <td className={td}>{money(r.taxable_base)}</td>
                      <td className={td}>{money(r.igv)}</td>
                      <td className={td}>{money(r.icbper)}</td>
                      <td className={td}>{money(r.total)}</td>
                      <td className={`${td} ${r.gaps ? 'text-amber-700 font-semibold' : ''}`}>{r.gaps || '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className={td} colSpan={4}>Total</td>
                    <td className={td}>{rep.confirmed_totals.quantity}</td>
                    <td className={td}>{money(rep.confirmed_totals.taxable_base)}</td>
                    <td className={td}>{money(rep.confirmed_totals.igv)}</td>
                    <td className={td}>{money(rep.confirmed_totals.icbper)}</td>
                    <td className={td}>{money(rep.confirmed_totals.total)}</td>
                    <td className={td} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 mb-2">Invalidados</h2>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Comprobante', 'Serie', 'Números', 'Cantidad', 'Importe'].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rep.voided ?? []).length === 0 && (
                    <tr><td className={`${td} text-gray-500`} colSpan={5}>No hay comprobantes anulados en el rango.</td></tr>
                  )}
                  {(rep.voided ?? []).map((r) => (
                    <tr key={r.sunat_code + r.series} className="border-t border-gray-100">
                      <td className={td}>{r.type}</td>
                      <td className={td}>{r.series}</td>
                      <td className="px-2 py-1.5">{r.numbers}</td>
                      <td className={td}>{r.quantity}</td>
                      <td className={td}>{money(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className={td} colSpan={4}>Total</td>
                    <td className={td}>{money(rep.voided_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AccountingPage>
  )
}
