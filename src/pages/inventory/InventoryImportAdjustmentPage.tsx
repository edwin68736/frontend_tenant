import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Upload,
} from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { useBranch } from '@/contexts/BranchContext'
import { companyService } from '@/services/company.service'
import {
  inventoryService,
  type ImportAdjustmentConfirmResult,
  type ImportAdjustmentPreviewResult,
  type ImportAdjustmentPreviewSummary,
  type ImportAdjustmentRowPayload,
} from '@/services/inventory.service'
import {
  downloadAdjustmentImportTemplate,
  exportImportErrorsExcel,
  parseAdjustmentImportExcel,
  type ParsedAdjustmentImportRow,
} from '@/utils/inventoryAdjustmentImport'

interface BranchOption {
  id: number
  name: string
}

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || 'Error en la operación'
}

function statusClass(status: string): string {
  switch (status) {
    case 'Actualizar':
      return 'bg-green-100 text-green-700'
    case 'Error':
      return 'bg-red-100 text-red-700'
    case 'Sin cambios':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return String(delta)
  return '0'
}

function stockFinalDisplay(row: { status: string; new_stock: number; product_id?: number }): string {
  if (row.status === 'Error' && !row.product_id) return '—'
  return String(row.new_stock)
}

function productsUpdated(summary: ImportAdjustmentPreviewSummary): number {
  return summary.valid_in_rows + summary.valid_out_rows
}

function SummaryLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-6 text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-800 tabular-nums shrink-0">{value}</span>
    </div>
  )
}

