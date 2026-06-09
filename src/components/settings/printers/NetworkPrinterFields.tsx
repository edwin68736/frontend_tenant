import type { PrinterConfig } from '@/services/printers.service'

type Props = {
  cfg: PrinterConfig
  onChange: (patch: Partial<PrinterConfig>) => void
}

export function NetworkPrinterFields({ cfg, onChange }: Props) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-900">Impresión por red (TCP/IP)</p>
        <p className="text-xs text-stone-500 mt-0.5">IP de la ticketera en tu red local. Puerto habitual: 9100.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-stone-600 mb-1">Nombre (opcional)</label>
          <input
            type="text"
            value={cfg.networkPrinterLabel ?? ''}
            onChange={(e) => onChange({ networkPrinterLabel: e.target.value })}
            placeholder="Ej. Ticketera cocina"
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Dirección IP o host</label>
          <input
            type="text"
            value={cfg.tcpHost}
            onChange={(e) => onChange({ tcpHost: e.target.value })}
            placeholder="192.168.1.50"
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Puerto TCP</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={cfg.tcpPort || 9100}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              onChange({ tcpPort: Number.isFinite(n) ? n : 9100 })
            }}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>
    </div>
  )
}
