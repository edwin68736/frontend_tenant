import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { companyService, type BranchRow } from '@/services/company.service'
import { productsService, type ProductBranchPrice } from '@/services/products.service'

type Props = {
  open: boolean
  productId: number
  productName?: string
  /** Precio global del producto — para explicar el fallback cuando una sucursal no tiene override. */
  globalSalePrice: number
  onClose: () => void
  /** Se llama tras crear/editar/eliminar con éxito. */
  onChanged?: () => void
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } }
  return err?.response?.data?.error ?? fallback
}

function money(n: number | null | undefined): string {
  return `S/ ${Number(n ?? 0).toFixed(2)}`
}

/**
 * Precio por sucursal de un producto "normal" (sin unidades de venta) — acceso directo desde el
 * campo "Precio de venta" en la pestaña General de Alta/Edición de producto. Independiente de
 * SaleUnitBranchPricesPanel a propósito: ese reemplaza a toda una unidad de venta (con niveles
 * price1/2/3 y factor de conversión); esto es solo el precio base del producto, un valor por
 * sucursal, para no forzar el concepto de "unidad de venta" en el caso simple.
 *
 * A diferencia de SaleUnitBranchPricesPanel (Configurar → formulario aparte por sucursal), el
 * campo de precio de cada sucursal está siempre visible en la lista — un solo paso para guardar,
 * sin un "Configurar" intermedio (pedido explícito del usuario, 28-sep-2026: "ya parece tomar
 * varios pasos para eso").
 */
export function ProductBranchPricesPanel({
  open,
  productId,
  productName,
  globalSalePrice,
  onClose,
  onChanged,
}: Props) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('products.create') || hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [branches, setBranches] = useState<BranchRow[]>([])
  const [branchPrices, setBranchPrices] = useState<ProductBranchPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, number>>({})
  const [savingBranchId, setSavingBranchId] = useState<number | null>(null)
  const [deletingBranchId, setDeletingBranchId] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!productId) return
    setLoading(true)
    Promise.all([companyService.listBranches(), productsService.listProductBranchPrices(productId)])
      .then(([b, bp]) => {
        setBranches(Array.isArray(b) ? b : [])
        setBranchPrices(Array.isArray(bp) ? bp : [])
        setDrafts(Object.fromEntries((bp ?? []).map((row) => [row.branch_id, row.sale_price])))
      })
      .catch(() => toast.error('Error al cargar los precios por sucursal'))
      .finally(() => setLoading(false))
  }, [productId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const setDraft = (branchId: number, value: number) => {
    setDrafts((d) => ({ ...d, [branchId]: value }))
  }

  const handleSave = async (branchId: number) => {
    if (!productId) {
      toast.error('No se encontró el producto — cierra y vuelve a intentarlo')
      return
    }
    const price = drafts[branchId] ?? 0
    if (!(price > 0)) {
      toast.error('El precio debe ser mayor a 0.')
      return
    }
    const existing = branchPrices.find((bp) => bp.branch_id === branchId)
    const payload: ProductBranchPrice = { branch_id: branchId, sale_price: price, active: true }
    setSavingBranchId(branchId)
    try {
      if (existing) {
        const updated = await productsService.updateProductBranchPrice(productId, branchId, payload)
        setBranchPrices((prev) => prev.map((bp) => (bp.branch_id === branchId ? updated : bp)))
      } else {
        const created = await productsService.createProductBranchPrice(productId, branchId, payload)
        setBranchPrices((prev) => [...prev, created])
      }
      toast.success('Precio de sucursal guardado')
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo guardar el precio de esta sucursal'))
    } finally {
      setSavingBranchId(null)
    }
  }

  const handleRemove = async (branchId: number) => {
    if (!productId) return
    setDeletingBranchId(branchId)
    try {
      await productsService.deleteProductBranchPrice(productId, branchId)
      setBranchPrices((prev) => prev.filter((bp) => bp.branch_id !== branchId))
      setDrafts((d) => {
        const next = { ...d }
        delete next[branchId]
        return next
      })
      toast.success('Precio de sucursal eliminado — esta sucursal volverá a usar el precio global')
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo eliminar el precio de esta sucursal'))
    } finally {
      setDeletingBranchId(null)
    }
  }

  const handleClose = () => {
    if (savingBranchId != null) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      stacked
      contentClassName="max-w-xl max-h-[min(92dvh,720px)] flex flex-col"
      closeOnBackdropClick={savingBranchId == null}
    >
      <div className="flex flex-col flex-1 min-h-0 -mx-1">
        <div className="pb-3 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900 text-lg">Precio por sucursal</h3>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{productName}</p>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            Precio de venta global: {money(globalSalePrice)}. Una sucursal sin precio específico
            usa este precio global.
          </p>
        </div>

        <div className="py-4 flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain touch-pan-y pr-1">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
            </div>
          ) : branches.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No hay sucursales registradas.</p>
          ) : (
            <div className="space-y-2">
              {branches.map((branch) => {
                const bp = branchPrices.find((b) => b.branch_id === branch.id)
                const draftValue = drafts[branch.id] ?? 0
                const dirty = bp ? draftValue !== bp.sale_price : draftValue > 0
                const isSaving = savingBranchId === branch.id
                const isDeleting = deletingBranchId === branch.id
                return (
                  <div key={branch.id} className="p-2.5 rounded-xl border border-gray-100 bg-white">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate flex-1 min-w-0">{branch.name}</p>
                      <div className="w-28 shrink-0">
                        <MoneyAmountInput
                          value={draftValue}
                          onChange={(v) => setDraft(branch.id, Math.max(0, v))}
                          emptyWhenZero
                          clearOnFocus
                          placeholder={money(globalSalePrice)}
                          disabled={!canEdit || isSaving || isDeleting}
                          className="w-full min-h-[38px] border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm tabular-nums"
                        />
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void handleSave(branch.id)}
                          disabled={!dirty || isSaving || isDeleting || !(draftValue > 0)}
                          title="Guardar precio de esta sucursal"
                          aria-label="Guardar precio de esta sucursal"
                          className="shrink-0 p-2 rounded-lg bg-[rgb(var(--p600))] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        >
                          <Save size={14} aria-hidden />
                        </button>
                      )}
                      {bp && canDelete && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(branch.id)}
                          disabled={isSaving || isDeleting}
                          title="Quitar precio de esta sucursal"
                          aria-label="Quitar precio de esta sucursal"
                          className="shrink-0 p-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          <X size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {bp
                        ? `Precio específico activo: ${money(bp.sale_price)}.`
                        : `Sin precio específico — usa el global ${money(globalSalePrice)}.`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={savingBranchId != null}
            className="w-full min-h-[48px] py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
