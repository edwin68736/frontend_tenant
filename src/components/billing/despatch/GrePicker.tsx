import { useEffect, useState } from 'react'
import { FileText, Search, X } from 'lucide-react'
import { billingService, type SunatDespatch } from '@/services/billing.service'
import { inputCls } from './ui'

/** Buscador de guías de remisión remitente emitidas desde este sistema (origen de una guía transportista). */
export function GrePicker({ selectedLabel, onPick, onClear }: { selectedLabel: string; onPick: (number: string) => void; onClear: () => void }) {
  const [rows, setRows] = useState<SunatDespatch[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    billingService
      .listDespatches()
      .then(({ despatches }) => setRows((despatches ?? []).filter((d) => d.guia_sunat_code === '09')))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true))
  }, [open, loaded])

  if (selectedLabel) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))] px-3 py-2 text-sm text-[rgb(var(--p800))]">
        <FileText size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Guía remitente <strong className="font-mono">{selectedLabel}</strong>
        </span>
        <button type="button" onClick={onClear} className="text-xs inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <X size={13} /> Cambiar
        </button>
      </div>
    )
  }

  const term = q.trim().toLowerCase()
  const filtered = rows
    .filter((d) => !term || `${d.series}-${d.correlative}`.toLowerCase().includes(term) || (d.destinatario_razon ?? '').toLowerCase().includes(term))
    .slice(0, 10)

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        className={`${inputCls} pl-9`}
        value={q}
        placeholder="Buscar guía remitente por número o destinatario"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        aria-label="Buscar guía remitente"
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
          {loaded && filtered.length === 0 && <li className="px-3 py-3 text-xs text-gray-500">No hay guías remitente emitidas desde este sistema que coincidan.</li>}
          {filtered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false)
                  setQ('')
                  onPick(`${d.series}-${d.correlative}`)
                }}
              >
                <span className="block text-sm font-mono text-gray-900">
                  {d.series}-{String(d.correlative).padStart(8, '0')}
                </span>
                <span className="block text-[11px] text-gray-500 truncate">{d.destinatario_razon || 'Sin destinatario'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
