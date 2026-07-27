import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Upload } from 'lucide-react'
import { ecommerceService, type EcommerceSlider, type EcommerceSettings } from '@/services/ecommerce.service'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

function validateImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Selecciona una imagen'
  if (file.size > 5 * 1024 * 1024) return 'La imagen no debe superar 5 MB'
  return null
}

type SliderDraft = { title: string; subtitle: string; button_text: string; link_url: string }

function draftFrom(s: EcommerceSlider): SliderDraft {
  return { title: s.title || '', subtitle: s.subtitle || '', button_text: s.button_text || '', link_url: s.link_url || '' }
}

export default function EcommerceBannersSettings() {
  const [settings, setSettings] = useState<EcommerceSettings | null>(null)
  const [sliders, setSliders] = useState<EcommerceSlider[]>([])
  const [drafts, setDrafts] = useState<Record<number, SliderDraft>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [uploadingSlider, setUploadingSlider] = useState(false)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const sliderInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    Promise.all([ecommerceService.getSettings(), ecommerceService.listSliders()])
      .then(([{ data }, sl]) => {
        setSettings(data)
        setSliders(sl)
        setDrafts(Object.fromEntries(sl.map(s => [s.id, draftFrom(s)])))
      })
      .catch(() => toast.error('Error cargando banners'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const setDraft = (id: number, patch: Partial<SliderDraft>) =>
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const saveDraft = async (id: number) => {
    const d = drafts[id]
    if (!d) return
    setSavingId(id)
    try {
      await ecommerceService.updateSlider(id, { title: d.title, subtitle: d.subtitle, button_text: d.button_text, link_url: d.link_url })
      setSliders(prev => prev.map(s => (s.id === id ? { ...s, ...d } : s)))
      toast.success('Banner actualizado')
    } catch {
      toast.error('Error al guardar el banner')
    } finally {
      setSavingId(null)
    }
  }

  const handleBackgroundUpload = async (file: File) => {
    const err = validateImage(file)
    if (err) { toast.error(err); return }
    setUploadingBg(true)
    try {
      await ecommerceService.uploadBackground(file)
      toast.success('Fondo actualizado')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al subir el fondo')
    } finally {
      setUploadingBg(false)
    }
  }

  const handleSliderUpload = async (file: File) => {
    const err = validateImage(file)
    if (err) { toast.error(err); return }
    setUploadingSlider(true)
    try {
      await ecommerceService.createSlider(file)
      toast.success('Imagen agregada al carrusel')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al subir la imagen')
    } finally {
      setUploadingSlider(false)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...sliders]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSliders(next)
    try {
      await ecommerceService.reorderSliders(next.map(s => s.id))
    } catch {
      toast.error('Error al reordenar')
      load()
    }
  }

  const toggleActive = async (slider: EcommerceSlider) => {
    try {
      await ecommerceService.updateSlider(slider.id, { active: !slider.active })
      setSliders(prev => prev.map(s => (s.id === slider.id ? { ...s, active: !s.active } : s)))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const remove = async (id: number) => {
    try {
      await ecommerceService.deleteSlider(id)
      setSliders(prev => prev.filter(s => s.id !== id))
      toast.success('Imagen eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Fondo de la tienda</label>
        <div className="flex items-center gap-3">
          {settings?.background_image_url ? (
            <img src={resolvePublicAssetUrl(settings.background_image_url)} alt="Fondo" className="w-24 h-14 rounded-xl object-cover border border-gray-200" />
          ) : (
            <div className="w-24 h-14 rounded-xl bg-gray-100 border border-dashed border-gray-300" />
          )}
          <button
            type="button"
            onClick={() => bgInputRef.current?.click()}
            disabled={uploadingBg}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload size={14} /> {uploadingBg ? 'Subiendo...' : 'Subir fondo'}
          </button>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleBackgroundUpload(f); e.target.value = '' }}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-600">Carrusel principal (sliders)</label>
          <button
            type="button"
            onClick={() => sliderInputRef.current?.click()}
            disabled={uploadingSlider}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={13} /> {uploadingSlider ? 'Subiendo...' : 'Agregar imagen'}
          </button>
          <input
            ref={sliderInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleSliderUpload(f); e.target.value = '' }}
          />
        </div>

        {sliders.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">
            Sin imágenes en el carrusel todavía.
          </p>
        ) : (
          <div className="space-y-3">
            {sliders.map((s, i) => {
              const d = drafts[s.id] ?? draftFrom(s)
              const dirty =
                d.title !== (s.title || '') ||
                d.subtitle !== (s.subtitle || '') ||
                d.button_text !== (s.button_text || '') ||
                d.link_url !== (s.link_url || '')
              return (
                <div key={s.id} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <img src={resolvePublicAssetUrl(s.image_url)} alt="" className="w-24 h-16 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        placeholder="Título (ej: Ofertas de temporada)"
                        value={d.title}
                        onChange={e => setDraft(s.id, { title: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        maxLength={150}
                      />
                      <input
                        placeholder="Subtítulo (ej: Hasta 30% de descuento)"
                        value={d.subtitle}
                        onChange={e => setDraft(s.id, { subtitle: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        maxLength={255}
                      />
                      <input
                        placeholder="Texto del botón (ej: Ver ofertas)"
                        value={d.button_text}
                        onChange={e => setDraft(s.id, { button_text: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        maxLength={60}
                      />
                      <input
                        placeholder="Link del botón (opcional, ej: #productos)"
                        value={d.link_url}
                        onChange={e => setDraft(s.id, { link_url: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        maxLength={255}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === sliders.length - 1} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" onClick={() => remove(s.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={s.active} onChange={() => toggleActive(s)} className="rounded border-gray-300" />
                      Visible en la tienda
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveDraft(s.id)}
                      disabled={!dirty || savingId === s.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgb(var(--p600))] text-white text-xs font-medium disabled:opacity-40"
                    >
                      <Save size={12} /> {savingId === s.id ? 'Guardando...' : 'Guardar textos'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
