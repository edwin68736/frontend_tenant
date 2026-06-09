import { RefreshCw } from 'lucide-react'
import { SearchableSelect, type SearchableSelectOption } from '@/components/SearchableSelect'
import type { PrinterConfig } from '@/services/printers.service'

type Props = {
  cfg: PrinterConfig
  printerOptions: SearchableSelectOption[]
  loadingPrinters: boolean
  onRefreshPrinters: () => void
  onChange: (patch: Partial<PrinterConfig>) => void
}

export function WindowsPrinterFields({
  cfg,
  printerOptions,
  loadingPrinters,
  onRefreshPrinters,
  onChange,
}: Props) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900">Impresora en este equipo</p>
          <p className="text-xs text-stone-500 mt-0.5">Ticketera instalada en Windows (impresión RAW).</p>
        </div>
        <button
          type="button"
          onClick={onRefreshPrinters}
          disabled={loadingPrinters}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={14} className={loadingPrinters ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Impresora Windows</label>
        <SearchableSelect
          value={cfg.printerName || ''}
          onChange={(v) => onChange({ printerName: v == null ? '' : String(v) })}
          options={printerOptions}
          placeholder="Selecciona una impresora"
          allowClear
        />
      </div>
    </div>
  )
}
