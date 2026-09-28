import { useEffect, useState } from 'react'
import { FileText, Save } from 'lucide-react'
import { toast } from 'sonner'
import { companyService } from '@/services/company.service'

export function SaleNoteBrandingSettings() {
  const [tradeName, setTradeName] = useState('')
  const [showBusinessName, setShowBusinessName] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companyService
      .getConfig()
      .then((cfg) => {
        setTradeName(String(cfg.trade_name ?? '').trim())
        setShowBusinessName(cfg.show_business_name_on_sale_note !== false)
      })
      .catch(() => toast.error('Error cargando configuración de notas de venta'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateConfig({ show_business_name_on_sale_note: showBusinessName })
      toast.success('Notas de venta actualizadas')
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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
          <FileText size={18} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Notas de venta</h3>
          <p className="text-sm text-gray-500">Solo aplica a nota de venta, no a factura/boleta.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showBusinessName}
          onChange={(e) => setShowBusinessName(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm text-gray-700">Mostrar razón social en las notas de venta</span>
      </label>
      <p className="text-xs text-gray-500">
        {showBusinessName
          ? 'Se muestra la razón social tal como hoy.'
          : tradeName
            ? `Se ocultará la razón social; se mostrará el nombre comercial ("${tradeName}") en su lugar.`
            : 'No tiene nombre comercial configurado (Empresa → Datos generales), así que la razón social se seguirá mostrando aunque esta opción esté desactivada.'}
      </p>

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
