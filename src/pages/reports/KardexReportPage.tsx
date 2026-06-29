import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryService, type StockMovement, type InventoryOperationType } from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import type { ExportColumn } from '@/utils/exportPdf'
import { getTodayPeru } from '@/utils/datesPeru'
import {
  formatInventoryDocumentRef,
  formatOperationTypeLabel,
  formatSunatCode,
  fmtMovementTypeLabel,
} from '@/utils/inventoryKardexLabels'

type Branch = { id: number; name: string }

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

function fmtMovementType(t: unknown): string {
  return fmtMovementTypeLabel(t)
}

type Row = StockMovement

const COLS: ExportColumn<Row>[] = [
  {
    key: 'created_at',
    label: 'Fecha / hora',
    format: (v: unknown) =>
      v ? new Date(String(v)).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '',
  },
  { key: 'product_code', label: 'Código' },
  { key: 'product_name', label: 'Producto' },
  { key: 'type', label: 'Movimiento', format: (v: unknown) => fmtMovementType(v) },
  {
    key: 'operation_type_name',
    label: 'Tipo operación',
    format: (_v: unknown, row: Row) => formatOperationTypeLabel(row),
  },
  {
    key: 'sunat_code',
    label: 'Código SUNAT',
    format: (_v: unknown, row: Row) => formatSunatCode(row),
  },
  {
    key: 'inventory_document_id',
    label: 'Doc. inventario',
    format: (_v: unknown, row: Row) => formatInventoryDocumentRef(row),
  },
  { key: 'quantity', label: 'Cantidad', format: (v: unknown) => Number(v).toLocaleString('es-PE', { maximumFractionDigits: 3 }) },
  { key: 'balance', label: 'Saldo', format: (v: unknown) => String(v ?? '') },
  { key: 'branch_name', label: 'Sucursal' },
  { key: 'user_name', label: 'Usuario' },
  { key: 'reference', label: 'Referencia' },
  { key: 'notes', label: 'Notas' },
]

const MOVEMENT_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'purchase_in', label: 'Entrada por compra' },
  { value: 'sale_out', label: 'Salida por venta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'adjustment', label: 'Ajuste de inventario' },
  { value: 'inventory_doc', label: 'Documento de inventario' },
  { value: 'in', label: 'Todas las entradas (in)' },
  { value: 'out', label: 'Todas las salidas (out)' },
]

