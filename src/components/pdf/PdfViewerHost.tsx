import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { PortalModal } from '@/components/ui/PortalModal'
import { PdfBlobViewer } from '@/components/PdfBlobViewer'
import { downloadBlob } from '@/utils/downloadBlob'
import { MODAL_FOOTER_SAFE } from '@/utils/safeAreaClasses'
import { closePdfViewer, subscribePdfViewer, type PdfViewerRequest } from './pdfViewerStore'

/**
 * Anfitrión del visor de PDF. Se monta una vez en el layout; las páginas solo llaman a
 * openPdfViewer(). PdfBlobViewer se encarga de la plataforma: iframe en escritorio/web y
 * rasterizado con pdf.js en Android, donde el WebView no muestra blobs en iframe.
 */
export function PdfViewerHost() {
  const [req, setReq] = useState<PdfViewerRequest | null>(null)

  useEffect(() => subscribePdfViewer(setReq), [])

  if (!req) return null

  const handleDownload = async () => {
    if (!req.fileName) return
    try {
      const blob = await fetch(req.url).then((r) => r.blob())
      await downloadBlob(blob, req.fileName)
    } catch {
      toast.error('No se pudo descargar el PDF')
    }
  }

  return (
    <PortalModal open onClose={closePdfViewer} className="max-w-4xl">
      <div className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h3 className="truncate text-sm font-bold text-gray-800">{req.title}</h3>
          <div className="flex items-center gap-1">
            {req.fileName ? (
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="download-attention-pulse flex items-center gap-1.5 rounded-lg bg-[rgb(var(--p600))] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[rgb(var(--p700))]"
                aria-label="Descargar PDF"
              >
                <Download size={15} />
                <span>Descargar</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={closePdfViewer}
              className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-hidden bg-stone-100 ${MODAL_FOOTER_SAFE}`}>
          <PdfBlobViewer
            url={req.url}
            title={req.title}
            embedOptions={req.fit ? { fit: req.fit } : undefined}
          />
        </div>
      </div>
    </PortalModal>
  )
}
