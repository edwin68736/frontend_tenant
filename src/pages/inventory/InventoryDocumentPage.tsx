import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  Eye,
  Pencil,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import {
  InventoryDocumentHeader,
  isHeaderUxValid,
  type InventoryDocumentHeaderValues,
} from '@/components/inventory/InventoryDocumentHeader'
import {
  InventoryDocumentLines,
  areLinesUxValid,
  type InventoryDocumentLineRow,
} from '@/components/inventory/InventoryDocumentLines'
import {
  InventoryDocumentToolbar,
  documentStatusClass,
  documentStatusLabel,
} from '@/components/inventory/InventoryDocumentToolbar'
import {
  inventoryService,
  type InventoryDocument,
  type InventoryDocumentDirection,
  type InventoryDocumentLine,
  type InventoryOperationType,
} from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import { productsService, type Product } from '@/services/products.service'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'

interface Branch {
  id: number
  name: string
}

export interface InventoryDocumentPageProps {
  direction: InventoryDocumentDirection
}

const PAGE_SIZE = 20

const META: Record<
  InventoryDocumentDirection,
  { title: string; subtitle: string; basePath: string }
> = {
  IN: {
    title: 'Ingresos de inventario',
    subtitle: 'Documentos de ingreso manual (Tabla 12 SUNAT)',
    basePath: '/inventory/ingress',
  },
  OUT: {
    title: 'Egresos de inventario',
    subtitle: 'Documentos de egreso manual (Tabla 12 SUNAT)',
    basePath: '/inventory/egress',
  },
}

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || 'Error en la operación'
}

