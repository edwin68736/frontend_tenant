import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, Loader2, Package, Search } from 'lucide-react'
import { writeXlsx, type CellValue } from 'hucre'
import { cashbankService, type SessionProductSoldRow } from '@/services/cashbank.service'
import { downloadXlsxBytes } from '@/utils/downloadXlsx'

type Props = {
  sessionId: number
  formatMoney: (n: number) => string
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''))

/**
 * Productos vendidos durante una sesión de caja (turno). Cuenta todas las ventas de la sesión sin
 * importar el método de pago (efectivo, tarjeta, transferencia, billeteras o crédito). Se consulta
 * recién al abrir la sección para no encarecer la carga del detalle.
 */
export function SessionProductsSold({ sessionId, formatMoney }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<SessionProductSoldRow[] | null>(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setRows(await cashbankService.getSessionProductsReport(sessionId))
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'No se pudieron cargar los productos vendidos')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && rows === null) void load()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (rows ?? []).filter(
      (r) => !q || r.description.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q),
    )
    return [...list].sort((a, b) => b.quantity - a.quantity || a.description.localeCompare(b.description))
  }, [rows, search])

  const totalImporte = filtered.reduce((s, r) => s + r.total, 0)
  // La cantidad total solo tiene sentido si todas las filas comparten unidad.
  const units = new Set(filtered.map((r) => r.unit || ''))
  const totalQty = filtered.reduce((s, r) => s + r.quantity, 0)

  const exportExcel = async () => {
    try {
      const sheetRows: CellValue[][] = [
        [`PRODUCTOS VENDIDOS - SESIÓN DE CAJA #${sessionId}`],
        ['Incluye ventas pagadas con cualquier método de pago; excluye ventas anuladas.'],
        [],
        ['Código', 'Producto', 'Unidad', 'Cantidad', 'Importe'],
        ...filtered.map((r): CellValue[] => [r.code || '', r.description, r.unit || '', r.quantity, r.total]),
      ]
      const bytes = await writeXlsx({ sheets: [{ name: 'Productos vendidos', rows: sheetRows }] })
      downloadXlsxBytes(bytes, `productos-vendidos-sesion-${sessionId}.xlsx`)
    } catch {
      toast.error('No se pudo exportar el Excel')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Package size={16} className="text-[rgb(var(--p600))]" />
          Productos vendidos en esta sesión
        </span>
        <span className="text-xs text-gray-400">{open ? 'Ocultar' : 'Ver detalle'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 sm:p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Todo lo vendido durante el turno, con cualquier método de pago. No incluye ventas anuladas.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto o código…"
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={loading || filtered.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500 inline-flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="hidden sm:table-cell text-left px-3 py-2 text-xs font-semibold text-gray-500">Código</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Producto</th>
                    <th className="hidden sm:table-cell text-left px-3 py-2 text-xs font-semibold text-gray-500">Unidad</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Cantidad</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? (
                    filtered.map((r) => (
                      <tr key={`${r.product_id ?? 'x'}-${r.code}-${r.description}-${r.unit}`} className="border-b border-gray-50">
                        <td className="hidden sm:table-cell px-3 py-2 text-xs text-gray-500">{r.code || '—'}</td>
                        <td className="px-3 py-2">{r.description}<span className="sm:hidden text-xs text-gray-400"> · {r.unit || '—'}</span></td>
                        <td className="hidden sm:table-cell px-3 py-2 text-xs text-gray-500">{r.unit || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtQty(r.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        {rows === null ? '' : 'No se vendieron productos en esta sesión'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot className="bg-gray-50 sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="hidden sm:table-cell px-3 py-2 text-xs font-semibold text-gray-600">
                        {filtered.length} producto(s)
                      </td>
                      <td className="sm:hidden px-3 py-2 text-xs font-semibold text-gray-600">{filtered.length} prod.</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {units.size <= 1 ? fmtQty(totalQty) : ''}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(totalImporte)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
