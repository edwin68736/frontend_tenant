import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Download, Loader2, Tag, Upload, X } from 'lucide-react'
import { productsService, type BulkPriceUpdateResult } from '@/services/products.service'
import {
  exportPriceUpdateList,
  parsePriceUpdateExcel,
  type ParsedPriceUpdateRow,
} from '@/utils/productPriceUpdateImport'

type Props = {
  open: boolean
  onClose: () => void
  /** La sucursal cuyo catálogo se descarga. Solo lectura: el match al actualizar es por código, no por sucursal. */
  branchId: number
  branchName?: string
  onUpdated: () => void
}

type Step = 'select' | 'validated' | 'applying' | 'done'

export function ProductPriceUpdateModal({ open, onClose, branchId, branchName, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [downloading, setDownloading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<ParsedPriceUpdateRow[]>([])
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([])
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<BulkPriceUpdateResult | null>(null)

  const reset = () => {
    setStep('select')
    setFileName('')
    setRows([])
    setParseErrors([])
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleDownload = async () => {
    if (branchId <= 0) {
      toast.error('Seleccione una sucursal antes de descargar la lista')
      return
    }
    setDownloading(true)
    try {
      const all: { code: string; name: string; sale_price: number; purchase_price?: number }[] = []
      let p = 1
      const per = 200
      for (;;) {
        const { data, total } = await productsService.list('', undefined, undefined, true, p, per, undefined, 'product', branchId, true)
        if (!data || data.length === 0) break
        all.push(...data.map((it) => ({ code: it.code ?? '', name: it.name, sale_price: it.sale_price, purchase_price: it.purchase_price })))
        if (all.length >= (total ?? 0)) break
        p++
      }
      if (all.length === 0) {
        toast.error('No hay productos en esta sucursal')
        return
      }
      await exportPriceUpdateList(all, 'actualizar-precios.xlsx')
      toast.success(`${all.length} producto(s) exportado(s)`)
    } catch {
      toast.error('Error al descargar la lista')
    } finally {
      setDownloading(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.match(/\.xlsx$/i)) {
      toast.error('Solo se admiten archivos .xlsx')
      return
    }
    setFileName(file.name)
    setParsing(true)
    setResult(null)
    try {
      const parsed = await parsePriceUpdateExcel(file)
      setRows(parsed.rows)
      setParseErrors(parsed.errors)
      setStep('validated')
      if (parsed.errors.length > 0) {
        toast.warning(`${parsed.errors.length} fila(s) con error. Corrige el Excel antes de actualizar.`)
      } else {
        toast.success(`${parsed.rows.length} fila(s) listas`)
      }
    } catch {
      toast.error('No se pudo leer el archivo Excel')
      setStep('select')
    } finally {
      setParsing(false)
    }
  }

  const handleApply = async () => {
    if (rows.length === 0 || parseErrors.length > 0 || branchId <= 0) return
    setStep('applying')
    setApplying(true)
    try {
      const res = await productsService.bulkUpdatePrices(
        branchId,
        rows.map((r) => ({
          row_number: r.rowNumber,
          code: r.code,
          sale_price: r.salePrice ?? undefined,
          purchase_price: r.purchasePrice ?? undefined,
        })),
      )
      setResult(res)
      setStep('done')
      if (res.updated > 0) {
        toast.success(`${res.updated} precio(s) actualizado(s)`)
        onUpdated()
      }
      if (res.errors > 0) toast.error(`${res.errors} fila(s) con error`)
    } catch {
      toast.error('Error al actualizar los precios')
      setStep('validated')
    } finally {
      setApplying(false)
    }
  }

  const canApply = rows.length > 0 && parseErrors.length === 0 && step === 'validated' && branchId > 0
  const isApplying = step === 'applying'

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-200 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-5 h-5 text-[rgb(var(--p600))] shrink-0" />
            <h3 className="font-bold text-gray-800 truncate">Actualizar precio (Excel)</h3>
          </div>
          <button type="button" onClick={handleClose} disabled={isApplying} className="p-2 rounded-lg hover:bg-gray-100 shrink-0 disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto min-h-0 space-y-4">
          <p className="text-sm text-gray-600">
            1) Descargue la lista de productos de <strong>{branchName || 'la sucursal activa'}</strong> con su código,
            precio de venta y precio de compra. 2) Edite los precios en el Excel. 3) Vuelva a subirlo aquí — cada fila
            se aplica según el <strong>código de barras</strong>, sin importar el orden ni si agrega/quita columnas de más.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading || branchId <= 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Descargar lista de precios
            </button>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white hover:opacity-90 cursor-pointer">
              <Upload size={16} /> Subir Excel editado
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
            </label>
          </div>

          {fileName && <p className="text-xs text-gray-500">Archivo: <span className="font-medium">{fileName}</span></p>}

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--p600))]" />
              Leyendo Excel…
            </div>
          )}

          {step === 'validated' && !parsing && (
            <ValidationSummary rows={rows} errors={parseErrors} />
          )}

          {step === 'done' && result && (
            <div className="space-y-2">
              <div className={`rounded-xl border p-3 text-sm ${result.errors === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <strong>{result.updated}</strong> precio(s) actualizado(s)
                {result.errors > 0 && <>, <strong>{result.errors}</strong> con error</>}.
              </div>
              {result.errors > 0 && (
                <ul className="text-xs text-red-700 max-h-40 overflow-y-auto border border-red-100 rounded-xl p-2 space-y-1">
                  {result.rows.filter((r) => r.status === 'error').map((r) => (
                    <li key={r.row_number}>
                      Fila {r.row_number} ({r.code || 'sin código'}): {r.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 sm:px-5 py-3 border-t border-gray-200 shrink-0">
          <button type="button" onClick={handleClose} disabled={isApplying} className="px-4 py-2 rounded-xl text-sm border border-gray-200 disabled:opacity-40">
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          {step === 'validated' && (
            <button
              type="button"
              disabled={!canApply}
              onClick={() => void handleApply()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white disabled:opacity-40"
            >
              {isApplying ? <Loader2 size={15} className="animate-spin" /> : null}
              Actualizar {rows.length} precio(s)
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ValidationSummary({ rows, errors }: { rows: ParsedPriceUpdateRow[]; errors: { row: number; message: string }[] }) {
  const ok = errors.length === 0 && rows.length > 0
  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <p>
          {ok ? (
            <><strong>{rows.length}</strong> fila(s) listas para actualizar.</>
          ) : (
            <><strong>{errors.length}</strong> error(es). Corrige el Excel antes de actualizar.</>
          )}
        </p>
      </div>
      {errors.length > 0 && (
        <ul className="text-xs text-red-700 max-h-36 overflow-y-auto border border-red-100 rounded-xl p-2 space-y-1">
          {errors.slice(0, 40).map((e, i) => (
            <li key={i}>Fila {e.row}: {e.message}</li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Código', 'P. venta', 'P. compra'].map((h) => (
                  <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.rowNumber} className="border-t border-gray-100">
                  <td className="px-2 py-1.5">{r.rowNumber}</td>
                  <td className="px-2 py-1.5 font-mono">{r.code}</td>
                  <td className="px-2 py-1.5">{r.salePrice != null ? r.salePrice.toFixed(2) : '—'}</td>
                  <td className="px-2 py-1.5">{r.purchasePrice != null ? r.purchasePrice.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && <p className="text-xs text-gray-500 px-2 py-1.5">Vista previa: 12 de {rows.length} filas.</p>}
        </div>
      )}
    </div>
  )
}
