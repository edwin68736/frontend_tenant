import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { companyService, type BranchRow } from '@/services/company.service'
import { productsService, type SaleUnitBranchPrice } from '@/services/products.service'

type Props = {
  open: boolean
  productId: number
  saleUnitId: number
  saleUnitName?: string
  /** Precios globales de la SaleUnit — para explicar el fallback cuando una sucursal no tiene override. */
  globalPrice1: number
  globalPrice2?: number | null
  globalPrice3?: number | null
  onClose: () => void
  /** Se llama tras crear/editar/eliminar con éxito. */
  onChanged?: () => void
}

type FormDraft = { price1: number; price2: number | null; price3: number | null; active: boolean }

function emptyDraft(): FormDraft {
  return { price1: 0, price2: null, price3: null, active: true }
}

function draftFromRow(row: SaleUnitBranchPrice): FormDraft {
  return { price1: row.price1, price2: row.price2 ?? null, price3: row.price3 ?? null, active: row.active }
}

function validateDraft(d: FormDraft): string | null {
  if (!(d.price1 > 0)) return 'Price1 debe ser mayor a 0.'
  if (d.price2 != null && !(d.price2 > 0)) return 'Price2 debe ser mayor a 0 si se especifica.'
  if (d.price3 != null && !(d.price3 > 0)) return 'Price3 debe ser mayor a 0 si se especifica.'
  return null
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } }
  return err?.response?.data?.error ?? fallback
}

function money(n: number | null | undefined): string {
  return `S/ ${Number(n ?? 0).toFixed(2)}`
}

/**
 * Precios por sucursal (override) de UNA SaleUnit puntual — abierto desde el botón "Precios por
 * sucursal" de una fila ya guardada en SaleUnitsEditor. Es un panel/modal independiente (Fase 7D):
 * no reutiliza SaleUnitsEditor, ProductAttributesEditor ni ProductPresentationsEditor.
 *
 * Diseño deliberado: en vez de un editor de filas con "Guardar cambios" en bloque (como
 * SaleUnitsModal/ProductAttributesModal), cada sucursal se administra una a la vez — "Configurar"
 * si no tiene override, "Editar"/"Eliminar" si ya lo tiene. Esto hace estructuralmente imposible
 * ofrecer una sucursal ya configurada como si fuera nueva (Fase 7D, sección 19): cada sucursal solo
 * puede mostrar UNA de las dos acciones, nunca ambas, así que no hace falta ningún selector que
 * excluya sucursales duplicadas.
 *
 * NO implementa ninguna lógica de resolución de precio (eso es pkg/saleunit.ResolvePrice en el
 * backend, la única autoridad) — el texto de fallback aquí es puramente informativo.
 */
