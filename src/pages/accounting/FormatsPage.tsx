import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { accountingService, type AccountingExport } from '@/services/accounting.service'
import {
  currentMonth, downloadAccountingTable, downloadAccountingText, errMessage,
} from '@/utils/accountingExport'
import {
  AccountingPage, Card, Field, Spinner, TablePreview, Warnings, btnPrimary, inputCls,
} from '@/components/accounting/AccountingUi'

const HINTS: Record<string, string> = {
  concar: 'Asiento por comprobante con una línea por concepto (total, IGV e ingresos por tipo de operación). Las notas de crédito invierten Debe/Haber.',
  concar_simple: 'Como CONCAR, en moneda original y con la columna «Tasa IGV».',
  siscont_txt: 'Archivo de texto de ancho fijo (358 caracteres por línea).',
  siscont_excel: 'Una fila por comprobante (56 columnas).',
  foxcont: 'Una fila por comprobante, siempre en soles; los anulados salen como «ANULADA».',
  contasis: 'Una fila por comprobante, sin fila de títulos (42 columnas).',
  adsoft: 'Una fila por comprobante; cada base (gravada, exonerada, inafecta) en su columna.',
  sumerius: 'Una fila por comprobante con las cuentas de la configuración sobre las columnas de importes.',
}

/** Exportar formatos – Sistemas contables: asientos de venta de un mes. */
export default function FormatsPage() {
  const [formats, setFormats] = useState<{ key: string; name: string }[]>([])
  const [format, setFormat] = useState('concar')
  const [month, setMonth] = useState(currentMonth())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AccountingExport | null>(null)

  useEffect(() => {
    accountingService.formats().then(setFormats).catch((e) => toast.error(errMessage(e)))
  }, [])

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const ex = await accountingService.exportFormat(format, month)
      setResult(ex)
      if (ex.text != null) {
        if (!ex.text.trim()) toast.warning('No hay comprobantes en el periodo')
        else await downloadAccountingText(ex.text, ex.file_name)
      } else if (ex.table) {
        if ((ex.table.rows ?? []).length === 0) toast.warning('No hay comprobantes en el periodo')
        await downloadAccountingTable(ex.table)
      }
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AccountingPage
      title="Exportar formatos – Sistemas contables"
      subtitle="Asientos de venta del mes para importar en tu sistema contable. Las cuentas se configuran en Ajustes → Contabilidad."
    >
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field label="Mes">
            <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Sistema contable">
            <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value)}>
              {formats.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className={btnPrimary} disabled={loading || !month} onClick={() => void run()}>
            <Download size={16} /> Descargar
          </button>
        </div>
        {HINTS[format] && <p className="text-xs text-gray-500 mt-3">{HINTS[format]}</p>}
      </Card>
      {loading && <Spinner text="Generando archivo…" />}
      {result && !loading && (
        <div className="space-y-3">
          <Warnings items={result.warnings ?? result.table?.warnings} />
          {result.table && <TablePreview table={result.table} limit={15} />}
          {result.text != null && (
            <pre className="text-[10px] leading-tight bg-gray-50 border border-gray-200 rounded-xl p-2 overflow-x-auto max-h-56">
              {result.text.split('\r\n').slice(0, 12).join('\n')}
            </pre>
          )}
        </div>
      )}
    </AccountingPage>
  )
}
