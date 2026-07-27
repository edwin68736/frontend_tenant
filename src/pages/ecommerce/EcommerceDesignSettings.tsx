import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { ecommerceService } from '@/services/ecommerce.service'

const TEMPLATES_RUBRO = [
  { key: 'ferreteria', label: 'Ferretería', primary: '#f5c518', secondary: '#1a1a1a', font: 'Montserrat', card: 'square' },
  { key: 'tecnologia', label: 'Tecnología', primary: '#2563eb', secondary: '#0f172a', font: 'Inter', card: 'rounded' },
  { key: 'abarrotes', label: 'Abarrotes / Verdulería', primary: '#22a559', secondary: '#14532d', font: 'Poppins', card: 'rounded' },
] as const

const TEMPLATES_GENERALES = [
  { key: 'moderno', label: 'Moderno', primary: '#16a34a', secondary: '#0f172a', font: 'Inter', card: 'rounded' },
  { key: 'minimalista', label: 'Minimalista', primary: '#111827', secondary: '#6b7280', font: 'Inter', card: 'square' },
  { key: 'vibrante', label: 'Vibrante', primary: '#ea580c', secondary: '#7c3aed', font: 'Poppins', card: 'rounded' },
  { key: 'elegante', label: 'Elegante', primary: '#0f172a', secondary: '#b45309', font: 'Playfair Display', card: 'minimal' },
] as const

const TEMPLATES = [...TEMPLATES_RUBRO, ...TEMPLATES_GENERALES]

const FONTS = ['Inter', 'Poppins', 'Roboto', 'Montserrat', 'Lora', 'Playfair Display']
const CARD_STYLES: { key: string; label: string }[] = [
  { key: 'rounded', label: 'Bordes redondeados + sombra' },
  { key: 'square', label: 'Bordes rectos' },
  { key: 'minimal', label: 'Minimalista sin sombra' },
]
const CATEGORY_STYLES: { key: string; label: string }[] = [
  { key: 'circles', label: 'Íconos circulares' },
  { key: 'pills', label: 'Botones de texto' },
]

export default function EcommerceDesignSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templateKey, setTemplateKey] = useState('moderno')
  const [primaryColor, setPrimaryColor] = useState('#16a34a')
  const [secondaryColor, setSecondaryColor] = useState('#0f172a')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [cardStyle, setCardStyle] = useState('rounded')
  const [categoryStyle, setCategoryStyle] = useState('circles')

  useEffect(() => {
    ecommerceService
      .getSettings()
      .then(({ data }) => {
        setTemplateKey(data.template_key || 'moderno')
        setPrimaryColor(data.primary_color || '#16a34a')
        setSecondaryColor(data.secondary_color || '#0f172a')
        setFontFamily(data.font_family || 'Inter')
        setCardStyle(data.card_style || 'rounded')
        setCategoryStyle(data.category_style || 'circles')
      })
      .catch(() => toast.error('Error cargando el diseño'))
      .finally(() => setLoading(false))
  }, [])

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setTemplateKey(t.key)
    setPrimaryColor(t.primary)
    setSecondaryColor(t.secondary)
    setFontFamily(t.font)
    setCardStyle(t.card)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await ecommerceService.updateSettings({
        template_key: templateKey,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        font_family: fontFamily,
        card_style: cardStyle,
        category_style: categoryStyle,
      })
      toast.success('Diseño guardado')
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const cardRadius = cardStyle === 'square' ? '4px' : cardStyle === 'minimal' ? '10px' : '18px'
  const cardShadow = cardStyle === 'minimal' ? 'none' : '0 4px 14px rgba(0,0,0,0.08)'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Plantilla por rubro</label>
          <p className="text-[11px] text-gray-400 mb-2">Elige la que más se parezca a tu negocio; luego puedes ajustar colores y tipografía libremente.</p>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES_RUBRO.map((t) => (
              <TemplateCard key={t.key} t={t} active={templateKey === t.key} onClick={() => applyTemplate(t)} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Plantillas generales</label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES_GENERALES.map((t) => (
              <TemplateCard key={t.key} t={t} active={templateKey === t.key} onClick={() => applyTemplate(t)} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color primario</label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer" />
              <input className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-xs font-mono" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color secundario</label>
            <div className="flex items-center gap-2">
              <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer" />
              <input className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-xs font-mono" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipografía</label>
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Estilo de tarjeta</label>
          <div className="space-y-1.5">
            {CARD_STYLES.map(cs => (
              <label key={cs.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="cardStyle" checked={cardStyle === cs.key} onChange={() => setCardStyle(cs.key)} />
                {cs.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Navegación de categorías</label>
          <div className="space-y-1.5">
            {CATEGORY_STYLES.map(cs => (
              <label key={cs.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="categoryStyle" checked={categoryStyle === cs.key} onChange={() => setCategoryStyle(cs.key)} />
                {cs.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar diseño'}
        </button>
      </div>

      {/* Vista previa en vivo — namespaced, no toca las variables de tema del panel */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Vista previa</label>
        <div className="bg-gray-100 rounded-2xl p-6 flex flex-col items-center">
          <div
            className="w-full max-w-[220px] overflow-hidden bg-white"
            style={{ borderRadius: cardRadius, boxShadow: cardShadow, fontFamily }}
          >
            <div className="h-28" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }} />
            <div className="p-3 space-y-1.5">
              <p className="text-sm font-semibold" style={{ color: secondaryColor }}>Producto de ejemplo</p>
              <p className="text-xs" style={{ fontFamily }}>Descripción corta del producto</p>
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-sm" style={{ color: primaryColor }}>S/ 49.90</span>
                <span className="text-white text-xs font-semibold px-3 py-1.5" style={{ background: primaryColor, borderRadius: cardStyle === 'square' ? '4px' : '999px' }}>
                  Agregar
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ t, active, onClick }: { t: (typeof TEMPLATES)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border p-3 text-left transition ${
        active ? 'border-[rgb(var(--p600))] ring-2 ring-[rgb(var(--p200))]' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {active && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[rgb(var(--p600))] text-white flex items-center justify-center">
          <Check size={10} />
        </span>
      )}
      <div className="flex gap-1 mb-2">
        <span className="w-5 h-5 rounded-full border border-black/10" style={{ background: t.primary }} />
        <span className="w-5 h-5 rounded-full border border-black/10" style={{ background: t.secondary }} />
      </div>
      <p className="text-xs font-semibold text-gray-800">{t.label}</p>
    </button>
  )
}
