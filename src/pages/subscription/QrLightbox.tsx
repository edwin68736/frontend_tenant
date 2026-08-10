import { Download, Share2, X, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { LIGHTBOX_Z } from '@/utils/uiLayers'

type Props = {
  open: boolean
  onClose: () => void
  url: string
  title: string
  accentClass: string
}

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
}

async function shareImage(url: string, title: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const file = new File([blob], `${title.toLowerCase()}-qr.png`, { type: blob.type || 'image/png' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `QR ${title}`, files: [file] })
      return
    }
    if (navigator.share) {
      await navigator.share({ title: `QR ${title}`, url })
      return
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Enlace del QR copiado')
  } catch {
    toast.error('No se pudo compartir el QR')
  }
}

export default function QrLightbox({ open, onClose, url, title, accentClass }: Props) {
  const filename = `qr-${title.toLowerCase()}.png`

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-sm !p-0 overflow-hidden" zClassName={LIGHTBOX_Z}>
      <div className={`px-4 py-3 flex items-center justify-between ${accentClass}`}>
        <h3 className="text-sm font-semibold text-white">QR {title}</h3>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-white/90 hover:bg-white/15" aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      <div className="p-4 flex flex-col items-center gap-4">
        <img src={url} alt={`QR ${title}`} className="w-full max-w-[280px] rounded-xl border border-gray-100 bg-white object-contain" />
        <p className="text-xs text-gray-500 text-center flex items-center gap-1">
          <ZoomIn size={14} />
          Escanea o usa los botones para guardar o compartir
        </p>
        <div className="flex gap-2 w-full">
          <button
            type="button"
            onClick={() => void downloadImage(url, filename).catch(() => toast.error('No se pudo descargar'))}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} />
            Descargar
          </button>
          <button
            type="button"
            onClick={() => void shareImage(url, title)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:bg-[rgb(var(--p700))]"
          >
            <Share2 size={16} />
            Compartir
          </button>
        </div>
      </div>
    </Modal>
  )
}
