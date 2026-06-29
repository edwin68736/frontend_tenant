import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Search, X, Eye, Ban, Receipt } from 'lucide-react'
import { purchasesService, type Purchase, type PurchaseDetail } from '@/services/purchases.service'
import { companyService, type SeriesRow } from '@/services/company.service'
import { FiscalRetentionPerceptionModal } from '@/components/billing/FiscalRetentionPerceptionModal'
import {
  FISCAL_DOC_SERIES_SETTINGS_PATH,
  filterSeriesBySunatCode,
  fiscalSeriesMissingMessage,
  hasFiscalSeriesForCode,
} from '@/utils/fiscalDocSeries'
import { buildRetentionPrefillFromPurchase, type FiscalRetentionPerceptionPrefill } from '@/utils/fiscalRetentionPerceptionPrefill'
import { LinkedFiscalDocPanel, type LinkedFiscalDoc } from '@/components/billing/LinkedFiscalDocPanel'
import { FiscalLinkedDocBadge } from '@/components/billing/FiscalLinkedDocBadge'
import RequireModule from '@/components/ui/RequireModule'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatDisplayDatePeru } from '@/utils/datesPeru'

export default function PurchasesPage() {
  return (
    <RequireModule moduleKey="purchases">
      <PurchasesContent />
    </RequireModule>
  )
}