function ImportAdjustmentContent() {
  const navigate = useNavigate()
  const { activeBranchId } = useBranch()
  const fileRef = useRef<HTMLInputElement>(null)

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState<number>(0)
  const [movementReason, setMovementReason] = useState('Conteo físico de inventario')
  const [notes, setNotes] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedAdjustmentImportRow[]>([])
  const [preview, setPreview] = useState<ImportAdjustmentPreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [exportingErrors, setExportingErrors] = useState(false)
  const [fileName, setFileName] = useState('')
  const [successResult, setSuccessResult] = useState<ImportAdjustmentConfirmResult | null>(null)

  useEffect(() => {
    companyService
      .listBranches()
      .then(list => {
        setBranches(list)
        setBranchId(activeBranchId || list[0]?.id || 0)
      })
      .catch(() => toast.error('No se pudieron cargar las sucursales'))
  }, [activeBranchId])

  const buildPayloadRows = useCallback((): ImportAdjustmentRowPayload[] => {
    return parsedRows.map(r => ({
      row_number: r.rowNumber,
      barcode: r.barcode,
      new_stock: r.newStock,
    }))
  }, [parsedRows])

  const runPreview = useCallback(
    async (rows: ParsedAdjustmentImportRow[]) => {
      if (!branchId) {
        toast.error('Seleccione una sucursal')
        return
      }
      setLoadingPreview(true)
      try {
        const result = await inventoryService.previewImportAdjustment({
          branch_id: branchId,
          rows: rows.map(r => ({
            row_number: r.rowNumber,
            barcode: r.barcode,
            new_stock: r.newStock,
          })),
        })
        setPreview(result)
      } catch (err) {
        toast.error(extractApiError(err))
        setPreview(null)
      } finally {
        setLoadingPreview(false)
      }
    },
    [branchId]
  )

  const handleFile = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    setSuccessResult(null)
    try {
      const { rows, errors } = await parseAdjustmentImportExcel(file)
      if (errors.length > 0) {
        toast.error(errors[0]?.message || 'Error al leer el Excel')
        if (rows.length === 0) {
          setParsedRows([])
          return
        }
      }
      setParsedRows(rows)
      await runPreview(rows)
    } catch {
      toast.error('No se pudo leer el archivo Excel')
    }
  }

  const refreshPreview = () => {
    if (parsedRows.length === 0) {
      toast.error('Cargue un archivo Excel primero')
      return
    }
    void runPreview(parsedRows)
  }

  const errorRows = useMemo(
    () => preview?.rows.filter(r => r.status === 'Error') ?? [],
    [preview]
  )

  const handleExportErrors = async () => {
    if (errorRows.length === 0) return
    setExportingErrors(true)
    try {
      await exportImportErrorsExcel(
        errorRows.map(r => ({
          row_number: r.row_number,
          barcode: r.barcode,
          error: r.error || 'Error desconocido',
        }))
      )
      toast.success('Errores exportados')
    } catch {
      toast.error('No se pudo exportar el archivo')
    } finally {
      setExportingErrors(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview?.can_confirm || !branchId) return
    setConfirming(true)
    try {
      const result = await inventoryService.confirmImportAdjustment({
        branch_id: branchId,
        movement_reason: movementReason.trim() || undefined,
        notes: notes.trim() || undefined,
        rows: buildPayloadRows(),
      })
      setSuccessResult(result)
      setPreview(null)
      setParsedRows([])
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      toast.error(extractApiError(err))
    } finally {
      setConfirming(false)
    }
  }

  const openDocument = (direction: 'IN' | 'OUT', docId?: number) => {
    if (!docId) return
    setSuccessResult(null)
    const base = direction === 'IN' ? '/inventory/ingress' : '/inventory/egress'
    navigate(base, { state: { openDocumentId: docId } })
  }

  const goToKardex = () => {
    setSuccessResult(null)
    navigate('/inventory/kardex')
  }

  const summary = preview?.summary
  const updatedCount = successResult ? productsUpdated(successResult.summary) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/inventory" className="p-2 hover:bg-gray-100 rounded-xl text-gray-600" title="Volver">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Importar Conteo Físico</h2>
          <p className="text-sm text-gray-500 max-w-3xl">
            Importe el resultado del conteo físico de su almacén. El sistema calculará automáticamente las
            diferencias entre el stock actual y el stock contado, generando los documentos de ingreso y/o egreso
            necesarios para mantener la trazabilidad del inventario.
          </p>
        </div>
      </div>

      <div className="bg-[rgb(var(--p50))] border border-[rgb(var(--p100))] rounded-2xl p-4">
        <div className="flex gap-3">
          <HelpCircle size={18} className="text-[rgb(var(--p600))] shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 space-y-2">
            <p className="font-semibold text-gray-800">¿Cómo funciona?</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Descargue la plantilla.</li>
              <li>Registre únicamente el código de barras y el stock contado.</li>
              <li>Importe el archivo.</li>
              <li>Revise la vista previa.</li>
              <li>Confirme para aplicar el conteo.</li>
            </ol>
            <p className="text-xs text-gray-500 pt-1">
              El sistema calculará automáticamente los ajustes necesarios sin modificar directamente el stock.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-52">
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={branchId || ''}
              onChange={e => setBranchId(Number(e.target.value))}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void downloadAdjustmentImportTemplate()}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            <Download size={15} /> Descargar plantilla
          </button>
          <label className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
            <Upload size={15} /> Subir Excel
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => void handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileName && (
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <FileSpreadsheet size={14} /> {fileName}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Motivo del movimiento</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movementReason}
              onChange={e => setMovementReason(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {parsedRows.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={refreshPreview}
              disabled={loadingPreview}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingPreview ? 'Calculando…' : 'Actualizar vista previa'}
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Productos leídos', value: summary.total_rows, sub: 'filas del archivo' },
            {
              label: 'Productos actualizados',
              value: productsUpdated(summary),
              sub: `${summary.valid_in_rows} ing. · ${summary.valid_out_rows} egr.`,
            },
            { label: 'Sin cambios', value: summary.skipped_rows, sub: 'stock igual al sistema' },
            {
              label: 'Con error',
              value: summary.error_rows,
              sub: summary.error_rows ? 'Corrija antes de confirmar' : 'Listo',
            },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-800">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {loadingPreview && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {preview && !loadingPreview && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  {[
                    '#',
                    'Producto',
                    'Stock actual',
                    'Stock contado',
                    'Diferencia',
                    'Stock final',
                    'Costo unit.',
                    'Impacto',
                    'Estado',
                  ].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(row => (
                  <tr key={row.row_number} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-500">{row.row_number}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{row.product_name || row.barcode}</p>
                      {row.product_code && (
                        <p className="text-[10px] text-gray-400 font-mono">{row.product_code}</p>
                      )}
                      {row.error && <p className="text-xs text-red-600 mt-0.5">{row.error}</p>}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === 'Error' && !row.product_id ? '—' : row.current_stock}
                    </td>
                    <td className="px-3 py-2">{row.new_stock}</td>
                    <td className="px-3 py-2 font-medium">
                      {row.status === 'Error' && !row.product_id ? '—' : formatDelta(row.delta)}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">{stockFinalDisplay(row)}</td>
                    <td className="px-3 py-2">
                      {row.status === 'Actualizar' ? `S/ ${Number(row.unit_cost).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.status === 'Actualizar' ? `S/ ${Number(row.line_total).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 justify-between p-4 border-t border-gray-100">
            <div>
              {errorRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleExportErrors()}
                  disabled={exportingErrors}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-700 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  <Download size={15} />
                  {exportingErrors ? 'Exportando…' : 'Exportar errores'}
                </button>
              )}
            </div>
            <button
              type="button"
              disabled={!preview.can_confirm || confirming}
              onClick={() => void handleConfirm()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle size={15} />
              {confirming ? 'Procesando…' : 'Confirmar conteo'}
            </button>
          </div>
        </div>
      )}

      {successResult && (
        <Modal open onClose={() => setSuccessResult(null)} contentClassName="max-w-lg">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Conteo físico aplicado correctamente</h3>
              <p className="text-sm text-gray-600 mt-2">
                Se actualizaron <strong>{updatedCount}</strong> productos. Se generaron automáticamente los
                documentos de inventario correspondientes.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Puede revisar el detalle desde los módulos Ingresos y Egresos o desde el Kardex.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-0.5">
              <SummaryLine label="Productos leídos" value={successResult.summary.total_rows} />
              <SummaryLine label="Productos actualizados" value={updatedCount} />
              <SummaryLine label="Productos sin cambios" value={successResult.summary.skipped_rows} />
              <SummaryLine label="Productos con error" value={successResult.summary.error_rows} />
              <SummaryLine label="Ingresos" value={successResult.summary.valid_in_rows} />
              <SummaryLine label="Egresos" value={successResult.summary.valid_out_rows} />
              {successResult.in_document_number && (
                <SummaryLine label="Documento ingreso" value={successResult.in_document_number} />
              )}
              {successResult.out_document_number && (
                <SummaryLine label="Documento egreso" value={successResult.out_document_number} />
              )}
            </div>

            <p className="text-xs text-gray-400 font-mono">Ref. {successResult.import_reference}</p>

            <div className="flex flex-col gap-2">
              {successResult.in_document_id && (
                <button
                  type="button"
                  onClick={() => openDocument('IN', successResult.in_document_id)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-left hover:bg-gray-50"
                >
                  Ver Documento de Ingreso
                  <span className="block text-xs font-mono text-gray-500 mt-0.5">
                    {successResult.in_document_number}
                  </span>
                </button>
              )}
              {successResult.out_document_id && (
                <button
                  type="button"
                  onClick={() => openDocument('OUT', successResult.out_document_id)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-left hover:bg-gray-50"
                >
                  Ver Documento de Egreso
                  <span className="block text-xs font-mono text-gray-500 mt-0.5">
                    {successResult.out_document_number}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={goToKardex}
                className="w-full px-4 py-2.5 border border-[rgb(var(--p200))] text-[rgb(var(--p700))] rounded-xl text-sm font-medium hover:bg-[rgb(var(--p50))]"
              >
                Ir al Kardex
              </button>
              <button
                type="button"
                onClick={() => setSuccessResult(null)}
                className="w-full px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function InventoryImportAdjustmentPage() {
  return (
    <RequireModule moduleKey="inventory">
      <ImportAdjustmentContent />
    </RequireModule>
  )
}
