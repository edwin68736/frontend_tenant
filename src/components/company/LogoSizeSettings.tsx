import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { ImageIcon, Save } from 'lucide-react'
import { toast } from 'sonner'
import { companyService } from '@/services/company.service'
import {
  LOGO_PRINT_SIZE_OPTIONS,
  normalizeLogoPrintSize,
  type LogoPrintSize,
} from '@/services/printers/logoPrintSize'
import { clearEscPosImageRasterCache } from '@/utils/escposRasterImage'

function SizePicker({
  value,
  onChange,
}: {
  value: LogoPrintSize
  onChange: (v: LogoPrintSize) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LOGO_PRINT_SIZE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'rounded-lg border-2 px-3 py-2 text-left transition',
              active
                ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p500))] text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-[rgb(var(--p300))]',
            )}
          >
            <span className="block text-sm font-semibold">{opt.label}</span>
            <span className={clsx('block text-[11px]', active ? 'text-white/80' : 'text-gray-500')}>
              {opt.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Tamaño del logo en TODOS los comprobantes, separado por ticket y A4 (a nivel tenant). */
export function LogoSizeSettings() {
  const [ticketSize, setTicketSize] = useState<LogoPrintSize>('mediano')
  const [a4Size, setA4Size] = useState<LogoPrintSize>('mediano')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companyService
      .getConfig()
      .then((cfg) => {
        setTicketSize(normalizeLogoPrintSize(cfg.logo_size_ticket))
        setA4Size(normalizeLogoPrintSize(cfg.logo_size_a4))
      })
      .catch(() => toast.error('Error cargando configuración de logo'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateConfig({ logo_size_ticket: ticketSize, logo_size_a4: a4Size })
      // El raster ESC/POS del logo se cachea por tamaño: al cambiarlo hay que rehacerlo.
      clearEscPosImageRasterCache()
      toast.success('Tamaño de logo actualizado')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
          <ImageIcon size={18} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Tamaño del logo</h3>
          <p className="text-sm text-gray-500">
            Aplica a todos los comprobantes (factura, boleta, nota de venta). Si se ve borroso en
            «Grande», suba una imagen de mayor resolución.
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-2">PDF formato ticket (rollo)</p>
        <SizePicker value={ticketSize} onChange={setTicketSize} />
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-2">PDF formato A4</p>
        <SizePicker value={a4Size} onChange={setA4Size} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </section>
  )
}
