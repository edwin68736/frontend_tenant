import { clsx } from 'clsx'
import { Bluetooth, Monitor, Wifi } from 'lucide-react'
import type { PrinterConnectionMode } from '@/services/printers.service'
import { connectionModeLabel } from '@/services/printers.service'

const ICONS: Record<PrinterConnectionMode, typeof Monitor> = {
  windows: Monitor,
  network: Wifi,
  bluetooth: Bluetooth,
}

type Props = {
  modes: PrinterConnectionMode[]
  value: PrinterConnectionMode
  onChange: (mode: PrinterConnectionMode) => void
}

export function ConnectionMethodPicker({ modes, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-stone-600">Método de conexión</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {modes.map((mode) => {
          const Icon = ICONS[mode]
          const active = value === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className={clsx(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-900 ring-1 ring-primary-500'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
              )}
            >
              <Icon size={18} className={active ? 'text-primary-600' : 'text-stone-400'} />
              <span className="font-semibold">{connectionModeLabel(mode)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
