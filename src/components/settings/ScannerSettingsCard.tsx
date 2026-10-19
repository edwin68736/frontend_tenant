import { Camera, Keyboard, ScanBarcode } from 'lucide-react'
import { clsx } from 'clsx'
import { isCapacitorNative } from '@/lib/platform/detect'
import {
  setScannerModePreference,
  useScannerModePreference,
  type ScannerMode,
} from '@/lib/scanner/scannerMode'

const OPTIONS: { id: ScannerMode; label: string; hint: string; icon: typeof Camera }[] = [
  { id: 'camera', label: 'Cámara', hint: 'Apunta la cámara del equipo al código de barras.', icon: Camera },
  {
    id: 'reader',
    label: 'Lector físico',
    hint: 'Pistola Bluetooth o USB/OTG. No se abre la cámara ni se pide su permiso.',
    icon: Keyboard,
  },
]

/** Preferencia por dispositivo: cómo se escanean los códigos de barras en este equipo. */
export function ScannerSettingsCard() {
  const preference = useScannerModePreference()
  const hasCamera = isCapacitorNative()

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" data-testid="scanner-settings-card">
      <div className="flex items-center gap-2">
        <ScanBarcode size={18} className="text-[rgb(var(--p600))]" aria-hidden />
        <h2 className="text-sm sm:text-base font-semibold text-gray-900">Escáner de códigos</h2>
      </div>
      <p className="mt-1 text-xs sm:text-sm text-gray-600">
        Se guarda solo en este dispositivo. El lector debe estar en modo teclado (HID) y terminar cada lectura con Enter.
      </p>

      {hasCamera ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modo de escaneo">
          {OPTIONS.map(o => {
            const Icon = o.icon
            const on = preference === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setScannerModePreference(o.id)}
                className={clsx(
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors touch-manipulation',
                  on
                    ? 'border-primary-400 bg-primary-50 text-primary-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-gray-600">{o.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-700">
          En el navegador y en la app de escritorio se escanea siempre con lector físico. La opción de cámara está
          disponible en la app Android.
        </p>
      )}
    </section>
  )
}
