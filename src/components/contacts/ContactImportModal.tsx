import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  downloadContactTemplate,
  importContacts,
  validateContactExcel,
  type ContactImportIssue,
  type ParsedContactRow,
} from '@/utils/contactImport'
import type { ContactBulkImportResult } from '@/services/contacts.service'

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
}

type Step = 'select' | 'validated' | 'importing' | 'done'

export function ContactImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedContactRow[]>([])
  const [errors, setErrors] = useState<ContactImportIssue[]>([])
  const [result, setResult] = useState<ContactBulkImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setStep('select')
    setFileName('')
    setRows([])
    setErrors([])
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    try {
      const res = await validateContactExcel(file)
      setRows(res.rows)
      setErrors(res.errors)
      setStep('validated')
    } catch {
      toast.error('No se pudo leer el archivo. ¿Es un Excel válido?')
      reset()
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (rows.length === 0) return
    setBusy(true)
    setStep('importing')
    try {
      const res = await importContacts(rows)
      setResult(res)
      setStep('done')
      if (res.created + res.updated > 0) onImported()
    } catch (e) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo importar',
      )
      setStep('validated')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} contentClassName="max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-800">Importar clientes desde Excel</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Si el número de documento ya existe, se actualizan sus datos en vez de duplicarlo.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {step === 'select' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void downloadContactTemplate()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} />
            Descargar plantilla
          </button>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 px-4 py-10 text-center hover:border-[rgb(var(--p400))] hover:bg-[rgb(var(--p50))]">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <FileSpreadsheet size={28} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {busy ? 'Leyendo archivo…' : 'Selecciona el archivo Excel'}
            </span>
            <span className="text-xs text-gray-400">Columnas obligatorias: nombre y numero_documento</span>
          </label>
        </div>
      )}

      {step === 'validated' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileSpreadsheet size={16} className="text-gray-400" />
            <span className="truncate">{fileName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-700">Filas válidas</p>
              <p className="text-2xl font-bold text-emerald-800">{rows.length}</p>
            </div>
            <div className={`rounded-xl border p-3 ${errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-medium ${errors.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                Filas con problemas
              </p>
              <p className={`text-2xl font-bold ${errors.length > 0 ? 'text-amber-800' : 'text-gray-400'}`}>
                {errors.length}
              </p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertTriangle size={14} />
                Estas filas se omitirán
              </p>
              <ul className="space-y-1 text-xs text-amber-900">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold">Fila {e.row}</span> · {e.message}
                  </li>
                ))}
                {errors.length > 50 && (
                  <li className="text-amber-700">…y {errors.length - 50} más</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Elegir otro archivo
            </button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={rows.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--p600))] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Upload size={16} />
              Importar {rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[rgb(var(--p500))] border-t-transparent" />
          <p className="text-sm text-gray-600">Importando…</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-800">Importación terminada</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Creados</p>
              <p className="text-xl font-bold text-emerald-800">{result.created}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs text-sky-700">Actualizados</p>
              <p className="text-xl font-bold text-sky-800">{result.updated}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Omitidos</p>
              <p className="text-xl font-bold text-gray-500">{result.failed?.length ?? 0}</p>
            </div>
          </div>

          {result.failed?.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
              <ul className="space-y-1">
                {result.failed.map((f, i) => (
                  <li key={i}>
                    <span className="font-semibold">Fila {f.row}</span>
                    {f.name ? ` · ${f.name}` : ''} · {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-xl bg-[rgb(var(--p600))] py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      )}
    </Modal>
  )
}