function PurchasesContent() {
  const { hasPermission } = useAuth()
  const location = useLocation()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<PurchaseDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [confirmVoidId, setConfirmVoidId] = useState<number | null>(null)
  const [creModalOpen, setCreModalOpen] = useState(false)
  const [crePrefill, setCrePrefill] = useState<FiscalRetentionPerceptionPrefill | null>(null)
  const [retentionSeries, setRetentionSeries] = useState<SeriesRow[]>([])
  const [linkedRetention, setLinkedRetention] = useState<LinkedFiscalDoc | null>(null)
  const [creSourcePurchaseId, setCreSourcePurchaseId] = useState<number | null>(null)

  const load = () =>
    purchasesService
      .list({ q })
      .then(({ data }) => setPurchases(data ?? []))
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [q])

  useEffect(() => {
    companyService.listSeries({})
      .then((rows) => setRetentionSeries(filterSeriesBySunatCode(rows ?? [], '20')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = (location.state as { openPurchaseId?: number } | null)?.openPurchaseId
    if (id) void openDetail(id)
  }, [location.state])

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const d = await purchasesService.get(id)
      setDetail(d)
      setLinkedRetention(d.linked_retention ?? null)
    } catch {
      toast.error('Error al cargar detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  const openEmitCre = () => {
    if (!detail) return
    if (!detail.purchase.contact_id) {
      toast.error('Asigne un proveedor (contacto) a la compra antes de emitir la retención')
      return
    }
    if (!hasFiscalSeriesForCode(retentionSeries, '20')) {
      toast.error(fiscalSeriesMissingMessage('20'), {
        action: {
          label: 'Ir a series',
          onClick: () => { window.location.href = FISCAL_DOC_SERIES_SETTINGS_PATH },
        },
      })
      return
    }
    setCrePrefill(buildRetentionPrefillFromPurchase(detail))
    setCreSourcePurchaseId(detail.purchase.id)
    setCreModalOpen(true)
  }

  const handleVoid = async (id: number) => {
    setVoiding(true)
    try {
      await purchasesService.void(id)
      toast.success('Compra anulada')
      setDetail(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al anular')
    } finally {
      setVoiding(false)
    }
  }

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
          <h2 className="text-lg font-bold text-gray-800">Compras</h2>
          <p className="text-sm text-gray-500">Listado de compras registradas</p>
        </div>
        {hasPermission('purchases.create') && (
          <Link
            to="/purchases/register"
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> Nueva compra
          </Link>
        )}
      </div>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Fecha', 'Comprobante', 'Proveedor', 'Total', 'CRE', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDisplayDatePeru(p.issue_date)}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-500">{p.doc_type}</p>
                    <p className="font-mono font-bold text-gray-800">
                      {p.series || ''}
                      {p.series ? '-' : ''}
                      {String(p.number).padStart(8, '0')}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.supplier_name ?? p.contact_name ?? 'Sin proveedor'}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">S/ {Number(p.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {p.linked_retention ? (
                      <FiscalLinkedDocBadge
                        doc={p.linked_retention}
                        kind="retention"
                        onClick={() => openDetail(p.id)}
                      />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {p.status === 'cancelled' ? 'Anulada' : 'Recibida'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openDetail(p.id)}
                        className="p-1.5 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                        title="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>
                      {p.status !== 'cancelled' && hasPermission('purchases.delete') && (
                        <button
                          type="button"
                          onClick={() => setConfirmVoidId(p.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Anular compra"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {purchases.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">Sin compras registradas</div>
        )}
      </div>

      <Modal open={detailLoading || !!detail} onClose={() => setDetail(null)} contentClassName="max-w-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800">Detalle de compra</h3>
          <button type="button" onClick={() => setDetail(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          detail && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Tipo</p>
                  <p className="font-medium">{detail.purchase.doc_type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">N° Comprobante</p>
                  <p className="font-mono font-medium">
                    {detail.purchase.series}-{String(detail.purchase.number).padStart(8, '0')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p>{formatDisplayDatePeru(detail.purchase.issue_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Proveedor</p>
                  <p>{detail.purchase.supplier_name ?? detail.purchase.contact_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Estado</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      detail.purchase.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {detail.purchase.status === 'cancelled' ? 'Anulada' : 'Recibida'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ítems</p>
                <div className="space-y-1">
                  {(detail.items ?? []).map((item, i) => (
                    <div key={i} className="py-1.5 border-b border-gray-50">
                      <div className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{item.description}</p>
                          <p className="text-xs text-gray-400">
                            {item.quantity} × S/ {Number(item.unit_cost).toFixed(2)}
                          </p>
                          {(item.serials ?? []).length > 0 && (
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                              Series: {(item.serials ?? []).join(', ')}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold text-gray-700">
                          S/ {(item.quantity * item.unit_cost).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>S/ {Number(detail.purchase.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>IGV</span>
                    <span>S/ {Number(detail.purchase.tax_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>Total</span>
                    <span>S/ {Number(detail.purchase.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {linkedRetention && detail && (
                <LinkedFiscalDocPanel
                  doc={linkedRetention}
                  onStatusRefresh={(updated) => setLinkedRetention(updated)}
                  origin={{
                    label: `${detail.purchase.series}-${String(detail.purchase.number).padStart(8, '0')}`,
                    sublabel: 'Compra origen',
                  }}
                />
              )}
              {detail.purchase.status !== 'cancelled' && hasPermission('billing.send') && !linkedRetention && (
                <button
                  type="button"
                  onClick={openEmitCre}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
                >
                  <Receipt size={14} /> Emitir comprobante de retención
                </button>
              )}
              {detail.purchase.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => setConfirmVoidId(detail.purchase.id)}
                  disabled={voiding}
                  className="w-full py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  {voiding ? 'Anulando...' : 'Anular compra'}
                </button>
              )}
            </div>
          )
        )}
      </Modal>

      <ConfirmDialog
        open={confirmVoidId != null}
        onClose={() => setConfirmVoidId(null)}
        onConfirm={async () => {
          if (confirmVoidId != null) await handleVoid(confirmVoidId)
        }}
        title="Anular compra"
        message="Se revertirá el stock, el kardex y los seriales de los productos. ¿Continuar?"
        confirmLabel="Anular compra"
        cancelLabel="Cancelar"
        variant="danger"
        loading={voiding}
      />

      <FiscalRetentionPerceptionModal
        mode="retention"
        open={creModalOpen}
        prefill={crePrefill}
        onClose={() => {
          setCreModalOpen(false)
          setCrePrefill(null)
        }}
        onCreated={() => {
          setCreModalOpen(false)
          setCrePrefill(null)
          const pid = creSourcePurchaseId
          setCreSourcePurchaseId(null)
          if (pid) {
            void purchasesService.get(pid).then((d) => {
              setLinkedRetention(d.linked_retention ?? null)
              setDetail(d)
            })
          }
          toast.success('Retención registrada.')
        }}
      />
    </div>
  )
}
