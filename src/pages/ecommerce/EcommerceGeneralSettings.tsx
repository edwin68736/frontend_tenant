import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, Upload } from 'lucide-react'
import { ecommerceService, type EcommerceSettings } from '@/services/ecommerce.service'
import { getTenantSlug, getRootDomain, resolvePublicAssetUrl } from '@/config/apiBaseUrl'

function ecommercePublicUrl(): string {
  const slug = getTenantSlug()
  if (!slug) return ''
  if (import.meta.env.DEV) return `http://${slug}.localhost:5173/ecommerce`
  return `https://${slug}.${getRootDomain()}/ecommerce`
}

export default function EcommerceGeneralSettings() {
  const [settings, setSettings] = useState<EcommerceSettings | null>(null)
  const [resolvedWhatsApp, setResolvedWhatsApp] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [whatsappOverride, setWhatsappOverride] = useState('')
  const [enabled, setEnabled] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const load = () => {
    setLoading(true)
    ecommerceService
      .getSettings()
      .then(({ data, resolved_whatsapp_number }) => {
        setSettings(data)
        setResolvedWhatsApp(resolved_whatsapp_number)
        setStoreName(data.store_name || '')
        setTagline(data.tagline || '')
        setDescription(data.description || '')
        setWhatsappOverride(data.whatsapp_number || '')
        setEnabled(data.enabled)
      })
      .catch(() => toast.error('Error cargando ajustes de la tienda'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data, resolved_whatsapp_number } = await ecommerceService.updateSettings({
        enabled,
        store_name: storeName,
        tagline,
        description,
        whatsapp_number: whatsappOverride,
      })
      setSettings(data)
      setResolvedWhatsApp(resolved_whatsapp_number)
      toast.success('Ajustes guardados')
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Selecciona una imagen'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no debe superar 5 MB'); return }
    setUploadingLogo(true)
    try {
      await ecommerceService.uploadLogo(file)
      toast.success('Logo actualizado')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al subir el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const publicUrl = ecommercePublicUrl()

  const copyLink = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    toast.success('Link copiado')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-4 bg-gray-50 rounded-xl p-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Tienda activa</p>
          <p className="text-xs text-gray-500">Actívala para que tus clientes puedan verla y comprar.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Tienda activa"
          onClick={() => setEnabled((v) => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-[rgb(var(--p600))]' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {publicUrl && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
          <span className="flex-1 text-sm text-gray-600 truncate font-mono">{publicUrl}</span>
          <button type="button" onClick={copyLink} title="Copiar link" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <Copy size={15} />
          </button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" title="Ver mi tienda" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <ExternalLink size={15} />
          </a>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Logo de la tienda</label>
        <div className="flex items-center gap-3">
          {settings?.logo_url ? (
            <img src={resolvePublicAssetUrl(settings.logo_url)} alt="Logo" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-100 border border-dashed border-gray-300" />
          )}
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload size={14} /> {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); e.target.value = '' }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la tienda</label>
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Ej: Mi Negocio" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Frase corta (tagline)</label>
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Ej: Lo mejor para tu hogar" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
        <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp para pedidos</label>
        <input
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={whatsappOverride}
          onChange={e => setWhatsappOverride(e.target.value)}
          placeholder={resolvedWhatsApp ? `Usando el de Ajustes generales: ${resolvedWhatsApp}` : 'Ej: 51999999999'}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Déjalo vacío para usar el mismo teléfono de Ajustes → Empresa, o escribe uno exclusivo para la tienda.
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
