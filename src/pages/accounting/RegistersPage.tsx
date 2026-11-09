import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { accountingService, type AccountingTable } from '@/services/accounting.service'
import { currentMonth, downloadAccountingTable, errMessage } from '@/utils/accountingExport'
import {
  AccountingPage, Card, Field, Spinner, TablePreview, Warnings, btnPrimary, btnSecondary, inputCls,
} from '@/components/accounting/AccountingUi'

type Kind = 'sales' | 'purchases'

/** Exportar reporte: Registro de Ventas (14.1) y Registro de Compras (8.1) de un mes. */
export default function RegistersPage() {
  const { hasPermission } = useAuth()
  const canSales = hasPermission('accounting.sales_register')
  const canPurchases = hasPermission('accounting.purchases_register')
  const [params] = useSearchParams()
  const wanted: Kind = params.get('kind') === 'purchases' ? 'purchases' : 'sales'
  const [kind, setKind] = useState<Kind>(wanted === 'purchases' && canPurchases ? 'purchases' : canSales ? 'sales' : 'purchases')
  useEffect(() => {
    if (wanted === 'purchases' && canPurchases) setKind('purchases')
    else if (wanted === 'sales' && canSales) setKind('sales')
  }, [wanted, canSales, canPurchases])
  const [month, setMonth] = useState(currentMonth())
  const [withStatus, setWithStatus] = useState(false)
  const [loading, setLoading] = useState(false)
  const [table, setTable] = useState<AccountingTable | null>(null)

  const fetchTable = () =>
    kind === 'sales' ? accountingService.salesRegister(month, withStatus) : accountingService.purchasesRegister(month)

  const preview = async () => {
    setLoading(true)
    try {
      setTable(await fetchTable())
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const download = async () => {
    setLoading(true)
    try {
      const t = table ?? (await fetchTable())
      setTable(t)
      if ((t.rows ?? []).length === 0) toast.warning('No hay registros en el periodo; se descarga solo el encabezado')
      await downloadAccountingTable(t)
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AccountingPage
      title="Exportar reporte"
      subtitle="Registro de Ventas e Ingresos (14.1) y Registro de Compras (8.1), en soles, con las notas de crédito en negativo."
    >
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Reporte">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind)
                setTable(null)
              }}
            >
              {canSales && <option value="sales">Registro de ventas</option>}
              {canPurchases && <option value="purchases">Registro de compras</option>}
            </select>
          </Field>
          <Field label="Mes">
            <input
              type="month"
              className={inputCls}
              value={month}
              onChange={(e) => {
                setMonth(e.target.value)
                setTable(null)
              }}
            />
          </Field>
          {kind === 'sales' && (
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input
                type="checkbox"
                checked={withStatus}
                onChange={(e) => {
                  setWithStatus(e.target.checked)
                  setTable(null)
                }}
              />
              Incluir columna «Estado»
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} disabled={loading || !month} onClick={() => void preview()}>
              <Eye size={16} /> Ver
            </button>
            <button type="button" className={btnPrimary} disabled={loading || !month} onClick={() => void download()}>
              <Download size={16} /> Excel
            </button>
          </div>
        </div>
      </Card>
      {loading && <Spinner text="Generando…" />}
      {table && !loading && (
        <div className="space-y-3">
          <Warnings items={table.warnings} />
          <TablePreview table={table} />
        </div>
      )}
    </AccountingPage>
  )
}
