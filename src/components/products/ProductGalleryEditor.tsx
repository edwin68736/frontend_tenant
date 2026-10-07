import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Star, Trash2 } from 'lucide-react'
import {
  getProductImageUrl,
  productsService,
  type ProductGalleryImage,
} from '@/services/products.service'

export const MAX_GALLERY_IMAGES = 8
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp'

function validate(file: File): string | null {
  if (!ACCEPT.split(',').includes(file.type)) return 'Formato no permitido. Usa JPG, PNG o WebP'
  if (file.size > MAX_BYTES) return 'La imagen no debe superar 10 MB'
  return null
}

type Props = {
  /** Producto ya guardado; null mientras se está creando (las imágenes quedan pendientes hasta guardar). */
  productId: number | null
  /** Imágenes elegidas antes de que el producto exista (se suben al guardar). */
  pending: File[]
  onPendingChange: (files: File[]) => void
  /** La imagen principal cambió (al promover una de la galería): URL nueva de `image_url`. */
  onMainChanged: (url: string) => void
  disabled?: boolean
}

/**
 * Galería de imágenes adicionales del producto: se muestran junto a la imagen principal en el detalle del
 * producto del Catálogo Digital (tienda virtual). La imagen principal sigue siendo la de arriba; cualquiera
 * de la galería puede promoverse a principal (la anterior pasa a la galería).
 */
export default function ProductGalleryEditor({ productId, pending, onPendingChange, onMainChanged, disabled }: Props) {
  const [items, setItems] = useState<ProductGalleryImage[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | 'upload' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!productId) {
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    productsService
      .listGallery(productId)
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && toast.error('No se pudo cargar la galería'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [productId])

  const pendingPreviews = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending])
  useEffect(() => () => pendingPreviews.forEach((u) => URL.revokeObjectURL(u)), [pendingPreviews])

  const total = items.length + pending.length
  const full = total >= MAX_GALLERY_IMAGES

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const room = MAX_GALLERY_IMAGES - total
    const accepted: File[] = []
    for (const f of files.slice(0, Math.max(0, room))) {
      const err = validate(f)
      if (err) {
        toast.error(`${f.name}: ${err}`)
        continue
      }
      accepted.push(f)
    }
    if (files.length > room) toast.error(`Máximo ${MAX_GALLERY_IMAGES} imágenes en la galería`)
    if (accepted.length === 0) return

    if (!productId) {
      onPendingChange([...pending, ...accepted])
      return
    }
    setBusyId('upload')
    try {
      for (const f of accepted) {
        const row = await productsService.uploadGalleryImage(productId, f)
        setItems((prev) => [...prev, row])
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo subir la imagen')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (img: ProductGalleryImage) => {
    if (!productId) return
    setBusyId(img.id)
    try {
      await productsService.deleteGalleryImage(productId, img.id)
      setItems((prev) => prev.filter((x) => x.id !== img.id))
    } catch {
      toast.error('No se pudo eliminar la imagen')
    } finally {
      setBusyId(null)
    }
  }

  const makeMain = async (img: ProductGalleryImage) => {
    if (!productId) return
    setBusyId(img.id)
    try {
      const newMain = await productsService.promoteGalleryImage(productId, img.id)
      onMainChanged(newMain)
      setItems(await productsService.listGallery(productId))
      toast.success('Imagen principal actualizada')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo cambiar la imagen principal')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-xs font-medium text-gray-600">Galería de imágenes (catálogo digital)</label>
        <span className="text-[11px] text-gray-400 tabular-nums">
          {total}/{MAX_GALLERY_IMAGES}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {loading && <Loader2 size={16} className="animate-spin text-gray-400" />}
        {items.map((img) => (
          <div key={img.id} className="group relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
            <img src={getProductImageUrl(img.url)} alt="" className="w-full h-full object-cover" />
            {busyId === img.id ? (
              <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 size={16} className="animate-spin text-gray-500" />
              </span>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void makeMain(img)}
                  title="Usar como imagen principal"
                  aria-label="Usar como imagen principal"
                  className="p-1 rounded bg-white/90 text-amber-600 hover:bg-white"
                >
                  <Star size={13} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void remove(img)}
                  title="Quitar de la galería"
                  aria-label="Quitar de la galería"
                  className="p-1 rounded bg-white/90 text-red-600 hover:bg-white"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            )}
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-dashed border-[rgb(var(--p300))] bg-gray-100">
            <img src={pendingPreviews[i]} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
              title="Quitar"
              aria-label="Quitar imagen pendiente"
              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/90 text-red-600"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {!full && (
          <>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void onSelect(e)} />
            <button
              type="button"
              disabled={disabled || busyId === 'upload'}
              onClick={() => inputRef.current?.click()}
              className="w-16 h-16 rounded-lg border border-dashed border-gray-300 text-[rgb(var(--p600))] flex flex-col items-center justify-center gap-0.5 hover:bg-[rgb(var(--p50))] disabled:opacity-50"
            >
              {busyId === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span className="text-[10px] font-medium">Agregar</span>
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Se muestran en el detalle del producto de la tienda virtual. JPG, PNG o WebP · máx. 10 MB c/u
        {!productId && pending.length > 0 ? ' · Se subirán al guardar' : ''}
      </p>
    </div>
  )
}
