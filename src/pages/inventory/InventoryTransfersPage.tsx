import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, Package, Plus, Trash2, RotateCcw, Search, X } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { companyService } from '@/services/company.service'
import { productsService, type Product } from '@/services/products.service'
import { inventoryService, type TransferInput, type TransferListItem } from '@/services/inventory.service'

const PER_PAGE = 10

interface TransferItem extends Omit<TransferInput, 'from_branch_id' | 'to_branch_id'> {
  tempId: number
  product_name?: string
  product_manage_series?: boolean
}

interface Branch {
  id: number
  name: string
}

export default function InventoryTransfersPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryTransfersContent />
    </RequireModule>
  )
}

function InventoryTransfersContent() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [fromBranchId, setFromBranchId] = useState<number | undefined>()
  const [toBranchId, setToBranchId] = useState<number | undefined>()
  const [items, setItems] = useState<TransferItem[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nextTempId, setNextTempId] = useState(1)
  const [transfers, setTransfers] = useState<TransferListItem[]>([])
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  /** ID de transferencia para el diálogo de confirmar recepción; null = cerrado */
  const [confirmDialogTransferId, setConfirmDialogTransferId] = useState<number | null>(null)
  /** ID de transferencia para el diálogo de cancelar; null = cerrado */
  const [cancelDialogTransferId, setCancelDialogTransferId] = useState<number | null>(null)

  // Modal agregar productos
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [modalPage, setModalPage] = useState(1)
  const [modalProducts, setModalProducts] = useState<Product[]>([])
  const [modalTotal, setModalTotal] = useState(0)
  const [modalLoading, setModalLoading] = useState(false)
  const [stockByProduct, setStockByProduct] = useState<Record<number, number>>({})
  const [addingProductId, setAddingProductId] = useState<number | null>(null)

  const loadTransfers = useCallback(() => {
    inventoryService.listTransfers({ limit: 50 }).then(setTransfers).catch(() => {})
  }, [])

  useEffect(() => {
    loadTransfers()
  }, [loadTransfers])

  useEffect(() => {
    companyService
      .listBranches()
      .then(b => {
        const brs = (b ?? []) as Branch[]
        setBranches(brs)
        if (!fromBranchId && brs.length > 0) setFromBranchId(brs[0].id)
      })
      .catch(() => toast.error('Error cargando sucursales'))
      .finally(() => setLoading(false))
  }, [])

  const loadModalProducts = useCallback(() => {
    if (!modalOpen) return
    setModalLoading(true)
    productsService
      .list(modalSearch, undefined, undefined, true, modalPage, PER_PAGE, true)
      .then(({ data, total }) => {
        setModalProducts(data)
        setModalTotal(total ?? 0)
      })
      .catch(() => toast.error('Error cargando productos'))
      .finally(() => setModalLoading(false))
  }, [modalOpen, modalSearch, modalPage])

  useEffect(() => {
    loadModalProducts()
  }, [loadModalProducts])

  useEffect(() => {
    if (!fromBranchId || modalProducts.length === 0) {
      setStockByProduct({})
      return
    }
    const map: Record<number, number> = {}
    let cancelled = false
    Promise.all(
      modalProducts.map(p =>
        inventoryService.getStock(p.id, fromBranchId).then(stocks => {
          if (cancelled) return
          const row = stocks.find(s => s.branch_id === fromBranchId)
          map[p.id] = row ? row.quantity : 0
        })
      )
    ).then(() => {
      if (!cancelled) setStockByProduct(prev => ({ ...prev, ...map }))
    })
    return () => { cancelled = true }
  }, [fromBranchId, modalProducts])

  const updateRow = (tempId: number, patch: Partial<TransferItem>) => {
    setItems(prev => prev.map(it => (it.tempId === tempId ? { ...it, ...patch } : it)))
  }

  const removeRow = (tempId: number) => {
    setItems(prev => prev.filter(it => it.tempId !== tempId))
  }

  const addProductToTransfer = (p: Product) => {
    setAddingProductId(p.id)
    const existing = items.find(it => it.product_id === p.id)
    if (existing) {
      const newQty = existing.quantity + 1
      const maxAllowed = fromBranchId ? (stockByProduct[p.id] ?? 0) : 99999
      if (p.manage_series && newQty > maxAllowed) {
        toast.error(`Stock en origen: ${maxAllowed}. No se puede sumar más.`)
        setAddingProductId(null)
        return
      }
      if (!p.manage_series && newQty > maxAllowed) {
        toast.error(`Stock en origen: ${maxAllowed}. No se puede sumar más.`)
        setAddingProductId(null)
        return
      }
      updateRow(existing.tempId, { quantity: newQty })
      toast.success(`Cantidad actualizada: ${existing.product_name} ahora ${newQty}`)
    } else {
      setItems(prev => [
        ...prev,
        {
          tempId: nextTempId,
          product_id: p.id,
          quantity: 1,
          product_name: p.name,
          product_manage_series: p.manage_series ?? false,
        },
      ])
      setNextTempId(id => id + 1)
      toast.success(`${p.name} agregado. Indica la cantidad en la lista.`)
    }
    setAddingProductId(null)
  }

  const openModal = () => {
    if (!fromBranchId) {
      toast.error('Selecciona primero la sucursal de origen')
      return
    }
    setModalSearch('')
    setModalPage(1)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!fromBranchId || !toBranchId) {
      toast.error('Selecciona sucursal origen y destino')
      return
    }
    if (fromBranchId === toBranchId) {
      toast.error('Origen y destino deben ser distintas sucursales')
      return
    }
    const validItems = items.filter(it => it.product_id && it.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Agrega al menos un producto con cantidad')
      return
    }
    setSaving(true)
    try {
      await inventoryService.createTransfer({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        notes,
        items: validItems.map(it => ({ product_id: it.product_id, quantity: it.quantity })),
      })
      toast.success('Transferencia enviada. Confirma la recepción en la sucursal destino.')
      setItems([])
      setNotes('')
      loadTransfers()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al registrar transferencia')
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
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al confirmar')
    } finally {
      setConfirmingId(null)
      setConfirmDialogTransferId(null)
    }
  }

  const handleCancel = async (id: number) => {
    setCancellingId(id)
    try {
      await inventoryService.cancelTransfer(id)
      toast.success('Transferencia cancelada')
      loadTransfers()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error al cancelar')
    } finally {
      setCancellingId(null)
      setCancelDialogTransferId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(modalTotal / PER_PAGE))

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Transferencias de inventario</h2>
          <p className="text-sm text-gray-500">
            Mueve stock entre sucursales. Agrega varios productos desde el modal de búsqueda.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 xl:col-span-1">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ArrowRightLeft size={16} /> Datos de la transferencia
          </h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={fromBranchId ?? ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setFromBranchId(val)
                if (val === toBranchId) setToBranchId(undefined)
              }}
            >
              <option value="">Selecciona origen</option>
              {branches.filter(b => b.id !== toBranchId).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hacia sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={toBranchId ?? ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setToBranchId(val)
                if (val === fromBranchId) setFromBranchId(undefined)
              }}
            >
              <option value="">Selecciona destino</option>
              {branches.filter(b => b.id !== fromBranchId).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Traslado para sucursal 2"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Package size={16} /> Productos a transferir
            </h3>
            <button
              type="button"
              onClick={openModal}
              className="flex items-center gap-1 px-3 py-1.5 bg-[rgb(var(--p600))] text-white rounded-xl text-xs font-medium hover:opacity-90"
            >
              <Plus size={14} /> Agregar productos
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2">Producto</th>
                  <th className="text-right py-2 px-2 w-24">Cantidad</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.tempId} className="border-b border-gray-50">
                    <td className="py-2 px-2">
                      <span className="font-medium">{it.product_name ?? `#${it.product_id}`}</span>
                      {it.product_manage_series && (
                        <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">Series</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min={it.product_manage_series ? 1 : 0}
                        step={it.product_manage_series ? 1 : 0.01}
                        className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-right"
                        value={it.quantity || ''}
                        onChange={e => {
                          const v = it.product_manage_series
                            ? Math.max(0, Math.floor(Number(e.target.value) || 0))
                            : Number(e.target.value) || 0
                          updateRow(it.tempId, { quantity: v })
                        }}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(it.tempId)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"
                        title="Quitar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-400 text-xs">
                      No hay productos. Haz clic en &quot;Agregar productos&quot; para buscar y añadir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              <ArrowRightLeft size={14} />
              {saving ? 'Enviando...' : 'Enviar transferencia'}
            </button>
          </div>
        </div>
      </div>

      {/* Portal a document.body: evita que fixed quede recortado por overflow/transform del layout */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        contentClassName="max-w-2xl w-full !p-0 !space-y-0 flex flex-col max-h-[85vh] !overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-800">Agregar productos a la transferencia</h3>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 border-b border-gray-100 flex gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
              placeholder="Buscar por nombre o código..."
              value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (setModalPage(1), loadModalProducts())}
            />
          </div>
          <button
            type="button"
            onClick={() => { setModalPage(1); loadModalProducts() }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
          >
            Buscar
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {modalLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2 w-24 text-right">Stock origen</th>
                  <th className="py-2 px-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {modalProducts.map(p => {
                  const available = fromBranchId ? (stockByProduct[p.id] ?? null) : null
                  const alreadyAdded = items.some(it => it.product_id === p.id)
                  return (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-2 px-2">
                        <div>
                          <span className="font-medium text-gray-800">{p.name}</span>
                          {p.code && <span className="text-gray-500 text-xs ml-1">({p.code})</span>}
                          {p.manage_series && (
                            <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">Con series</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {fromBranchId ? (available !== null ? available : '—') : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          type="button"
                          disabled={addingProductId === p.id}
                          onClick={() => addProductToTransfer(p)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {addingProductId === p.id ? '...' : alreadyAdded ? '+1' : 'Agregar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!modalLoading && modalProducts.length === 0 && (
            <p className="text-center text-gray-500 py-8">No hay productos con stock. Prueba otra búsqueda.</p>
          )}
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-500">
              Página {modalPage} de {totalPages} ({modalTotal} producto(s))
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={modalPage <= 1}
                onClick={() => setModalPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={modalPage >= totalPages}
                onClick={() => setModalPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </Modal>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <RotateCcw size={16} /> Transferencias — Estados
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Enviado = stock reservado en origen. Al confirmar en destino se suma el stock allí y ya no se puede cancelar.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-left py-2 px-2">Origen → Destino</th>
                <th className="text-left py-2 px-2">Productos</th>
                <th className="text-center py-2 px-2 w-28">Estado</th>
                <th className="text-right py-2 px-2 w-40">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-2 px-2 text-gray-600">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="py-2 px-2">
                    <span className="font-medium">{t.from_branch_name}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-medium">{t.to_branch_name}</span>
                  </td>
                  <td className="py-2 px-2">
                    {t.lines.map((l, i) => (
                      <span key={i} className="mr-2">
                        {l.product_name} × {l.quantity}{l.with_serials ? ' (series)' : ''}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {t.status === 'pending' && <span className="text-amber-600 text-xs font-medium">Enviado</span>}
                    {t.status === 'confirmed' && <span className="text-green-600 text-xs font-medium">Confirmado</span>}
                    {t.status === 'cancelled' && <span className="text-gray-500 text-xs">Cancelado</span>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {t.status === 'pending' && (
                      <span className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => setConfirmDialogTransferId(t.id)}
                          disabled={confirmingId !== null}
                          className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                        >
                          {confirmingId === t.id ? '...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelDialogTransferId(t.id)}
                          disabled={cancellingId !== null}
                          className="px-2 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancellingId === t.id ? '...' : 'Cancelar'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400 text-xs">Sin transferencias</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialogTransferId != null}
        onClose={() => setConfirmDialogTransferId(null)}
        onConfirm={async () => {
          if (confirmDialogTransferId != null) await handleConfirm(confirmDialogTransferId)
        }}
        title="Confirmar recepción en destino"
        message="El stock se sumará en la sucursal destino y ya no se podrá cancelar esta transferencia."
        confirmLabel="Confirmar recepción"
        loading={confirmingId !== null}
      />
      <ConfirmDialog
        open={cancelDialogTransferId != null}
        onClose={() => setCancelDialogTransferId(null)}
        onConfirm={async () => {
          if (cancelDialogTransferId != null) await handleCancel(cancelDialogTransferId)
        }}
        title="Cancelar transferencia"
        message="El stock volverá a la sucursal origen. Esta acción solo aplica a transferencias en estado Enviado."
        confirmLabel="Cancelar transferencia"
        variant="danger"
        loading={cancellingId !== null}
      />
    </div>
  )
}
