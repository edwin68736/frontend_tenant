import type { PrinterConfig } from '@/services/printers.service'
import { availableConnectionModes, defaultConnectionForPlatform, isPrinterConfigReady } from '@/services/printers.service'
import type { SearchableSelectOption } from '@/components/SearchableSelect'
import { ConnectionMethodPicker } from './ConnectionMethodPicker'
import { NetworkPrinterFields } from './NetworkPrinterFields'
import { WindowsPrinterFields } from './WindowsPrinterFields'
import { BluetoothPrinterFields } from './BluetoothPrinterFields'
import { TicketGeneralFields } from './TicketGeneralFields'

type Props = {
  cfg: PrinterConfig
  printerOptions: SearchableSelectOption[]
  paperOptions: SearchableSelectOption[]
  loadingPrinters: boolean
  onRefreshPrinters: () => void
  onChange: (patch: Partial<PrinterConfig>) => void
  showAutoPrint?: boolean
  compact?: boolean
}

export function PrinterConfigEditor({
  cfg,
  printerOptions,
  paperOptions,
  loadingPrinters,
  onRefreshPrinters,
  onChange,
  showAutoPrint = true,
  compact = false,
}: Props) {
  const modes = availableConnectionModes()
  const safeConnection = modes.includes(cfg.connection) ? cfg.connection : defaultConnectionForPlatform()
  const ready = isPrinterConfigReady({ ...cfg, connection: safeConnection })

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <ConnectionMethodPicker modes={modes} value={safeConnection} onChange={(c) => onChange({ connection: c })} />

      {safeConnection === 'windows' && (
        <WindowsPrinterFields
          cfg={cfg}
          printerOptions={printerOptions}
          loadingPrinters={loadingPrinters}
          onRefreshPrinters={onRefreshPrinters}
          onChange={onChange}
        />
      )}
      {safeConnection === 'network' && <NetworkPrinterFields cfg={cfg} onChange={onChange} />}
      {safeConnection === 'bluetooth' && <BluetoothPrinterFields cfg={cfg} onChange={onChange} />}

      <TicketGeneralFields
        cfg={cfg}
        paperOptions={paperOptions}
        onChange={onChange}
        showAutoPrint={showAutoPrint}
      />

      {!ready && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Completa los datos de conexión para poder imprimir con esta configuración.
        </p>
      )}
    </div>
  )
}
