import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ProductPresentationsEditor } from '@/components/products/ProductPresentationsEditor'
import type { ProductPresentation } from '@/services/products.service'

type Props = {
  open: boolean
  productName?: string
  presentations: ProductPresentation[]
  onClose: () => void
  onSave: (presentations: ProductPresentation[]) => void
}

export function ProductPresentationsModal({
  open,
  productName,
  presentations,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ProductPresentation[]>([])

  useEffect(() => {
    if (open) {
      setDraft(presentations.length > 0 ? presentations : [{ name: '', sale_price: 0 }])
    }
  }, [open, presentations])

  const handleSave = () => {
    const rows = draft
      .map((p) => ({
        ...p,
        name: p.name.trim(),
        sale_price: Math.round((Number(p.sale_price) || 0) * 100) / 100,
      }))
      .filter((p) => p.name.length > 0)
    onSave(rows)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="max-w-lg max-h-[min(92dvh,720px)] flex flex-col"
      closeOnBackdropClick={false}
    >
      <div className="flex flex-col flex-1 min-h-0 -mx-1">
        <div className="pb-3 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900 text-lg">Presentaciones</h3>
          {productName ? (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{productName}</p>
          ) : null}
        </div>
        <div className="py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          <ProductPresentationsEditor presentations={draft} onChange={setDraft} embedded />
        </div>
        <div className="pt-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 min-h-[48px] py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-semibold hover:opacity-90"
          >
            Guardar presentaciones
          </button>
        </div>
      </div>
    </Modal>
  )
}
