import { useState } from 'react'
import { clsx } from 'clsx'
import { ImageIcon } from 'lucide-react'
import {
  LOGO_PRINT_SIZE_OPTIONS,
  readLogoPrintSize,
  saveLogoPrintSize,
  type LogoPrintSize,
} from '@/services/printers/logoPrintSize'
import { clearEscPosImageRasterCache } from '@/utils/escposRasterImage'

/** Tamaño del logo en comprobantes: aplica al PDF y a la impresión térmica. */
export function LogoPrintSizeSettings() {
  const [size, setSize] = useState<LogoPrintSize>(() => readLogoPrintSize())

  const change = (value: LogoPrintSize) => {
    setSize(value)
    saveLogoPrintSize(value)
    // El raster del logo se cachea por tamaño: al cambiarlo hay que rehacerlo.
    clearEscPosImageRasterCache()
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-stone-100 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <ImageIcon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-stone-900">Tamaño del logo</h2>
          <p className="mt-1 text-xs text-stone-500">
            Aplica al comprobante en PDF y a la impresión térmica. Si el logo se ve borroso en
            «Grande», suba una imagen de mayor resolución.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-4">
        {LOGO_PRINT_SIZE_OPTIONS.map((opt) => {
          const active = size === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => change(opt.value)}
              className={clsx(
                'rounded-lg border-2 px-3 py-2 text-left transition',
                active
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-primary-300',
              )}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className={clsx('block text-[11px]', active ? 'text-primary-50' : 'text-stone-500')}>
                {opt.hint}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