export function SaleUnitBranchPricesPanel({
  open,
  productId,
  saleUnitId,
  saleUnitName,
  globalPrice1,
  globalPrice2,
  globalPrice3,
  onClose,
  onChanged,
}: Props) {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [branches, setBranches] = useState<BranchRow[]>([])
  const [branchPrices, setBranchPrices] = useState<SaleUnitBranchPrice[]>([])
  const [loading, setLoading] = useState(false)

  const [formBranchId, setFormBranchId] = useState<number | null>(null)
  const [formDraft, setFormDraft] = useState<FormDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SaleUnitBranchPrice | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    if (!productId || !saleUnitId) return
    setLoading(true)
    Promise.all([companyService.listBranches(), productsService.listSaleUnitBranchPrices(productId, saleUnitId)])
      .then(([b, bp]) => {
        setBranches(Array.isArray(b) ? b : [])
        setBranchPrices(Array.isArray(bp) ? bp : [])
      })
      .catch(() => toast.error('Error al cargar los precios por sucursal'))
      .finally(() => setLoading(false))
  }, [productId, saleUnitId])

  useEffect(() => {
    if (open) {
      load()
      setFormBranchId(null)
      setDeleteTarget(null)
    }
  }, [open, load])

  const openConfigure = (branchId: number, existing: SaleUnitBranchPrice | undefined) => {
    setFormDraft(existing ? draftFromRow(existing) : emptyDraft())
    setFormBranchId(branchId)
  }

  const handleSaveForm = async () => {
    if (formBranchId == null) return
    // Salvavidas defensivo: con el guard de `open` en SaleUnitsModal.tsx esto ya no debería ser
    // alcanzable, pero evita en cualquier caso enviar una mutación contra el producto/unidad "0".
    if (!productId || !saleUnitId) {
      toast.error('No se encontró el producto o la unidad de venta — cierra y vuelve a intentarlo')
      return
    }
    const err = validateDraft(formDraft)
    if (err) {
      toast.error(err)
      return
    }
    const existing = branchPrices.find((bp) => bp.branch_id === formBranchId)
    const payload: SaleUnitBranchPrice = {
      branch_id: formBranchId,
      price1: formDraft.price1,
      price2: formDraft.price2,
      price3: formDraft.price3,
      active: formDraft.active,
    }
    setSaving(true)
    try {
      if (existing) {
        await productsService.updateSaleUnitBranchPrice(productId, saleUnitId, formBranchId, payload)
        toast.success('Precio de sucursal actualizado')
      } else {
        await productsService.createSaleUnitBranchPrice(productId, saleUnitId, formBranchId, payload)
        toast.success('Precio de sucursal creado')
      }
      setFormBranchId(null)
      load()
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo guardar el precio de esta sucursal'))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await productsService.deleteSaleUnitBranchPrice(productId, saleUnitId, deleteTarget.branch_id)
      toast.success('Precio de sucursal eliminado — esta sucursal volverá a usar el precio global')
      setBranchPrices((prev) => prev.filter((bp) => bp.branch_id !== deleteTarget.branch_id))
      setDeleteTarget(null)
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo eliminar el precio de esta sucursal'))
    } finally {
      setDeleting(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        stacked
        contentClassName="max-w-xl max-h-[min(92dvh,720px)] flex flex-col"
        closeOnBackdropClick={!saving}
      >
        <div className="flex flex-col flex-1 min-h-0 -mx-1">
          <div className="pb-3 border-b border-gray-100 shrink-0">
            <h3 className="font-bold text-gray-900 text-lg">Precios por sucursal</h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {saleUnitName ? `Unidad de venta: ${saleUnitName}` : null}
            </p>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Precio global de esta unidad: {money(globalPrice1)}
              {globalPrice2 != null ? ` / ${money(globalPrice2)}` : ''}
              {globalPrice3 != null ? ` / ${money(globalPrice3)}` : ''}. Una sucursal sin precio
              específico usa este precio global — nunca se multiplica por el factor de conversión.
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
                  const isEditingThis = formBranchId === branch.id
                  return (
                    <div key={branch.id} className="p-2.5 rounded-xl border border-gray-100 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{branch.name}</p>
                        {!isEditingThis && bp && (
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${bp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                          >
                            {bp.active ? 'Activo' : 'Inactivo'}
                          </span>
                        )}
                      </div>

                      {isEditingThis ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="w-full sm:w-28 shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Price1 S/</label>
                              <MoneyAmountInput
                                value={formDraft.price1}
                                onChange={(v) => setFormDraft((d) => ({ ...d, price1: Math.max(0, v) }))}
                                emptyWhenZero
                                placeholder="0.00"
                                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
                                autoFocus
                              />
                            </div>
                            <div className="w-full sm:w-28 shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                Price2 S/ <span className="text-gray-400">(opcional)</span>
                              </label>
                              <MoneyAmountInput
                                value={formDraft.price2 ?? 0}
                                onChange={(v) => setFormDraft((d) => ({ ...d, price2: v > 0 ? v : null }))}
                                emptyWhenZero
                                placeholder="0.00"
                                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
                              />
                            </div>
                            <div className="w-full sm:w-28 shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                Price3 S/ <span className="text-gray-400">(opcional)</span>
                              </label>
                              <MoneyAmountInput
                                value={formDraft.price3 ?? 0}
                                onChange={(v) => setFormDraft((d) => ({ ...d, price3: v > 0 ? v : null }))}
                                emptyWhenZero
                                placeholder="0.00"
                                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formDraft.active}
                              onChange={(e) => setFormDraft((d) => ({ ...d, active: e.target.checked }))}
                              className="rounded"
                            />
                            Activo
                          </label>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setFormBranchId(null)}
                              disabled={saving}
                              className="flex-1 min-h-[40px] py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveForm()}
                              disabled={saving}
                              className="flex-1 min-h-[40px] py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                              {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      ) : bp ? (
                        <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-gray-600">
                            {money(bp.price1)}
                            {bp.price2 != null ? ` / ${money(bp.price2)}` : ''}
                            {bp.price3 != null ? ` / ${money(bp.price3)}` : ''}
                          </p>
                          <div className="flex gap-1">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openConfigure(branch.id, bp)}
                                className="text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1 rounded-lg hover:bg-[rgb(var(--p100))]"
                              >
                                Editar
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(bp)}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-gray-400">
                            Sin precio específico — usará el precio global {money(globalPrice1)}.
                          </p>
                          {canCreate && (
                            <button
                              type="button"
                              onClick={() => openConfigure(branch.id, undefined)}
                              className="text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1 rounded-lg hover:bg-[rgb(var(--p100))]"
                            >
                              Configurar
                            </button>
                          )}
                        </div>
                      )}
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
              disabled={saving}
              className="w-full min-h-[48px] py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar precio de sucursal"
        message="¿Eliminar el precio específico de esta sucursal? La sucursal volverá a utilizar el precio global de esta unidad de venta."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        stacked
      />
    </>
  )
}