export default function InventoryDocumentPage({ direction }: InventoryDocumentPageProps) {
  const meta = META[direction]
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { activeBranchId } = useBranch()

  const isNew = location.pathname.endsWith('/new')
  const isEdit = Boolean(id) && location.pathname.endsWith('/edit')
  const isForm = isNew || isEdit
  const canManage = hasPermission('inventory.manage')

  const [branches, setBranches] = useState<Branch[]>([])
  const [operationTypes, setOperationTypes] = useState<InventoryOperationType[]>([])
  const [loadingInit, setLoadingInit] = useState(true)

  // List state
  const [documents, setDocuments] = useState<InventoryDocument[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [listLoading, setListLoading] = useState(false)
  const [branchFilter, setBranchFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'confirmed' | 'voided'>('')
  const [searchQ, setSearchQ] = useState('')

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailDoc, setDetailDoc] = useState<InventoryDocument | null>(null)
  const [detailLines, setDetailLines] = useState<(InventoryDocumentLine & { product_name?: string })[]>([])

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: 'confirm' | 'void'; id: number } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Form state
  const [formLoading, setFormLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState<InventoryDocumentHeaderValues>({
    branch_id: 0,
    document_date: getTodayPeru(),
    operation_type_id: 0,
    reference: '',
    movement_reason: '',
    notes: '',
  })
  const [lines, setLines] = useState<InventoryDocumentLineRow[]>([])
  const [nextTempId, setNextTempId] = useState(1)
  const [pickerOpen, setPickerOpen] = useState(false)

  const operationTypeMap = useMemo(
    () => new Map(operationTypes.map(o => [o.id, o])),
    [operationTypes]
  )

  // Catálogo y sucursales: una sola carga al montar la pantalla
  useEffect(() => {
    let cancelled = false
    setLoadingInit(true)
    Promise.all([
      companyService.listBranches(),
      inventoryService.listOperationTypes({ direction, manual: true }),
    ])
      .then(([b, ops]) => {
        if (cancelled) return
        const brs = (b ?? []) as Branch[]
        setBranches(brs)
        setOperationTypes(ops)
        if (!isForm) {
          setHeader(h => ({
            ...h,
            branch_id: activeBranchId || brs[0]?.id || 0,
            operation_type_id: ops[0]?.id || 0,
          }))
        }
      })
      .catch(() => toast.error('Error cargando datos iniciales'))
      .finally(() => {
        if (!cancelled) setLoadingInit(false)
      })
    return () => {
      cancelled = true
    }
  }, [direction, activeBranchId, isForm])

  const loadDocuments = useCallback(() => {
    if (isForm) return
    setListLoading(true)
    inventoryService
      .listDocuments({
        direction,
        status: statusFilter || undefined,
        branch_id: branchFilter || undefined,
        page: listPage,
        per_page: PAGE_SIZE,
      })
      .then(({ data, total }) => {
        setDocuments(data)
        setListTotal(total)
      })
      .catch(() => toast.error('Error cargando documentos'))
      .finally(() => setListLoading(false))
  }, [direction, statusFilter, branchFilter, listPage, isForm])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    setListPage(1)
  }, [statusFilter, branchFilter])

  const filteredDocuments = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return documents
    return documents.filter(
      d =>
        (d.number || '').toLowerCase().includes(q) ||
        (d.reference || '').toLowerCase().includes(q)
    )
  }, [documents, searchQ])

  const branchName = (branchId: number) => branches.find(b => b.id === branchId)?.name || `Sucursal ${branchId}`

  const openDetail = async (docId: number) => {
    setDetailId(docId)
    setDetailLoading(true)
    setDetailDoc(null)
    setDetailLines([])
    try {
      const { document, lines: rawLines } = await inventoryService.getDocument(docId)
      const productIds = [...new Set(rawLines.map(l => l.product_id))]
      const names: Record<number, { name: string; code: string }> = {}
      await Promise.all(
        productIds.map(pid =>
          productsService.get(pid).then(res => {
            names[pid] = { name: res.data.name, code: res.data.code ?? '' }
          }).catch(() => {
            names[pid] = { name: `Producto #${pid}`, code: '' }
          })
        )
      )
      setDetailDoc(document)
      setDetailLines(
        rawLines.map(l => ({
          ...l,
          product_name: names[l.product_id]?.name,
        }))
      )
    } catch {
      toast.error('Error cargando detalle')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailId(null)
    setDetailDoc(null)
    setDetailLines([])
  }

  useEffect(() => {
    const docId = (location.state as { openDocumentId?: number } | null)?.openDocumentId
    if (!docId || isForm) return
    void openDetail(docId)
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir una vez al llegar desde importación
  }, [location.state, isForm, location.pathname, navigate])

  const runConfirmAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      if (confirmAction.type === 'confirm') {
        await inventoryService.confirmDocument(confirmAction.id)
        toast.success('Documento confirmado')
      } else {
        await inventoryService.voidDocument(confirmAction.id)
        toast.success('Documento anulado')
      }
      setConfirmAction(null)
      loadDocuments()
      if (detailId === confirmAction.id) closeDetail()
    } catch (err) {
      toast.error(extractApiError(err))
    } finally {
      setActionLoading(false)
    }
  }

  // Form: load draft for edit
  useEffect(() => {
    if (!isEdit || !id) return
    const docId = Number(id)
    if (!Number.isFinite(docId)) return
    setFormLoading(true)
    inventoryService
      .getDocument(docId)
      .then(async ({ document, lines: rawLines }) => {
        if (document.status !== 'draft') {
          toast.error('Solo se pueden editar borradores')
          navigate(meta.basePath)
          return
        }
        const productIds = [...new Set(rawLines.map(l => l.product_id))]
        const names: Record<number, { name: string; code: string }> = {}
        await Promise.all(
          productIds.map(pid =>
            productsService.get(pid).then(res => {
              names[pid] = { name: res.data.name, code: res.data.code ?? '' }
            }).catch(() => {
              names[pid] = { name: `Producto #${pid}`, code: '' }
            })
          )
        )
        setHeader({
          branch_id: document.branch_id,
          document_date: document.document_date?.slice(0, 10) || getTodayPeru(),
          operation_type_id: document.operation_type_id,
          reference: document.reference || '',
          movement_reason: document.movement_reason || '',
          notes: document.notes || '',
        })
        setLines(
          rawLines.map((l, i) => ({
            tempId: i + 1,
            product_id: l.product_id,
            product_name: names[l.product_id]?.name,
            product_code: names[l.product_id]?.code,
            quantity: l.quantity,
            unit_cost: l.unit_cost,
          }))
        )
        setNextTempId(rawLines.length + 1)
      })
      .catch(() => {
        toast.error('Error cargando documento')
        navigate(meta.basePath)
      })
      .finally(() => setFormLoading(false))
  }, [isEdit, id, meta.basePath, navigate])

  // Form: init new
  useEffect(() => {
    if (!isNew) return
    setHeader({
      branch_id: activeBranchId || branches[0]?.id || 0,
      document_date: getTodayPeru(),
      operation_type_id: operationTypes[0]?.id || 0,
      reference: '',
      movement_reason: '',
      notes: '',
    })
    setLines([])
    setNextTempId(1)
  }, [isNew, activeBranchId, branches, operationTypes])

  const addProduct = (p: Product) => {
    setLines(prev => {
      const existing = prev.find(l => l.product_id === p.id)
      if (existing) {
        return prev.map(l =>
          l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l
        )
      }
      const tempId = nextTempId
      setNextTempId(n => n + 1)
      return [
        ...prev,
        {
          tempId,
          product_id: p.id,
          product_name: p.name,
          product_code: p.code,
          quantity: 1,
          unit_cost: direction === 'IN' ? Number(p.purchase_price ?? 0) : 0,
        },
      ]
    })
    setPickerOpen(false)
  }

  const saveForm = async () => {
    if (!isHeaderUxValid(header, operationTypes) || !areLinesUxValid(lines)) {
      toast.error('Complete los campos obligatorios y al menos una línea válida')
      return
    }
    const payload = {
      operation_type_id: header.operation_type_id,
      document_date: header.document_date,
      reference: header.reference.trim(),
      movement_reason: header.movement_reason.trim(),
      notes: header.notes.trim(),
      lines: lines.map(l => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost ?? 0,
      })),
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await inventoryService.updateDocument(Number(id), payload)
        toast.success('Borrador actualizado')
      } else {
        await inventoryService.createDocument({
          direction,
          branch_id: header.branch_id,
          ...payload,
        })
        toast.success('Borrador creado')
      }
      navigate(meta.basePath)
    } catch (err) {
      toast.error(extractApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE))

  if (loadingInit || (isForm && formLoading)) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            to={meta.basePath}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-600"
            title="Volver al listado"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {isEdit ? 'Editar borrador' : 'Nuevo documento'} — {direction === 'IN' ? 'Ingreso' : 'Egreso'}
            </h2>
            <p className="text-sm text-gray-500">{meta.subtitle}</p>
          </div>
        </div>

        <InventoryDocumentHeader
          direction={direction}
          branches={branches}
          operationTypes={operationTypes}
          values={header}
          onChange={patch => setHeader(h => ({ ...h, ...patch }))}
          branchDisabled={isEdit}
        />

        <InventoryDocumentLines
          direction={direction}
          lines={lines}
          onChangeLine={(tempId, patch) =>
            setLines(prev => prev.map(l => (l.tempId === tempId ? { ...l, ...patch } : l)))
          }
          onRemoveLine={tempId => setLines(prev => prev.filter(l => l.tempId !== tempId))}
          onAddProducts={() => setPickerOpen(true)}
        />

        <div className="flex flex-wrap gap-2 justify-end">
          <Link
            to={meta.basePath}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          {canManage && (
            <button
              type="button"
              onClick={() => void saveForm()}
              disabled={saving}
              className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar borrador'}
            </button>
          )}
        </div>

        {pickerOpen && (
          <ProductPickerModal
            variant="purchase"
            onAdd={addProduct}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <InventoryDocumentToolbar
        basePath={meta.basePath}
        title={meta.title}
        subtitle={meta.subtitle}
        canCreate={canManage}
        branches={branches}
        branchFilter={branchFilter}
        onBranchFilterChange={setBranchFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        searchQ={searchQ}
        onSearchChange={setSearchQ}
      />

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {listLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Número', 'Fecha', 'Sucursal', 'Tipo operación', 'Referencia', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map(doc => {
                    const op = operationTypeMap.get(doc.operation_type_id)
                    return (
                      <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono font-bold text-gray-800">{doc.number || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDisplayDatePeru(doc.document_date)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{branchName(doc.branch_id)}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">
                          {op ? `${op.sunat_code} — ${op.name}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{doc.reference || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${documentStatusClass(doc.status)}`}>
                            {documentStatusLabel(doc.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void openDetail(doc.id)}
                              className="p-1.5 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                              title="Ver detalle"
                            >
                              <Eye size={14} />
                            </button>
                            {doc.status === 'draft' && canManage && (
                              <>
                                <Link
                                  to={`${meta.basePath}/${doc.id}/edit`}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg inline-flex"
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction({ type: 'confirm', id: doc.id })}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                                  title="Confirmar"
                                >
                                  <CheckCircle size={14} />
                                </button>
                              </>
                            )}
                            {doc.status === 'confirmed' && canManage && (
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'void', id: doc.id })}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                title="Anular"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredDocuments.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">Sin documentos registrados</div>
            )}
            {listTotal > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
                <span className="text-gray-500">
                  Página {listPage} de {totalPages} ({listTotal} registros)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={listPage <= 1}
                    onClick={() => setListPage(p => p - 1)}
                    className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={listPage >= totalPages}
                    onClick={() => setListPage(p => p + 1)}
                    className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={detailLoading || !!detailDoc} onClose={closeDetail} contentClassName="max-w-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800">Detalle del documento</h3>
          <button type="button" onClick={closeDetail} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          detailDoc && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Número</p>
                  <p className="font-mono font-medium">{detailDoc.number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p>{formatDisplayDatePeru(detailDoc.document_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Sucursal</p>
                  <p>{branchName(detailDoc.branch_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Tipo operación</p>
                  <p>
                    {operationTypeMap.get(detailDoc.operation_type_id)
                      ? `${operationTypeMap.get(detailDoc.operation_type_id)!.sunat_code} — ${operationTypeMap.get(detailDoc.operation_type_id)!.name}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Referencia</p>
                  <p>{detailDoc.reference || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Estado</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${documentStatusClass(detailDoc.status)}`}>
                    {documentStatusLabel(detailDoc.status)}
                  </span>
                </div>
                {detailDoc.movement_reason && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Motivo</p>
                    <p>{detailDoc.movement_reason}</p>
                  </div>
                )}
                {detailDoc.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Observaciones</p>
                    <p>{detailDoc.notes}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Líneas</p>
                <div className="space-y-1">
                  {detailLines.map((line, i) => (
                    <div key={line.id ?? i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{line.product_name || `Producto #${line.product_id}`}</p>
                        <p className="text-xs text-gray-400">
                          {line.quantity} × S/ {Number(line.unit_cost).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-700">
                        S/ {(line.quantity * line.unit_cost).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {detailDoc.status === 'draft' && canManage && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    to={`${meta.basePath}/${detailDoc.id}/edit`}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50"
                    onClick={closeDetail}
                  >
                    Editar
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'confirm', id: detailDoc.id })}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-xl hover:opacity-90"
                  >
                    Confirmar
                  </button>
                </div>
              )}
              {detailDoc.status === 'confirmed' && canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: 'void', id: detailDoc.id })}
                  className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50"
                >
                  Anular documento
                </button>
              )}
            </div>
          )
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
        loading={actionLoading}
        variant={confirmAction?.type === 'void' ? 'danger' : 'default'}
        title={confirmAction?.type === 'void' ? 'Anular documento' : 'Confirmar documento'}
        message={
          confirmAction?.type === 'void'
            ? 'Se revertirán los movimientos de stock generados por este documento. ¿Continuar?'
            : 'Al confirmar se registrarán los movimientos en el kardex. ¿Continuar?'
        }
        confirmLabel={confirmAction?.type === 'void' ? 'Anular' : 'Confirmar'}
      />
    </div>
  )
}
