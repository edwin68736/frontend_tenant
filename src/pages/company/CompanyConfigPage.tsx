import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Save, Building2, ImagePlus, X } from 'lucide-react'
import { companyService, type CompanyConfig } from '@/services/company.service'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { ubigeoToIds } from '@/services/ubigeo.service'

const THEMES = [
  { key: 'blue',    label: 'Azul',    color: '#3b82f6' },
  { key: 'violet',  label: 'Violeta', color: '#8b5cf6' },
  { key: 'emerald', label: 'Verde',   color: '#10b981' },
  { key: 'rose',    label: 'Rosa',    color: '#f43f5e' },
  { key: 'amber',   label: 'Ámbar',   color: '#f59e0b' },
  { key: 'slate',   label: 'Gris',    color: '#64748b' },
]

const CURRENCIES = ['PEN', 'USD', 'EUR']

export default function CompanyConfigPage() {
  const [form, setForm] = useState<Partial<CompanyConfig>>({})
  const [ubigeo, setUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    companyService.getConfig()
      .then(data => {
        setForm(data)
        const ids = ubigeoToIds(data.ubigeo ?? '')
        setUbigeo({ regionId: ids.regionId, provinciaId: ids.provinciaId, distritoId: ids.distritoId })
        setLoading(false)
      })
      .catch(() => { toast.error('Error cargando configuración'); setLoading(false) })
  }, [])

  const set = (k: keyof CompanyConfig, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (PNG, JPG, etc.)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('logo_url', reader.result as string)
    reader.readAsDataURL(file)
  }
  const clearLogo = () => {
    set('logo_url', '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateConfig({ ...form, ubigeo: ubigeo.distritoId || form.ubigeo })
      toast.success('Configuración guardada')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error guardando')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Building2 size={20} className="text-gray-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-800">Datos de la Empresa</h2>
          <p className="text-sm text-gray-500">Información fiscal y general</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razón Social *</label>
            <input
              readOnly
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700 cursor-not-allowed"
              value={form.business_name ?? ''}
              title="La razón social no se puede modificar desde aquí. Definida en el panel central."
            />
            <p className="text-xs text-gray-500 mt-0.5">No editable</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre Comercial</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))]"
              value={form.trade_name ?? ''} onChange={e => set('trade_name', e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">RUC</label>
            <input
              readOnly
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700 cursor-not-allowed"
              value={form.ruc ?? ''}
              title="El RUC no se puede modificar desde aquí. Definido en el panel central."
            />
            <p className="text-xs text-gray-500 mt-0.5">No editable</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
              value={form.currency ?? 'PEN'} onChange={e => set('currency', e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación (para comprobantes SUNAT)</label>
            <UbigeoSelects
              regionId={ubigeo.regionId}
              provinciaId={ubigeo.provinciaId}
              distritoId={ubigeo.distritoId}
              onChange={(regionId, provinciaId, distritoId) => setUbigeo({ regionId, provinciaId, distritoId })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))]"
              value={form.address ?? ''} onChange={e => set('address', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))]"
              value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))]"
              value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ImagePlus size={18} className="text-gray-500" />
          Logo de la empresa
        </h3>
        <p className="text-xs text-gray-500">Se usará en comprobantes (facturas, tickets, cotizaciones). Recomendado: imagen cuadrada o horizontal, fondo claro.</p>
        <div className="flex flex-wrap items-start gap-4">
          {form.logo_url ? (
            <div className="relative">
              <img src={form.logo_url} alt="Logo" className="h-24 w-auto max-w-[200px] object-contain border border-gray-200 rounded-xl bg-gray-50 p-2" />
              <button type="button" onClick={clearLogo} className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200" title="Quitar logo">
                <X size={14} />
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" id="logo-upload" />
            <label htmlFor="logo-upload" className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              <ImagePlus size={16} /> {form.logo_url ? 'Cambiar logo' : 'Cargar logo'}
            </label>
            {form.logo_url ? (
              <button type="button" onClick={clearLogo} className="text-xs text-red-600 hover:underline">Quitar logo</button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Tema de color</h3>
        <div className="flex flex-wrap gap-3">
          {THEMES.map(t => (
            <button key={t.key} onClick={() => set('color_theme', t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-colors ${form.color_theme === t.key ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p50))]' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
