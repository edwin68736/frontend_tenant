import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Eye, Download, Plus, UserPlus } from 'lucide-react'
import { cashbankService, type CashSession, type MovementReportRow } from '@/services/cashbank.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, categoryLabel } from '@/utils/cashMovementCategories'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import {
  downloadCashMovementReceiptPdf,
  openCashMovementReceiptPdfViewer,
  type CashMovementReceiptContext,
  type CashMovementReceiptInput,
} from '@/utils/cashMovementReceiptPdf'

type MovementType = 'income' | 'expense'

const PER_PAGE_OPTIONS = [20, 50, 100] as const

const COPY: Record<MovementType, { title: string; subtitle: string; emptyLabel: string; amountLabel: string; addLabel: string; addedToast: string }> = {
  income: {
    title: 'Ingresos',
    subtitle: 'Histórico de ingresos manuales y ventas cobradas — de mis cajas (abiertas y cerradas)',
    emptyLabel: 'Sin ingresos registrados',
    amountLabel: 'Total ingresado',
    addLabel: 'Agregar ingreso',
    addedToast: 'Ingreso registrado',
  },
  expense: {
    title: 'Egresos',
    subtitle: 'Histórico de egresos — de mis cajas (abiertas y cerradas)',
    emptyLabel: 'Sin egresos registrados',
    amountLabel: 'Total retirado',
    addLabel: 'Agregar egreso',
    addedToast: 'Egreso registrado',
  },
}

/** Vista de Ingresos o Egresos (mismo componente, parametrizado por `type`) — CashIncomePage.tsx
 *  y CashExpensePage.tsx solo lo envuelven con RequireModule.
 *
 * Fuente de datos: el reporte de movimientos multi-sesión (listMovementsReport), que YA incluye
 * caja abierta y cerradas, y que el backend acota a "mis" movimientos automáticamente
 * (callerUserIDOrZero en cashbank_api.go) salvo que el usuario administre cualquier caja —
 * mismo criterio de alcance que usa el resto de Caja, sin filtro extra desde el frontend. */
