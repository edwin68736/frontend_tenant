import { useEffect, useState } from 'react'
import { Percent, Save } from 'lucide-react'
import { toast } from 'sonner'
import { companyService } from '@/services/company.service'
import { MAX_SERVICE_CHARGE_RATE, isValidServiceChargeRate } from '@/utils/serviceCharge'

const DEFAULT_RATE = 10

/** Recargo al consumo (DL 25988): interruptor + porcentaje. Apagado por defecto; al activarlo, «Nuevo comprobante» y el POS lo ofrecen. */
export function ServiceChargeSettings() {
  const [enabled, setEnabled] = useState(false)
  const [rateText, setRateText] = useState(String(DEFAULT_RATE))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companyService
      .getConfig()
      .then((cfg) => {
        setEnabled(cfg.service_charge_enabled === true)
        const r = Number(cfg.service_charge_rate)
        setRateText(String(isValidServiceChargeRate(r) ? r : DEFAULT_RATE))
      })
      .catch(() => toast.error('Error cargando la configuración del recargo al consumo'))
      .finally(() => setLoading(false))
  }, [])

  const rate = Number(rateText.replace(',', '.'))
  const rateOk = isValidServiceChargeRate(rate) && Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-6
  const rateError = !rateOk ? `Ingrese un porcentaje entre 0.01 y ${MAX_SERVICE_CHARGE_RATE} (máximo 2 decimales)` : ''

  const handleSave = async () => {
    if (!rateOk) {
      toast.error(rateError)
      return
    }
    setSaving(true)
    try {
      await companyService.updateConfig({ service_charge_enabled: enabled, service_charge_rate: Number(rate.toFixed(2)) })
      toast.success('Recargo al consumo actualizado')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 space-y-3 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
          <Percent size={18} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Recargo al consumo</h3>
          <p className="text-sm text-gray-500">Para restaurantes, bares y hoteles (D.L. 25988).</p>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Cobrar recargo al consumo en mis ventas</span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Porcentaje (%)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.01}
            max={MAX_SERVICE_CHARGE_RATE}
            step={0.01}
            value={rateText}
            disabled={saving}
            onChange={(e) => setRateText(e.target.value)}
            className={`mt-1 block w-28 rounded-xl border px-3 py-2 text-sm tabular-nums ${rateOk ? 'border-gray-200' : 'border-red-400'}`}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !rateOk}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-semibold disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {!rateOk && <p className="text-xs text-red-600">{rateError}</p>}
      <ul className="text-xs text-gray-500 list-disc pl-4 space-y-1">
        <li>Es hasta {MAX_SERVICE_CHARGE_RATE} % del valor de venta sin IGV (ya con descuentos). No lleva IGV y se suma al total a pagar.</li>
        <li>Por ley corresponde a los trabajadores: usted debe repartirlo entre ellos, no es ingreso del negocio.</li>
        <li>Avise este recargo en su carta o lista de precios.</li>
        <li>No se puede combinar con anticipos ni con detracción.</li>
      </ul>
    </section>
  )
}
