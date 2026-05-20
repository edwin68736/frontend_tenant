import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save, Shield } from 'lucide-react'
import { companyService, type SunatConfig } from '@/services/company.service'
import { useAuth } from '@/contexts/AuthContext'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'

export default function CompanySunatPage() {
  const { hasModule } = useAuth()
  const [sunatEnabled, setSunatEnabled] = useState(false)
  const [form, setForm] = useState<Pick<SunatConfig, 'tax_rate' | 'igv_regime' | 'tax_benefit_zone'>>({
    tax_rate: 18,
    igv_regime: '',
    tax_benefit_zone: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companyService.getSunat()
      .then(data => {
        setSunatEnabled(data.sunat_enabled ?? false)
        setForm({
          tax_rate: data.tax_rate ?? 18,
          igv_regime: data.igv_regime ?? '',
          tax_benefit_zone: data.tax_benefit_zone ?? false,
        })
      })
      .catch(() => toast.error('Error cargando configuración SUNAT'))
      .finally(() => setLoading(false))
  }, [])

  const setF = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateSunat(form)
      toast.success('Configuración SUNAT guardada')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error guardando')
    } finally { setSaving(false) }
  }

  if (!hasModule('billing')) return <SunatRequiredMessage />
  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Shield size={20} className="text-gray-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-800">Configuración SUNAT</h2>
          <p className="text-sm text-gray-500">Facturación electrónica e impuestos</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Facturación electrónica</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Estado</p>
            <p className="text-xs text-gray-400">La facturación electrónica se controla desde el panel central</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${sunatEnabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {sunatEnabled ? 'Habilitada' : 'Deshabilitada'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Impuestos</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tasa IGV (%)</label>
            <input type="number" min={0} max={30}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.tax_rate ?? 18} onChange={e => setF('tax_rate', Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Régimen IGV</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.igv_regime ?? 'standard'} onChange={e => setF('igv_regime', e.target.value)}>
              <option value="standard">General</option>
              <option value="simplified">Simplificado</option>
              <option value="exempt">Exonerado</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Zona de beneficio tributario</p>
            <p className="text-xs text-gray-400">Selva u otras zonas con beneficios especiales</p>
          </div>
          <button onClick={() => setF('tax_benefit_zone', !form.tax_benefit_zone)}
            className={`w-12 h-6 rounded-full transition-colors ${form.tax_benefit_zone ? 'bg-[rgb(var(--p500))]' : 'bg-gray-300'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.tax_benefit_zone ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}
