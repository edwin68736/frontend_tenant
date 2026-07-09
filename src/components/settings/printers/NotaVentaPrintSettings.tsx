import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import {
  loadNotaVentaPrintLayoutSettings,
  NOTA_VENTA_PRINT_LAYOUT_OPTIONS,
  saveNotaVentaPrintLayoutSettings,
  type NotaVentaPrintLayoutSettings,
} from '@/services/printers/notaVentaPrintLayout'

export function NotaVentaPrintSettings() {
  const [expanded, setExpanded] = useState(true)
  const [settings, setSettings] = useState<NotaVentaPrintLayoutSettings>(() =>
    loadNotaVentaPrintLayoutSettings(),
  )

  useEffect(() => {
    saveNotaVentaPrintLayoutSettings(settings)
  }, [settings])

  const patch = (key: keyof NotaVentaPrintLayoutSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-5 border-b border-stone-100">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900">Ajuste de nota de venta</h2>
            <p className="text-xs text-stone-500 mt-1">
              Controla qué bloques se muestran solo al imprimir una nota de venta. Por defecto se
              imprime todo. No aplica a boletas ni facturas electrónicas.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Se guarda en este dispositivo; no se sincroniza con el servidor.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
        >
          {expanded ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {expanded && (
        <ul className="divide-y divide-stone-100">
          {NOTA_VENTA_PRINT_LAYOUT_OPTIONS.map((opt) => (
            <li key={opt.key}>
              <label className="flex items-center justify-between gap-4 px-5 py-3.5 cursor-pointer hover:bg-stone-50/80">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-800">{opt.label}</span>
                  {opt.hint ? (
                    <span className="block text-xs text-stone-500 mt-0.5">{opt.hint}</span>
                  ) : null}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(settings[opt.key])}
                  onChange={(e) => patch(opt.key, e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-primary-600"
                  aria-label={opt.label}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
