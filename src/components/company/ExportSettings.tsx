import { useEffect, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { toast } from 'sonner'
import { companyService } from '@/services/company.service'

/** Interruptor de exportación de servicios: apagado por defecto; al activarlo aparecen las operaciones de exportación en «Nuevo comprobante». */
export function ExportSettings() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companyService
      .getConfig()
      .then((cfg) => setEnabled(cfg.exports_enabled === true))
      .catch(() => toast.error('Error cargando la configuración de exportación'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (next: boolean) => {
    setSaving(true)
    try {
      await companyService.updateConfig({ exports_enabled: next })
      setEnabled(next)
      toast.success(next ? 'Exportación de servicios habilitada' : 'Exportación de servicios deshabilitada')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
          <Globe2 size={18} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Exportación de servicios</h3>
          <p className="text-sm text-gray-500">Para empresas que facturan servicios a clientes del exterior (sin IGV).</p>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => void toggle(e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Emitir facturas y boletas de exportación de servicios</span>
      </label>
      <p className="text-xs text-gray-500">
        Al activarlo, «Nuevo comprobante» ofrece las operaciones de exportación (incluido el hospedaje a extranjeros). Una exportación no paga IGV, así que
        actívelo solo si su empresa presta servicios que la norma considera exportación; si no cumple los requisitos debe devolver el IGV.
      </p>
    </section>
  )
}