export function CashMovementTypeView({ type }: { type: MovementType }) {
  const { activeBranchId } = useBranch()
  const { user } = useAuth()
  const copy = COPY[type]

  const [rows, setRows] = useState<MovementReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ sumIncome: 0, sumExpense: 0 })
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(20)

  // Mi caja abierta en esta sucursal (GetOpenSession la resuelve por usuario, igual que en
  // CashPage.tsx) — el botón "Agregar ingreso/egreso" de esta vista registra el movimiento ahí
  // mismo, vinculado a esa sesión activa, sin pedir elegir ninguna caja.
  const [session, setSession] = useState<CashSession | null | undefined>(undefined)

  // Modal "Agregar ingreso/egreso" — mismos campos que el modal de movimiento de CashPage.tsx,
  // más `contact_id` (solo egresos) para vincular el egreso con un proveedor.
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<{ category: string; reference: string; amount: number; notes: string; payment_method: string; contact_id: number | undefined }>(
    { category: '', reference: '', amount: 0, notes: '', payment_method: 'efectivo', contact_id: undefined },
  )
  const [saving, setSaving] = useState(false)

  // Proveedores para el egreso — mismo patrón que PurchaseRegisterPage.tsx (select + botón
  // "Nuevo proveedor" con QuickContactCreateModal, mismas validaciones de RUC/DNI). Solo hace
  // falta en Egresos: un ingreso no se vincula a un proveedor.
  const [suppliers, setSuppliers] = useState<Contact[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)

  useEffect(() => {
    if (type !== 'expense') return
    setLoadingSuppliers(true)
    contactsService
      .list('', 'supplier')
      .then(s => setSuppliers(Array.isArray(s) ? s : []))
      .catch(() => toast.error('Error al cargar proveedores'))
      .finally(() => setLoadingSuppliers(false))
  }, [type])

  const load = async () => {
    setLoading(true)
    try {
      const [res, sess] = await Promise.all([
        cashbankService.listMovementsReport({
          branch_id: activeBranchId || undefined,
          type,
          page,
          per_page: perPage,
        }),
        cashbankService.getOpenSession(activeBranchId || undefined),
      ])
      setRows(res.data)
      setTotal(res.total)
      setSummary({ sumIncome: res.summary.sum_income, sumExpense: res.summary.sum_expense })
      setSession(sess ?? null)
    } catch {
      toast.error('Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeBranchId) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, type, page, perPage])

  // Cambiar de sucursal o de tipo vuelve a la página 1 (una página que existía antes puede no
  // existir en el nuevo filtro, con menos movimientos).
  useEffect(() => {
    setPage(1)
  }, [activeBranchId, type])

  const toReceiptInput = (m: MovementReportRow): CashMovementReceiptInput => ({
    id: m.movement_id,
    type,
    category: m.category || m.type,
    reference: m.cash_reference || m.doc_number || undefined,
    payment_method: m.payment_method,
    notes: m.notes_detail,
    amount: Math.abs(m.amount),
    created_at: m.date,
  })

  const toReceiptCtx = (m: MovementReportRow): CashMovementReceiptContext => ({
    sessionId: m.cash_session_id,
    cashierName: m.user_name || user?.name,
    branchName: m.branch_name,
  })

  const handleViewTicket = async (m: MovementReportRow, key: string) => {
    setBusyKey(key)
    try {
      if (m.sale_id) {
        const { url, fileName } = await createLocalReceiptPdfObjectUrl(m.sale_id, 'ticket')
        openPdfViewer({ url, title: 'Comprobante de venta', fileName, onClose: () => URL.revokeObjectURL(url) })
      } else {
        await openCashMovementReceiptPdfViewer(toReceiptInput(m), toReceiptCtx(m))
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDownloadTicket = async (m: MovementReportRow, key: string) => {
    setBusyKey(key)
    try {
      if (m.sale_id) {
        await downloadLocalReceiptPdf(m.sale_id, 'ticket')
      } else {
        await downloadCashMovementReceiptPdf(toReceiptInput(m), toReceiptCtx(m))
      }
      toast.success('PDF descargado')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setBusyKey(null)
    }
  }

  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const openAddModal = () => {
    setAddForm({
      category: type === 'income' ? 'ingreso_manual' : 'egreso_manual',
      reference: '',
      amount: 0,
      notes: '',
      payment_method: 'efectivo',
      contact_id: undefined,
    })
    setShowAddModal(true)
  }

  const handleAddMovement = async () => {
    if (!session) { toast.error('No tienes una caja abierta en esta sucursal'); return }
    if (!addForm.amount) { toast.error('Monto requerido'); return }
    setSaving(true)
    try {
      await cashbankService.addMovement(session.id, { type, ...addForm, contact_id: addForm.contact_id || undefined })
      toast.success(copy.addedToast)
      setShowAddModal(false)
      // Si ya estoy en la página 1, setPage(1) no dispara el useEffect (mismo valor) — recargo a
      // mano. Si no, dejo que el useEffect (que ya escucha `page`) haga la única recarga, para no
      // pedir el listado dos veces con la página vieja todavía en el closure de este handler.
      if (page === 1) void load()
      else setPage(1)
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const totalAmount = type === 'income' ? summary.sumIncome : summary.sumExpense

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{copy.title}</h2>
          <p className="text-sm text-gray-500">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-2 rounded-xl text-sm font-semibold ${type === 'income' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {copy.amountLabel}: S/ {totalAmount.toFixed(2)}
          </div>
          <button
            type="button"
            onClick={openAddModal}
            disabled={!session}
            title={session ? undefined : 'Abre una caja en esta sucursal para registrar movimientos'}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${type === 'income' ? 'bg-green-600' : 'bg-red-500'}`}
          >
            <Plus size={16} /> {copy.addLabel}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {type === 'income' ? <TrendingUp size={14} className="text-green-500" /> : <TrendingDown size={14} className="text-red-400" />}
          <p className="text-sm font-semibold text-gray-700">Historial</p>
          <span className="ml-auto text-xs text-gray-400">{total} registros</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'Fecha', 'Sesión', 'Categoría',
                      ...(type === 'expense' ? ['Proveedor'] : []),
                      'Documento / Referencia', 'Usuario', 'Método de pago', 'Monto', 'Acciones',
                    ].map(h => (
                      <th key={h} className="text-left px-3 sm:px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, idx) => {
                    const key = `${m.movement_id}-${m.type}-${idx}`
                    const busy = busyKey === key
                    const isLinkedSale = Boolean(m.sale_id)
                    const isLinkedPurchase = Boolean(m.purchase_id)
                    return (
                      <tr key={key} className="border-b border-gray-50">
                        <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{new Date(m.date).toLocaleString()}</td>
                        <td className="px-3 sm:px-4 py-2 text-xs text-gray-500 whitespace-nowrap">#{m.cash_session_id || '—'}</td>
                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                          {categoryLabel(m.category || m.type) || m.category || m.type}
                          {isLinkedSale && (
                            <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Venta</span>
                          )}
                          {isLinkedPurchase && (
                            <span className="ml-1.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600">Compra</span>
                          )}
                        </td>
                        {type === 'expense' && (
                          <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{m.contact_name || '—'}</td>
                        )}
                        <td className="px-3 sm:px-4 py-2 text-xs text-gray-500">{m.doc_number || m.cash_reference || 'Sin referencia'}</td>
                        <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{m.user_name || '—'}</td>
                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">{formatPaymentMethodLabel(m.payment_method)}</td>
                        <td className={`px-3 sm:px-4 py-2 font-semibold whitespace-nowrap ${type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                          {type === 'income' ? '+' : '-'} S/ {Math.abs(m.amount).toFixed(2)}
                        </td>
                        <td className="px-3 sm:px-4 py-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              title={isLinkedSale ? 'Ver ticket de la venta' : 'Ver comprobante interno en formato ticket'}
                              disabled={busy}
                              onClick={() => void handleViewTicket(m, key)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium disabled:opacity-50"
                            >
                              <Eye size={14} /> Ver ticket
                            </button>
                            <button
                              type="button"
                              title="Descargar PDF en formato ticket"
                              disabled={busy}
                              onClick={() => void handleDownloadTicket(m, key)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium disabled:opacity-50"
                            >
                              <Download size={14} /> Descargar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">{copy.emptyLabel}</p>
              )}
            </div>

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 sm:px-4 py-3 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-gray-600">
                    Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 whitespace-nowrap">Mostrar</span>
                    <select
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                      value={perPage}
                      onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                    >
                      {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-gray-600">
                    Página {page} de {Math.max(1, Math.ceil(total / perPage))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(Math.ceil(total / perPage), p + 1))}
                    disabled={page >= Math.ceil(total / perPage)}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal "Agregar ingreso/egreso" — mismos campos que el modal de movimiento de CashPage.tsx,
          registrado siempre contra MI caja abierta (session), nunca contra una que elija a mano. */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">{copy.addLabel}</h3>
        {session && (
          <p className="text-xs text-gray-500">Se registrará en tu caja abierta #{session.id}.</p>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={addForm.category}
              onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
            >
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {type === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor (opcional)</label>
              <div className="flex gap-2 items-stretch">
                <select
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  value={addForm.contact_id ?? ''}
                  disabled={loadingSuppliers}
                  onChange={e => setAddForm(f => ({ ...f, contact_id: e.target.value ? Number(e.target.value) : undefined }))}
                >
                  <option value="">Sin proveedor</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.business_name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddSupplierOpen(true)}
                  className="shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
                  title="Nuevo proveedor"
                  aria-label="Nuevo proveedor"
                >
                  <UserPlus size={18} />
                </button>
              </div>
              {suppliers.length === 0 && !loadingSuppliers && (
                <p className="text-xs text-amber-700 mt-1">
                  No hay proveedores registrados. Use el botón + para crear uno aquí.
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Referencia</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={addForm.reference}
              onChange={e => setAddForm(f => ({ ...f, reference: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={addForm.payment_method}
              onChange={e => setAddForm(f => ({ ...f, payment_method: e.target.value }))}
            >
              <option value="efectivo">Efectivo</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto (S/) *</label>
            <MoneyAmountInput
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={addForm.amount}
              onChange={v => setAddForm(f => ({ ...f, amount: v }))}
              emptyWhenZero
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              onClick={() => setShowAddModal(false)}
              className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddMovement}
              disabled={saving}
              className={`flex-1 py-2.5 sm:py-2 ${type === 'income' ? 'bg-green-600' : 'bg-red-500'} text-white rounded-xl text-sm font-medium disabled:opacity-50`}
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Alta rápida de proveedor desde el modal de Agregar egreso — mismo componente y
          validaciones (RUC/DNI) que usa Compras (PurchaseRegisterPage.tsx). `stacked` porque se
          abre encima del modal de Agregar egreso, ya abierto. */}
      {type === 'expense' && (
        <QuickContactCreateModal
          open={addSupplierOpen}
          onClose={() => setAddSupplierOpen(false)}
          contactType="supplier"
          defaultDocType="6"
          stacked
          onCreated={contact => {
            setSuppliers(prev => [...prev, contact])
            setAddForm(f => ({ ...f, contact_id: contact.id }))
          }}
        />
      )}
    </div>
  )
}
