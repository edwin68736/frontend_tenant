import { type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'

export type ConfirmVariant = 'danger' | 'default'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  /** Mensaje o contenido del cuerpo del diálogo */
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** danger = botón rojo (anular, eliminar); default = primario */
  variant?: ConfirmVariant
  /** Si true, deshabilita el botón confirm y muestra estado de carga (útil cuando onConfirm es async) */
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
    onClose()
  }

  const isDanger = variant === 'danger'
  const confirmBtnClass = isDanger
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-[rgb(var(--p600))] text-white hover:opacity-90'

  return (
    <Modal open={open} onClose={loading ? undefined : onClose} contentClassName="max-w-md">
      <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
      {message != null && (
        <div className="text-gray-600 text-sm">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${confirmBtnClass} disabled:opacity-50 flex items-center gap-2`}
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
