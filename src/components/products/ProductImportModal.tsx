import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'
import {
  downloadCatalogProductTemplate,
  IGV_AFFECTATION_LABELS,
  importCatalogProducts,
  validateCatalogProductExcel,
  type IgvAffectationCode,
  type ImportValidationResult,
  type ParsedCatalogImportRow,
} from '@/utils/catalogProductImport'
import { formatExpiryDisplay } from '@/utils/productExpiry'

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
}

type Step = 'select' | 'validated' | 'importing' | 'done'

export function ProductImportModal({ open, onClose, onImported }: Props) {
  const { activeBranchId, activeBranch, allowedBranches, canSwitchBranch } = useBranch()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranchId)
  const [step, setStep] = useState<Step>('select')
  const [fileName, setFileName] = useState('')
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ImportValidationResult | null>(null)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current?: string }>({
    done: 0,
    total: 0,
  })
  const [importResult, setImportResult] = useState<{
    created: number
    updated: number
    stockRegistered: number
    failed: { row: number; name: string; error: string }[]
  } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const branchOptions = useMemo(() => {
    if (activeBranchId <= 0) return []
    if (!canSwitchBranch) {
      if (activeBranch) return [{ id: activeBranch.id, name: activeBranch.name }]
      return [{ id: activeBranchId, name: 'Sucursal actual' }]
    }
    if (allowedBranches.length > 0) return allowedBranches
    if (activeBranch) return [{ id: activeBranch.id, name: activeBranch.name }]
    return [{ id: activeBranchId, name: 'Sucursal actual' }]
  }, [canSwitchBranch, allowedBranches, activeBranchId, activeBranch])

  const selectedBranchName =
    branchOptions.find((b) => b.id === selectedBranchId)?.name ?? '—'

  useEffect(() => {
    if (!open) return
    setSelectedBranchId(activeBranchId)
  }, [open, activeBranchId])

  const reset = () => {
    setStep('select')
    setFileName('')
    setValidation(null)
    setImportProgress({ done: 0, total: 0 })
    setImportResult(null)
    setHelpOpen(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.match(/\.xlsx$/i)) {
      toast.error('Solo se admiten archivos .xlsx')
      return
    }
    setFileName(file.name)
    setValidating(true)
    setValidation(null)
    setImportResult(null)
    try {
      const result = await validateCatalogProductExcel(file)
      setValidation(result)
      setStep('validated')
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} error(es). Corrige el Excel antes de importar.`)
      } else if (result.rows.length === 0) {
        toast.error('No hay filas para importar')
      } else {
        toast.success(`${result.rows.length} fila(s) validadas`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el archivo')
      setStep('select')
    } finally {
      setValidating(false)
    }
  }

  const handleImport = async () => {
    if (!validation || validation.errors.length > 0 || validation.rows.length === 0) return
    if (selectedBranchId <= 0) {
      toast.error('Seleccione una sucursal destino para importar')
      return
    }
    setStep('importing')
    setImportProgress({ done: 0, total: validation.rows.length })
    try {
      const result = await importCatalogProducts(
        validation.rows,
        selectedBranchId,
        setImportProgress,
        validation.hasExpiryColumn,
      )
      setImportResult(result)
      setStep('done')
      if (result.created > 0 || result.updated > 0) {
        const parts: string[] = []
        if (result.created > 0) parts.push(`${result.created} creado(s)`)
        if (result.updated > 0) parts.push(`${result.updated} actualizado(s)`)
        const stockMsg = result.stockRegistered > 0 ? ` · ${result.stockRegistered} con stock en kardex` : ''
        toast.success(`${parts.join(', ')}${stockMsg}`)
        onImported()
      }
      if (result.failed.length > 0) toast.error(`${result.failed.length} fila(s) con error`)
    } catch {
      toast.error('Error durante la importación')
      setStep('validated')
    }
  }

  const canImport =
    validation != null &&
    validation.errors.length === 0 &&
    validation.rows.length > 0 &&
    selectedBranchId > 0 &&
    step === 'validated'
  const isImporting = step === 'importing'
  const importPct =
    importProgress.total > 0 ? Math.min(100, Math.round((importProgress.done / importProgress.total) * 100)) : 0

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-200 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-[rgb(var(--p600))] shrink-0" />
            <h3 className="font-bold text-gray-800 truncate">Importar productos (Excel)</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              disabled={isImporting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            >
              <AlertTriangle size={14} className="shrink-0" />
              Importante
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isImporting}
              className="p-2 rounded-lg hover:bg-gray-100 shrink-0 disabled:opacity-40"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="relative p-4 sm:p-5 overflow-y-auto min-h-0 space-y-4">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            disabled={isImporting}
            className="w-full flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100/80 disabled:opacity-40 transition-colors"
          >
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Importante</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Antes de importar, revise las reglas de columnas del Excel. Pulse aquí para ver las instrucciones.
              </p>
            </div>
          </button>

          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sucursal destino
            </label>
            {branchOptions.length === 0 ? (
              <p className="text-sm text-amber-800">
                No hay sucursal disponible. Seleccione una sucursal en el menú antes de importar.
              </p>
            ) : (
              <select
                value={selectedBranchId || ''}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                disabled={branchOptions.length <= 1 || isImporting}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            {validation && validation.rows.length > 0 && selectedBranchId > 0 && (
              <p className="text-sm text-gray-700">
                Se importarán <strong>{validation.rows.length}</strong> producto(s) a la sucursal{' '}
                <strong>{selectedBranchName}</strong>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadCatalogProductTemplate()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50"
            >
              <Download size={16} /> Descargar plantilla
            </button>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white hover:opacity-90 cursor-pointer">
              <Upload size={16} /> Elegir .xlsx
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
          </div>

          {fileName && <p className="text-xs text-gray-500">Archivo: <span className="font-medium">{fileName}</span></p>}

          {validating && (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--p600))]" />
              Validando…
            </div>
          )}

          {validation && !validating && step !== 'importing' && <ValidationSummary validation={validation} />}

          {step === 'done' && importResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm">
              <p className="font-medium text-emerald-800">
                {importResult.created > 0 && `${importResult.created} creado(s)`}
                {importResult.created > 0 && importResult.updated > 0 && ', '}
                {importResult.updated > 0 && `${importResult.updated} actualizado(s)`}
                {(importResult.created > 0 || importResult.updated > 0) && (
                  <>
                    {importResult.stockRegistered > 0 && `, ${importResult.stockRegistered} con stock (kardex)`}
                    {importResult.failed.length > 0 && `, ${importResult.failed.length} con error`}.
                  </>
                )}
              </p>
              {importResult.failed.length > 0 && (
                <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-red-700 space-y-1">
                  {importResult.failed.map((f) => (
                    <li key={`${f.row}-${f.name}`}>
                      Fila {f.row} ({f.name}): {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isImporting && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-[2px]"
              role="status"
              aria-busy="true"
            >
              <div className="w-full max-w-sm mx-4 text-center space-y-4 py-6">
                <Loader2 className="w-10 h-10 animate-spin text-[rgb(var(--p600))] mx-auto" />
                <p className="font-semibold text-gray-800">Importación masiva</p>
                <p className="text-sm text-gray-500">Enviando lotes al servidor (sin límite 300 req/min)…</p>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[rgb(var(--p600))] transition-all duration-300"
                    style={{ width: `${importPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  {importProgress.done} / {importProgress.total} ({importPct}%)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 sm:px-5 py-3 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl text-sm border border-gray-200 disabled:opacity-40"
          >
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          {step === 'validated' && (
            <button
              type="button"
              disabled={!canImport}
              onClick={() => void handleImport()}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white disabled:opacity-40"
            >
              Importar {validation?.rows.length ?? 0} producto(s)
            </button>
          )}
        </div>
      </div>
    </div>

    {helpOpen ? (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-import-help-title"
        onClick={() => setHelpOpen(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-amber-100 bg-amber-50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <h3 id="product-import-help-title" className="font-bold text-amber-950 truncate">
                Importante — instrucciones de importación
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="p-2 rounded-lg hover:bg-amber-100 shrink-0"
              aria-label="Cerrar instrucciones"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4 sm:p-5 overflow-y-auto min-h-0 text-sm text-gray-700 space-y-3">
            <p>
              Catálogo general: por defecto los productos <strong>no</strong> son de restaurante.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>es_restaurante</strong>: use <em>si</em> o <em>no</em>.
              </li>
              <li>
                <strong>area_preparacion</strong>: opcional; solo aplica si marca el producto como
                restaurante.
              </li>
              <li>
                <strong>precio_compra</strong> (costo): opcional. Si la celda va vacía se acepta igual
                (producto nuevo en 0; si actualiza por código, conserva el costo actual).
              </li>
              <li>
                <strong>afectacion_igv</strong> (SUNAT, opcional; vacío = 10): solo estos códigos:
                <ul className="list-disc pl-5 mt-1.5 space-y-0.5 text-gray-600">
                  <li>
                    <strong>10</strong> — gravado
                  </li>
                  <li>
                    <strong>20</strong> — exonerado
                  </li>
                  <li>
                    <strong>30</strong> — inafecto
                  </li>
                  <li>
                    <strong>40</strong> — exportación
                  </li>
                </ul>
              </li>
              <li>
                <strong>fecha_vencimiento</strong> (opcional): formato <em>YYYY-MM-DD</em> o{' '}
                <em>DD/MM/YYYY</em>. Si la celda va vacía, el producto quedará sin fecha de vencimiento.
                Si la columna no está en el Excel, no se modifica el vencimiento de productos existentes.
              </li>
              <li>
                <strong>stock_inicial</strong>: solo aplica si <strong>control_stock</strong> es{' '}
                <em>si</em>; el kardex se registra en la sucursal seleccionada.
              </li>
            </ul>
          </div>
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 shrink-0 flex justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-600 text-white hover:bg-amber-700"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>,
    document.body,
  )
}

function ValidationSummary({ validation }: { validation: ImportValidationResult }) {
  const ok = validation.errors.length === 0 && validation.rows.length > 0
  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <p>
          {ok ? (
            <>
              <strong>{validation.totalRows}</strong> fila(s) listas. Importación en uno o pocos envíos al servidor.
            </>
          ) : (
            <>
              <strong>{validation.errors.length}</strong> error(es). Corrige el Excel.
            </>
          )}
        </p>
      </div>
      {validation.errors.length > 0 && (
        <ul className="text-xs text-red-700 max-h-36 overflow-y-auto border border-red-100 rounded-xl p-2 space-y-1">
          {validation.errors.slice(0, 40).map((e, i) => (
            <li key={i}>
              Fila {e.row} · {String(e.field)}: {e.message}
            </li>
          ))}
        </ul>
      )}
      {validation.rows.length > 0 && (
        <PreviewTable
          rows={validation.rows.slice(0, 12)}
          total={validation.rows.length}
          showExpiry={validation.hasExpiryColumn}
        />
      )}
    </div>
  )
}

function PreviewTable({
  rows,
  total,
  showExpiry,
}: {
  rows: ParsedCatalogImportRow[]
  total: number
  showExpiry: boolean
}) {
  const headers = ['#', 'Nombre', 'P. venta', 'P. compra', 'Afect. IGV', 'Rest.', 'Control stock', 'Stock']
  if (showExpiry) headers.push('Vencimiento')
  return (
    <>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowNumber} className="border-t border-gray-100">
                <td className="px-2 py-1.5">{r.rowNumber}</td>
                <td className="px-2 py-1.5">{r.nombre}</td>
                <td className="px-2 py-1.5">{r.precio_venta.toFixed(2)}</td>
                <td className="px-2 py-1.5">
                  {r.precio_compra != null ? r.precio_compra.toFixed(2) : '—'}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {r.afectacion_igv}{' '}
                  <span className="text-gray-400">
                    ({IGV_AFFECTATION_LABELS[r.afectacion_igv as IgvAffectationCode] ?? r.afectacion_igv})
                  </span>
                </td>
                <td className="px-2 py-1.5">{r.es_restaurante ? 'sí' : 'no'}</td>
                <td className="px-2 py-1.5">{r.control_stock ? 'sí' : 'no'}</td>
                <td className="px-2 py-1.5">{r.stock_inicial > 0 ? r.stock_inicial : '—'}</td>
                {showExpiry && (
                  <td className="px-2 py-1.5">
                    {r.fecha_vencimiento ? formatExpiryDisplay(r.fecha_vencimiento) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 12 && <p className="text-xs text-gray-500">Vista previa: 12 de {total} filas.</p>}
    </>
  )
}
