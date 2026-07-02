import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Save, Building2, ImagePlus, X } from 'lucide-react'
import { companyService, type CompanyConfig } from '@/services/company.service'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { ubigeoToIds } from '@/services/ubigeo.service'

const THEMES = [
  { key: 'green', label: 'Verde', color: '#16a34a' },
  { key: 'blue', label: 'Azul', color: '#3b82f6' },
  { key: 'violet', label: 'Violeta', color: '#8b5cf6' },
  { key: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { key: 'rose', label: 'Rosa', color: '#f43f5e' },
  { key: 'amber', label: 'Ámbar', color: '#f59e0b' },
  { key: 'slate', label: 'Gris', color: '#64748b' },
]

const CURRENCIES = ['PEN', 'USD', 'EUR']

export function ErpCompanySettings() {
  const [form, setForm] = useState<Partial<CompanyConfig>>({})
  const [ubigeo, setUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    companyService
      .getConfig()
      .then((data) => {
        setForm(data)
        const ids = ubigeoToIds(data.ubigeo ?? '')
        setUbigeo({ regionId: ids.regionId, provinciaId: ids.provinciaId, distritoId: ids.distritoId })
      })
      .catch(() => toast.error('Error cargando datos de empresa'))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: keyof CompanyConfig, v: string) => setForm((f) => ({ ...f, [k]: v }))

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
      await companyService.updateConfig({
        ...form,
        ubigeo: ubigeo.distritoId || form.ubigeo,
        additional_notes: form.additional_notes ?? '',
        terms_and_conditions: form.terms_and_conditions ?? '',
      })
      toast.success('Datos de empresa guardados')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-[rgb(var(--p500))] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5 w-full min-w-0">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[rgb(var(--p50))] text-[rgb(var(--p700))] flex items-center justify-center">
            <Building2 size={18} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Datos de la empresa</h2>
            <p className="text-sm text-gray-600">Logo, contacto y dirección en comprobantes.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razón social</label>
            <input
              readOnly
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600"
              value={form.business_name ?? ''}
            />
            <p className="text-[11px] text-gray-400 mt-0.5">Definida en el panel central</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre comercial</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.trade_name ?? ''}
              onChange={(e) => set('trade_name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">RUC</label>
            <input
              readOnly
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600"
              value={form.ruc ?? ''}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.currency ?? 'PEN'}
              onChange={(e) => set('currency', e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación (para comprobantes SUNAT)</label>
            <UbigeoSelects
              regionId={ubigeo.regionId}
              provinciaId={ubigeo.provinciaId}
              distritoId={ubigeo.distritoId}
              onChange={(regionId, provinciaId, distritoId) => setUbigeo({ regionId, provinciaId, distritoId })}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Información adicional</label>
            <textarea
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y min-h-[96px]"
              value={form.additional_notes ?? ''}
              onChange={(e) => set('additional_notes', e.target.value)}
              placeholder="Horarios, leyendas en tickets, datos bancarios, etc."
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Texto global que se imprime en tickets y comprobantes térmicos (debajo del contacto de la empresa).
            </p>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Términos y condiciones</label>
            <textarea
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y min-h-[96px]"
              value={form.terms_and_conditions ?? ''}
              onChange={(e) => set('terms_and_conditions', e.target.value)}
              placeholder="Plazo de pago, garantías, política de cambios, condiciones comerciales…"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Texto global que puede incluirse en comprobantes, notas de venta y cotizaciones al activar la opción en cada documento.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 w-full">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <ImagePlus size={16} className="text-gray-500" />
          Logo
        </h3>
        <p className="text-xs text-gray-500">Se muestra en tickets y comprobantes impresos.</p>
        <div className="flex flex-wrap items-start gap-4">
          {form.logo_url ? (
            <div className="relative">
              <img
                src={form.logo_url}
                alt="Logo"
                className="h-24 w-auto max-w-[200px] object-contain border border-gray-200 rounded-xl bg-gray-50 p-2"
              />
              <button
                type="button"
                onClick={clearLogo}
                className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" id="erp-logo" />
            <label
              htmlFor="erp-logo"
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
            >
              <ImagePlus size={16} />
              {form.logo_url ? 'Cambiar logo' : 'Cargar logo'}
            </label>
          </div>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Tema de color</h3>
        <div className="flex flex-wrap gap-3">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => set('color_theme', t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-colors ${
                form.color_theme === t.key
                  ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p50))]'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      </section>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar empresa'}
        </button>
      </div>
    </div>
  )
}
