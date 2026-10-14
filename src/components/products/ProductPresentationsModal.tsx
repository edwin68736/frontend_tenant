import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ProductPresentationsEditor } from '@/components/products/ProductPresentationsEditor'
import type { ProductPresentation } from '@/services/products.service'

type Props = {
  open: boolean
  productName?: string
  presentations: ProductPresentation[]
  onClose: () => void
  onSave: (presentations: ProductPresentation[]) => void
  /** true con manage_stock activo: permite fijar el stock inicial de cada presentación nueva
   *  (fila sin id), tanto al crear el producto como al agregar una en una edición posterior. */
  showInitialStock?: boolean
  /** Stock actual (todas las sucursales) por id de presentación — ver ProductPresentationsEditor. */
  stockByPresentation?: Record<number, number>
}

export function ProductPresentationsModal({
  open,
  productName,
  presentations,
  onClose,
  onSave,
  showInitialStock,
  stockByPresentation,
}: Props) {
  const initialDraft = () => (presentations.length > 0 ? presentations : [{ name: '', sale_price: 0 }])
  const [draft, setDraft] = useState<ProductPresentation[]>(initialDraft)
  // El borrador se resetea en el mismo render en que se abre el modal (no en un useEffect): con
  // el efecto, el primer cuadro pintaba el borrador anterior — una fila vacía al abrir por primera
  // vez — y parecía que el producto había perdido sus presentaciones.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setDraft(initialDraft())
  }

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
          <ProductPresentationsEditor presentations={draft} onChange={setDraft} embedded showInitialStock={showInitialStock} stockByPresentation={stockByPresentation} />
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
