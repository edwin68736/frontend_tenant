import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RotateCcw, Plus, Eye, Download, Ticket, RefreshCw } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { inventoryService, type TransferListItem } from '@/services/inventory.service'
import {
  downloadInventoryTransferPdf,
  openInventoryTransferPdfViewer,
  transferCode,
  type TransferPdfFormat,
} from '@/utils/inventoryTransferPdf'

export default function InventoryTransferHistoryPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryTransferHistoryContent />
    </RequireModule>
  )
}

function InventoryTransferHistoryContent() {
  const [transfers, setTransfers] = useState<TransferListItem[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all')
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  /** ID de transferencia para el diálogo de confirmar recepción; null = cerrado */
  const [confirmDialogTransferId, setConfirmDialogTransferId] = useState<number | null>(null)
  /** ID de transferencia para el diálogo de cancelar; null = cerrado */
  const [cancelDialogTransferId, setCancelDialogTransferId] = useState<number | null>(null)

  /** Botón de comprobante en curso (`id:formato:modo`) para mostrar el spinner solo en ese. */
  const [pdfBusyKey, setPdfBusyKey] = useState<string | null>(null)

  const handlePdf = async (t: TransferListItem, format: TransferPdfFormat, mode: 'view' | 'download') => {
    setPdfBusyKey(`${t.id}:${format}:${mode}`)
    try {
      if (mode === 'view') await openInventoryTransferPdfViewer(t, format)
      else await downloadInventoryTransferPdf(t, format)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el comprobante')
    } finally {
      setPdfBusyKey(null)
    }
  }

  const loadTransfers = useCallback(() => {
    inventoryService
      .listTransfers({ limit: 50 })
      .then(setTransfers)
      .catch(() => toast.error('Error cargando transferencias'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadTransfers()
  }, [loadTransfers])

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

  const filteredTransfers = transfers.filter(t => statusFilter === 'all' || t.status === statusFilter)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Historial de transferencias</h2>
          <p className="text-sm text-gray-500">
            Enviado = stock reservado en origen. Al confirmar en destino se suma el stock allí y ya no se puede cancelar.
          </p>
        </div>
        <Link
          to="/inventory/transfers"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus size={14} /> Nueva transferencia
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <RotateCcw size={16} /> Transferencias — Estados
          </h3>
          <select
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Enviado</option>
            <option value="confirmed">Confirmado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2">N°</th>
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-left py-2 px-2">Origen → Destino</th>
                <th className="text-left py-2 px-2">Productos</th>
                <th className="text-center py-2 px-2 w-28">Estado</th>
                <th className="text-center py-2 px-2 w-28">Comprobante</th>
                <th className="text-right py-2 px-2 w-40">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.map(t => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-2 px-2 font-mono text-gray-700 whitespace-nowrap">{transferCode(t.id)}</td>
                  <td className="py-2 px-2 text-gray-600">
                    {new Date(t.created_at).toLocaleString()}
                    {t.created_by_name && <div className="text-[11px] text-gray-400">{t.created_by_name}</div>}
                  </td>
                  <td className="py-2 px-2">
                    <span className="font-medium">{t.from_branch_name}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-medium">{t.to_branch_name}</span>
                  </td>
                  <td className="py-2 px-2">
                    {t.lines.map((l, i) => (
                      <span key={i} className="mr-2">
                        {l.product_name}{l.presentation_name ? ` — ${l.presentation_name}` : ''} × {l.quantity}{l.with_serials ? ' (series)' : ''}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {t.status === 'pending' && <span className="text-amber-600 text-xs font-medium">Enviado</span>}
                    {t.status === 'confirmed' && <span className="text-green-600 text-xs font-medium">Confirmado</span>}
                    {t.status === 'cancelled' && <span className="text-gray-500 text-xs">Cancelado</span>}
                  </td>
                  <td className="py-2 px-2">
                    <span className="flex gap-0.5 justify-center">
                      {([
                        { format: 'a4', mode: 'view', title: 'Ver comprobante A4', icon: <Eye size={14} />, cls: 'text-red-600 hover:bg-red-50' },
                        { format: 'a4', mode: 'download', title: 'Descargar comprobante A4', icon: <Download size={14} />, cls: 'text-red-600 hover:bg-red-50' },
                        { format: 'ticket', mode: 'view', title: 'Ver comprobante ticket', icon: <Ticket size={14} />, cls: 'text-orange-700 hover:bg-orange-50' },
                      ] as const).map(b => {
                        const key = `${t.id}:${b.format}:${b.mode}`
                        return (
                          <button
                            key={key}
                            type="button"
                            title={b.title}
                            aria-label={b.title}
                            disabled={pdfBusyKey !== null}
                            onClick={() => void handlePdf(t, b.format, b.mode)}
                            className={`p-1.5 rounded-lg disabled:opacity-40 ${b.cls}`}
                          >
                            {pdfBusyKey === key ? <RefreshCw size={14} className="animate-spin" /> : b.icon}
                          </button>
                        )
                      })}
                    </span>
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
              {filteredTransfers.length === 0 && (
                <tr>
                  <td colSpan={7}className="py-6 text-center text-gray-400 text-xs">
                    {transfers.length === 0 ? 'Sin transferencias' : 'Sin transferencias con este estado'}
                  </td>
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
