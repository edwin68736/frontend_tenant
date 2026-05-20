import { X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

export interface DocumentViewerModalProps {
  /** Si el modal está abierto */
  open: boolean
  /** Al cerrar (botón o overlay). Quien use el componente debe revocar la URL si es object URL. */
  onClose: () => void
  /** URL del documento a mostrar en el iframe (ej. object URL de un blob PDF). Si es null no se muestra el iframe. */
  src: string | null
  /** Título del modal (ej. "Comprobante PDF", "Nota de crédito") */
  title?: string
  /** Clases extra para el contenedor del modal (ej. max-w-4xl para más ancho) */
  contentClassName?: string
}

/**
 * Modal reutilizable para visualizar documentos (PDF, etc.) en un iframe.
 * Pensado para facturas, boletas, notas de crédito/débito, guías de remisión, etc.
 * El padre debe revocar la object URL en onClose cuando corresponda.
 */
export function DocumentViewerModal({
  open,
  onClose,
  src,
  title = 'Documento',
  contentClassName = 'max-w-4xl',
}: DocumentViewerModalProps) {
  return (
    <Modal open={open} onClose={onClose} contentClassName={contentClassName}>
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      {src ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-100 -m-1">
          <iframe
            src={src}
            title={title}
            className="w-full h-[75vh] min-h-[320px] border-0"
          />
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400 text-sm">Cargando documento…</div>
      )}
    </Modal>
  )
}
