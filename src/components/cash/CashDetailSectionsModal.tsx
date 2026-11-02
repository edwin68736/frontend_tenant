import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  CASH_DETAIL_SECTION_OPTIONS,
  allCashDetailSections,
  type CashDetailSections,
} from '@/utils/cashSessionDetailLines'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (sections: CashDetailSections) => void
  title?: string
  description?: string
  cancelLabel?: string
  confirmLabel?: string
  busy?: boolean
}

/**
 * Elige qué secciones lleva el ticket de detalle de caja. Siempre se abre con todo marcado; el
 * encabezado, el resumen/cuadre y las ventas por método de pago se imprimen siempre.
 */
export function CashDetailSectionsModal({
  open,
  onClose,
  onConfirm,
  title = 'Imprimir detalle de caja',
  description = 'Elige qué secciones incluir en el ticket.',
  cancelLabel = 'Cancelar',
  confirmLabel = 'Imprimir',
  busy = false,
}: Props) {
  const [sections, setSections] = useState<CashDetailSections>(allCashDetailSections)

  // Cada vez que se abre vuelve a marcarse todo.
  useEffect(() => {
    if (open) setSections(allCashDetailSections())
  }, [open])

  const noneChecked = CASH_DETAIL_SECTION_OPTIONS.every((o) => !sections[o.key])

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-md w-full mx-2 sm:mx-0">
      <div className="flex items-center gap-2">
        <Printer size={20} className="text-gray-700" />
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">{title}</h3>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
      <div className="space-y-2">
        {CASH_DETAIL_SECTION_OPTIONS.map((o) => (
          <label key={o.key} className="flex items-start gap-2 cursor-pointer rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={sections[o.key]}
              onChange={(e) => setSections((prev) => ({ ...prev, [o.key]: e.target.checked }))}
              className="mt-0.5 rounded border-gray-300"
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">{o.label}</span>
              <span className="block text-xs text-gray-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {noneChecked
          ? 'Sin secciones opcionales: solo se imprimirá el resumen, el cuadre de caja y las ventas por método de pago.'
          : 'Siempre se incluyen el encabezado, el resumen con el cuadre de caja y las ventas por método de pago.'}
      </p>
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(sections)}
          className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
