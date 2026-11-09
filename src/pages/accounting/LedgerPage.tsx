import { useState } from 'react'
import { Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import { accountingService, type Ledger } from '@/services/accounting.service'
import { currentMonth, downloadSimpleSheet, errMessage, money } from '@/utils/accountingExport'
import {
  AccountingPage, Card, Field, Spinner, Warnings, btnPrimary, btnSecondary, inputCls,
} from '@/components/accounting/AccountingUi'

/** Libro Mayor mensual: saldo anterior, débito, crédito y saldo final por cuenta. */
export default function LedgerPage() {
  const [month, setMonth] = useState(currentMonth())
  const [loading, setLoading] = useState(false)
  const [led, setLed] = useState<Ledger | null>(null)

  const search = async () => {
    setLoading(true)
    try {
      setLed(await accountingService.ledger(month))
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    if (!led) return
    await downloadSimpleSheet(
      'Libro mayor',
      `libro-mayor-${led.month}.xlsx`,
      [`${led.company} — RUC ${led.ruc}`, `Libro mayor desde ${led.from} hasta ${led.to}`, ...(led.notes ?? [])],
      ['Cuenta', 'Nombre', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo final'],
      (led.rows ?? []).map((r) => [r.code, `${'   '.repeat(r.level - 1)}${r.name}`, r.previous, r.debit, r.credit, r.final]),
    )
  }

  const th = 'px-2 py-2 font-semibold text-gray-600 whitespace-nowrap'
  return (
    <AccountingPage
      title="Libro Mayor"
      subtitle="Saldos por cuenta del mes, calculados desde ventas, compras, caja, bancos y cuentas por cobrar/pagar."
    >
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field label="Mes">
            <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <button type="button" className={btnPrimary} disabled={loading || !month} onClick={() => void search()}>
            <Search size={16} /> Consultar
          </button>
          <button type="button" className={btnSecondary} disabled={!led} onClick={() => void exportExcel()}>
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </Card>
      {loading && <Spinner text="Calculando saldos…" />}
      {led && !loading && (
        <div className="space-y-3">
          <Warnings items={led.warnings} />
          <p className="text-xs text-gray-500">
            {led.company} — RUC {led.ruc} · del {led.from} al {led.to}
          </p>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className={`${th} text-left`}>Cuenta</th>
                  <th className={`${th} text-right`}>Saldo anterior</th>
                  <th className={`${th} text-right`}>Débito</th>
                  <th className={`${th} text-right`}>Crédito</th>
                  <th className={`${th} text-right`}>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {(led.rows ?? []).map((r) => (
                  <tr key={r.code} className={`border-t border-gray-100 ${r.level <= 2 ? 'bg-gray-50/60 font-semibold' : ''}`}>
                    <td className="px-2 py-1.5" style={{ paddingLeft: `${8 + (r.level - 1) * 16}px` }}>
                      <span className="text-gray-400 mr-2">{r.code}</span>
                      {r.name}
                    </td>
                    <td className="px-2 py-1.5 text-right">{money(r.previous)}</td>
                    <td className="px-2 py-1.5 text-right">{money(r.debit)}</td>
                    <td className="px-2 py-1.5 text-right">{money(r.credit)}</td>
                    <td className="px-2 py-1.5 text-right">{money(r.final)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(led.notes ?? []).map((n, i) => (
            <p key={i} className="text-xs text-gray-500">{n}</p>
          ))}
        </div>
      )}
    </AccountingPage>
  )
}
