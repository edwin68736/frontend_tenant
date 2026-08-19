import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { companyService } from '@/services/company.service'
import { inventoryService, type TransferListItem } from '@/services/inventory.service'
import { productsService, type Product, type ProductPresentation } from '@/services/products.service'

type Branch = { id: number; name: string }

/** Transferir (y gestionar transferencias existentes) de UN producto, sin salir de inventario. */
export function ProductTransferModal({
  product,
  defaultBranchId,
  onClose,
  onChanged,
}: {
  product: Product
  defaultBranchId: number
  onClose: () => void
  /** Se llama tras crear/confirmar/cancelar: el stock de este producto pudo cambiar. */
  onChanged: () => void
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [fromBranchId, setFromBranchId] = useState<number | undefined>(defaultBranchId || undefined)
  const [toBranchId, setToBranchId] = useState<number | undefined>()
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [availableStock, setAvailableStock] = useState<number | null>(null)
  const [presentations, setPresentations] = useState<ProductPresentation[]>([])
  const [presentationId, setPresentationId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!product.has_variants) return
    productsService.get(product.id).then((d) => setPresentations(d.presentations ?? []))
  }, [product.id, product.has_variants])

  const [transfers, setTransfers] = useState<TransferListItem[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(true)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [confirmDialogId, setConfirmDialogId] = useState<number | null>(null)
  const [cancelDialogId, setCancelDialogId] = useState<number | null>(null)

  const loadTransfers = useCallback(() => {
    setLoadingTransfers(true)
    inventoryService
      .listTransfers({ limit: 50 })
      .then((list) => setTransfers((list ?? []).filter((t) => t.lines.some((l) => l.product_id === product.id))))
      .catch(() => {})
      .finally(() => setLoadingTransfers(false))
  }, [product.id])

  useEffect(() => {
    companyService.listBranches().then((b) => {
      const list = (b ?? []) as Branch[]
      setBranches(list)
      if (!defaultBranchId && list.length > 0) setFromBranchId(list[0].id)
    })
  }, [defaultBranchId])

  useEffect(() => { loadTransfers() }, [loadTransfers])

  useEffect(() => {
    if (!fromBranchId) { setAvailableStock(null); return }
    inventoryService.getStock(product.id, fromBranchId).then((stocks) => {
      const rows = stocks.filter((s) => s.branch_id === fromBranchId)
      // Con presentaciones, la API ahora devuelve una fila por presentación (antes era un
      // único total agregado) — filtrar a la elegida en cuanto haya una, y mientras tanto
      // sumar todas para seguir mostrando el agregado del producto en esa sucursal.
      if (presentationId) {
        const row = rows.find((s) => s.presentation_id === presentationId)
        setAvailableStock(row ? row.quantity : 0)
      } else {
        setAvailableStock(rows.reduce((sum, s) => sum + Number(s.quantity), 0))
      }
    })
  }, [product.id, fromBranchId, presentationId])

  const handleSubmit = async () => {
    if (!fromBranchId || !toBranchId) { toast.error('Selecciona sucursal origen y destino'); return }
    if (fromBranchId === toBranchId) { toast.error('Origen y destino deben ser distintas sucursales'); return }
    if (product.has_variants && presentations.length > 0 && !presentationId) {
      toast.error('Selecciona la presentación (color/variante) a transferir')
      return
    }
    const qty = product.manage_series ? Math.floor(quantity) : quantity
    if (qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }
    // Con presentación, "availableStock" es el agregado del producto, no el de esa variante: se
    // deja que el backend valide el saldo real de la presentación.
    if (!presentationId && availableStock != null && qty > availableStock) {
      toast.error(`Stock insuficiente en origen. Disponible: ${availableStock}`)
      return
    }
    setSaving(true)
    try {
      await inventoryService.createTransfer({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        notes,
        items: [{ product_id: product.id, presentation_id: presentationId ?? undefined, quantity: qty }],
      })
      toast.success('Transferencia enviada. Confirma la recepción en la sucursal destino.')
      setQuantity(1)
      setNotes('')
      loadTransfers()
      onChanged()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al registrar transferencia')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async (id: number) => {
    setConfirmingId(id)
    try {
      await inventoryService.confirmTransfer(id)
      toast.success('Transferencia confirmada')
      loadTransfers()
      onChanged()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al confirmar')
    } finally {
      setConfirmingId(null)
      setConfirmDialogId(null)
    }
  }

  const handleCancel = async (id: number) => {
    setCancellingId(id)
    try {
      await inventoryService.cancelTransfer(id)
      toast.success('Transferencia cancelada')
      loadTransfers()
      onChanged()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al cancelar')
    } finally {
      setCancellingId(null)
      setCancelDialogId(null)
    }
  }

  return (
    <Modal open onClose={onClose} contentClassName="max-w-2xl w-full !p-0 !space-y-0 flex flex-col max-h-[85vh] !overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Transferir — {product.name}</h3>
          <p className="text-xs text-gray-400 font-mono">{product.code || 'Sin código'}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde sucursal</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={fromBranchId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined
                  setFromBranchId(val)
                  if (val === toBranchId) setToBranchId(undefined)
                }}
              >
                <option value="">Selecciona origen</option>
                {branches.filter((b) => b.id !== toBranchId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {availableStock != null && (
                <p className="text-xs text-gray-400 mt-1">Disponible: {availableStock}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hacia sucursal</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={toBranchId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined
                  setToBranchId(val)
                  if (val === fromBranchId) setFromBranchId(undefined)
                }}
              >
                <option value="">Selecciona destino</option>
                {branches.filter((b) => b.id !== fromBranchId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          {product.has_variants && presentations.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Presentación (color/variante)</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={presentationId ?? ''}
                onChange={(e) => setPresentationId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Selecciona presentación</option>
                {presentations.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
            <input
              type="number"
              min={product.manage_series ? 1 : 0.01}
              step={product.manage_series ? 1 : 0.01}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={quantity}
              onChange={(e) => setQuantity(product.manage_series ? Math.max(0, Math.floor(Number(e.target.value) || 0)) : Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Traslado para sucursal 2"
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <ArrowRightLeft size={14} />
            {saving ? 'Enviando...' : 'Enviar transferencia'}
          </button>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Transferencias de este producto</h4>
          {loadingTransfers ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2">Fecha</th>
                    <th className="text-left py-2 px-2">Origen → Destino</th>
                    <th className="text-right py-2 px-2">Cantidad</th>
                    <th className="text-center py-2 px-2">Estado</th>
                    <th className="text-right py-2 px-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => {
                    const line = t.lines.find((l) => l.product_id === product.id)
                    return (
                      <tr key={t.id} className="border-b border-gray-50">
                        <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="py-2 px-2">
                          <span className="font-medium">{t.from_branch_name}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="font-medium">{t.to_branch_name}</span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {line?.quantity ?? '—'}
                          {line?.presentation_name && (
                            <span className="block text-[10px] text-gray-400 font-sans">{line.presentation_name}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {t.status === 'pending' && <span className="text-amber-600 font-medium">Enviado</span>}
                          {t.status === 'confirmed' && <span className="text-green-600 font-medium">Confirmado</span>}
                          {t.status === 'cancelled' && <span className="text-gray-500">Cancelado</span>}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {t.status === 'pending' && (
                            <span className="flex gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setConfirmDialogId(t.id)}
                                disabled={confirmingId !== null}
                                className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 disabled:opacity-50"
                              >
                                {confirmingId === t.id ? '...' : 'Confirmar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelDialogId(t.id)}
                                disabled={cancellingId !== null}
                                className="px-2 py-1 rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50 disabled:opacity-50"
                              >
                                {cancellingId === t.id ? '...' : 'Cancelar'}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-400">Sin transferencias registradas para este producto</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialogId != null}
        onClose={() => setConfirmDialogId(null)}
        onConfirm={async () => { if (confirmDialogId != null) await handleConfirm(confirmDialogId) }}
        title="Confirmar recepción en destino"
        message="El stock se sumará en la sucursal destino y ya no se podrá cancelar esta transferencia."
        confirmLabel="Confirmar recepción"
        loading={confirmingId !== null}
      />
      <ConfirmDialog
        open={cancelDialogId != null}
        onClose={() => setCancelDialogId(null)}
        onConfirm={async () => { if (cancelDialogId != null) await handleCancel(cancelDialogId) }}
        title="Cancelar transferencia"
        message="El stock volverá a la sucursal origen. Esta acción solo aplica a transferencias en estado Enviado."
        confirmLabel="Cancelar transferencia"
        variant="danger"
        loading={cancellingId !== null}
      />
    </Modal>
  )
}
