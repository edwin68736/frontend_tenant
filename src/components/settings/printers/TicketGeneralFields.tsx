import { SearchableSelect, type SearchableSelectOption } from '@/components/SearchableSelect'
import type { PrinterConfig } from '@/services/printers.service'

type Props = {
  cfg: PrinterConfig
  paperOptions: SearchableSelectOption[]
  onChange: (patch: Partial<PrinterConfig>) => void
  showAutoPrint?: boolean
}

export function TicketGeneralFields({ cfg, paperOptions, onChange, showAutoPrint = true }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-900">Ticket</p>
        <p className="text-xs text-stone-500 mt-0.5">
          {showAutoPrint
            ? 'Ancho de papel e impresión automática. El diseño del comprobante no cambia.'
            : 'Ancho de papel para esta área.'}
        </p>
      </div>
      <div className={`grid grid-cols-1 ${showAutoPrint ? 'sm:grid-cols-2' : ''} gap-3 items-end`}>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Tamaño de ticket</label>
          <SearchableSelect
            value={cfg.paperWidthMm}
            onChange={(v) => onChange({ paperWidthMm: Number(v) === 58 ? 58 : 80 })}
            options={paperOptions}
            searchable={false}
          />
        </div>
        {showAutoPrint && (
          <label className="inline-flex items-center gap-2 text-sm text-stone-700 select-none pb-2">
            <input
              type="checkbox"
              checked={Boolean(cfg.autoPrint)}
              onChange={(e) => onChange({ autoPrint: e.target.checked })}
              className="h-4 w-4 accent-primary-600"
            />
            Impresión automática
          </label>
        )}
      </div>
    </div>
  )
}