export default function KardexReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [operationTypes, setOperationTypes] = useState<InventoryOperationType[]>([])
  const [data, setData] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    product_q: '',
    branch_id: '' as number | '',
    movement_kind: '',
    operation_type_id: '' as number | '',
    sunat_code: '',
    ref_notes_q: '',
    date_from: currentMonthRange.from,
    date_to: currentMonthRange.to,
  })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    Promise.all([companyService.listBranches(), inventoryService.listOperationTypes()]).then(
      ([b, ops]) => {
        setBranches(b ?? [])
        setOperationTypes(ops ?? [])
      }
    )
  }, [])

  useEffect(() => {
    void load()
  }, [
    filters.product_q,
    filters.branch_id,
    filters.movement_kind,
    filters.operation_type_id,
    filters.sunat_code,
    filters.ref_notes_q,
    filters.date_from,
    filters.date_to,
    page,
    perPage,
  ])

  useEffect(() => {
    setPage(1)
  }, [
    filters.product_q,
    filters.branch_id,
    filters.movement_kind,
    filters.operation_type_id,
    filters.sunat_code,
    filters.ref_notes_q,
    filters.date_from,
    filters.date_to,
  ])

  const load = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof inventoryService.listMovements>[0] = {
        page,
        per_page: perPage,
      }
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to
      if (filters.branch_id) params.branch_id = Number(filters.branch_id)
      if (filters.product_q.trim()) params.product_q = filters.product_q.trim()
      if (filters.movement_kind) params.movement_kind = filters.movement_kind
      if (filters.operation_type_id) params.operation_type_id = Number(filters.operation_type_id)
      if (filters.sunat_code.trim()) params.sunat_code = filters.sunat_code.trim()
      if (filters.ref_notes_q.trim()) params.q = filters.ref_notes_q.trim()

      const { data: list, total: t } = await inventoryService.listMovements(params)
      setData(Array.isArray(list) ? list : [])
      setTotal(Number(t) || 0)
    } catch {
      toast.error('Error al cargar kardex')
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const totalRows = total
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage))
  const effectivePage = Math.min(page, totalPages)

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(totalRows / perPage))
    setPage(p => (p > tp ? tp : p))
  }, [totalRows, perPage])

  const fetchAllForExport = async (): Promise<Row[]> => {
    const params: Parameters<typeof inventoryService.listMovements>[0] = {
      page: 1,
      per_page: 10000,
    }
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.branch_id) params.branch_id = Number(filters.branch_id)
    if (filters.product_q.trim()) params.product_q = filters.product_q.trim()
    if (filters.movement_kind) params.movement_kind = filters.movement_kind
    if (filters.operation_type_id) params.operation_type_id = Number(filters.operation_type_id)
    if (filters.sunat_code.trim()) params.sunat_code = filters.sunat_code.trim()
    if (filters.ref_notes_q.trim()) params.q = filters.ref_notes_q.trim()
    const { data: list } = await inventoryService.listMovements(params)
    return Array.isArray(list) ? list : []
  }

  const exportPdf = async () => {
    try {
      const rows = await fetchAllForExport()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      exportTableToPdf<Row>('Reporte de kardex', COLS, rows, `reporte-kardex-${filters.date_from || 'todo'}-${filters.date_to || 'todo'}.pdf`)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const exportExcel = async () => {
    try {
      const rows = await fetchAllForExport()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      await exportTableToExcel<Row>('Kardex', COLS, rows, `reporte-kardex-${filters.date_from || 'todo'}-${filters.date_to || 'todo'}.xlsx`)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const displayCols = COLS

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
                placeholder="Buscar por nombre o código de producto"
                value={filters.product_q}
                onChange={e => setFilters(f => ({ ...f, product_q: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.branch_id}
              onChange={e =>
                setFilters(f => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : '' }))
              }
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo / origen</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.movement_kind}
              onChange={e => setFilters(f => ({ ...f, movement_kind: e.target.value }))}
            >
              {MOVEMENT_KIND_OPTIONS.map(o => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo operación</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.operation_type_id}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  operation_type_id: e.target.value ? Number(e.target.value) : '',
                }))
              }
            >
              <option value="">Todos</option>
              {operationTypes.map(o => (
                <option key={o.id} value={o.id}>
                  {o.sunat_code} — {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Código SUNAT</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.sunat_code}
              onChange={e => setFilters(f => ({ ...f, sunat_code: e.target.value }))}
            >
              <option value="">Todos</option>
              {[...new Set(operationTypes.map(o => o.sunat_code))].sort().map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Referencia o notas</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Filtrar por texto en referencia o notas del movimiento"
              value={filters.ref_notes_q}
              onChange={e => setFilters(f => ({ ...f, ref_notes_q: e.target.value }))}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Por defecto el período es el mes actual. Las fechas incluyen todo el día final (hasta 23:59).
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={totalRows === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={totalRows === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {displayCols.map(c => (
                    <th key={String(c.key)} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  data.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-gray-50">
                      {displayCols.map(col => {
                        const val = row[col.key as keyof Row]
                        const text = col.format ? col.format(val, row) : String(val ?? '')
                        return (
                          <td key={String(col.key)} className="px-4 py-2 align-top">
                            {text}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={displayCols.length} className="px-4 py-8 text-center text-gray-400">
                      No hay registros para los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalRows > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 py-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-600">
                  Mostrando {(effectivePage - 1) * perPage + 1}-{Math.min(effectivePage * perPage, totalRows)} de{' '}
                  {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
                  <select
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={perPage}
                    onChange={e => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    {PER_PAGE_OPTIONS.map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(effectivePage - 1)}
                  disabled={effectivePage <= 1}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {effectivePage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(effectivePage + 1)}
                  disabled={effectivePage >= totalPages}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
