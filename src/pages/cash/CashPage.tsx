import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { X, TrendingUp, TrendingDown, Wallet, History, Pencil, Trash2, Unlock, Eye } from 'lucide-react'
import { cashbankService, type CashSession, type SessionBalanceSummary } from '@/services/cashbank.service'
import { openCashDrawer } from '@/services/printers.service'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { PendingRefundsPanel, PendingRefundsNotice } from '@/components/cash/PendingRefundsPanel'
import {
  ArqueoTable,
  sumArqueo,
  arqueoSumColorClass,
  emptyArqueo,
  parseArqueoJson,
} from '@/components/cash/ArqueoTable'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/utils/cashMovementCategories'

const HISTORY_PER_PAGE_OPTIONS = [20, 50, 100] as const

export default function CashPage() {
  return <RequireModule moduleKey="cashbank"><CashContent /></RequireModule>
}

function CashContent() {
  const { activeBranchId } = useBranch()
  const { hasPermission } = useAuth()
  const [session, setSession] = useState<CashSession | null | undefined>(undefined)
  // Fuente única de saldo (backend): totales por método + total + efectivo esperado — necesaria
  // aquí solo para los modales de Cerrar caja / Arqueo de MI sesión abierta (el resto de tarjetas
  // que antes la usaban se movieron a CashSessionDetailPage.tsx, la vista de detalle).
  const [balanceSummary, setBalanceSummary] = useState<SessionBalanceSummary | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)

  // Paginación del historial — 20 por página por defecto.
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPerPage, setHistoryPerPage] = useState<number>(20)
  const [historyTotal, setHistoryTotal] = useState(0)

  // Modal abrir caja
  const [showOpen, setShowOpen] = useState(false)
  const [openBalance, setOpenBalance] = useState(0)
  const [openNotes, setOpenNotes] = useState('')

  // Modal movimiento
  const [showMov, setShowMov] = useState(false)
  const [movType, setMovType] = useState<'income' | 'expense'>('income')
  const [movForm, setMovForm] = useState({ category: '', reference: '', amount: 0, notes: '', payment_method: 'efectivo' })

  // Modal cerrar
  const [showClose, setShowClose] = useState(false)
  const [closeNotes, setCloseNotes] = useState('')
  const [closeWithArqueo, setCloseWithArqueo] = useState(false)
  const [closeArqueo, setCloseArqueo] = useState<Record<string, number>>(emptyArqueo())
  const [saving, setSaving] = useState(false)
  const [openingDrawer, setOpeningDrawer] = useState(false)

  // Modal arqueo (historial: ver o hacer arqueo)
  const [arqueoModalSession, setArqueoModalSession] = useState<CashSession | null>(null)
  const [arqueoModalMode, setArqueoModalMode] = useState<'view' | 'add'>('view')
  const [arqueoForm, setArqueoForm] = useState<Record<string, number>>(emptyArqueo())
  const [savingArqueo, setSavingArqueo] = useState(false)

  // Arqueo con caja abierta (borrador) — se muestra en modal
  const [showArqueoModal, setShowArqueoModal] = useState(false)
  const [arqueoDraft, setArqueoDraft] = useState<Record<string, number>>(emptyArqueo())
  const [savingArqueoDraft, setSavingArqueoDraft] = useState(false)

  // Corregir apertura / eliminar caja vacía (historial)
  const [openingEdit, setOpeningEdit] = useState<{ session: CashSession; amount: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CashSession | null>(null)
  const [sessionAdminBusy, setSessionAdminBusy] = useState(false)
  // Corregir el monto de apertura es de quien abre la caja; borrarla, de quien la administra.
  const canAdjustOpening = hasPermission('cashbank.open')
  const canDeleteSession = hasPermission('cashbank.manage')

  const load = async () => {
    try {
      const branchId = activeBranchId || session?.branch_id
      const [sess, hist] = await Promise.all([
        cashbankService.getOpenSession(branchId || undefined),
        cashbankService.listSessionsPaged({ branch_id: branchId || undefined, page: historyPage, per_page: historyPerPage }),
      ])
      setSession(sess ?? null)
      setHistory(hist.data)
      setHistoryTotal(hist.total)
      if (sess?.id != null) {
        const summary = await cashbankService.getSessionBalance(sess.id)
        setBalanceSummary(summary)
      } else {
        setBalanceSummary(null)
      }
    } catch { toast.error('Error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (activeBranchId) load()
  }, [activeBranchId, historyPage, historyPerPage])

  // Cambiar de sucursal vuelve a la página 1 (una página que existía en la sucursal anterior
  // puede no existir en la nueva, con menos sesiones).
  useEffect(() => {
    setHistoryPage(1)
  }, [activeBranchId])

  useEffect(() => {
    if (session?.arqueo_json) setArqueoDraft(parseArqueoJson(session.arqueo_json))
  }, [session?.id, session?.arqueo_json])

  const handleOpen = async () => {
    setSaving(true)
    if (!activeBranchId) { toast.error('Seleccione una sucursal activa'); return }
    try {
      await cashbankService.openSession({ branch_id: activeBranchId, opening_balance: openBalance, notes: openNotes })
      toast.success('Caja abierta')
      setShowOpen(false)
      load()
    }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleAddMovement = async () => {
    if (!session || !movForm.amount) { toast.error('Monto requerido'); return }
    setSaving(true)
    try { await cashbankService.addMovement(session.id, { type: movType, ...movForm }); toast.success('Movimiento registrado'); setShowMov(false); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleClose = async () => {
    if (!session) return
    setSaving(true)
    try {
      // closing_balance representa el EFECTIVO con el que se cierra la caja (contra eso el
      // backend calcula `difference`) — nunca el total con todos los métodos. Si se hace arqueo,
      // el backend igual lo sobreescribe con la suma de denominaciones; esto es el valor por
      // defecto cuando el cajero cierra sin contar el efectivo físico.
      const payload: { closing_balance: number; notes: string; arqueo?: Record<string, number> } = {
        closing_balance: cashExpected,
        notes: closeNotes,
      }
      if (closeWithArqueo) {
        const hasAny = Object.values(closeArqueo).some(v => (v ?? 0) > 0)
        if (hasAny) payload.arqueo = closeArqueo
      }
      await cashbankService.closeSession(session.id, payload)
      toast.success('Caja cerrada')
      setShowClose(false)
      setCloseWithArqueo(false)
      setCloseArqueo(emptyArqueo())
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveArqueo = async () => {
    if (!arqueoModalSession) return
    setSavingArqueo(true)
    try {
      await cashbankService.saveArqueo(arqueoModalSession.id, arqueoForm)
      toast.success('Arqueo registrado')
      setArqueoModalSession(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setSavingArqueo(false)
    }
  }

  const handleSaveOpening = async () => {
    if (!openingEdit) return
    setSessionAdminBusy(true)
    try {
      await cashbankService.updateOpeningBalance(openingEdit.session.id, openingEdit.amount)
      toast.success('Monto de apertura corregido')
      setOpeningEdit(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo corregir el monto')
    } finally {
      setSessionAdminBusy(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!deleteTarget) return
    setSessionAdminBusy(true)
    try {
      await cashbankService.deleteSession(deleteTarget.id)
      toast.success('Caja eliminada')
      setDeleteTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo eliminar la caja')
    } finally {
      setSessionAdminBusy(false)
    }
  }

  const handleUpdateArqueoDraft = async () => {
    if (!session) return
    setSavingArqueoDraft(true)
    try {
      await cashbankService.saveArqueo(session.id, arqueoDraft)
      toast.success('Arqueo actualizado')
      setShowArqueoModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error')
    } finally {
      setSavingArqueoDraft(false)
    }
  }

  const handleOpenDrawer = async () => {
    setOpeningDrawer(true)
    try {
      const msg = await openCashDrawer()
      toast.success(msg || 'Gaveta abierta')
    } catch (e) {
      console.error('[caja] abrir gaveta]', e)
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la gaveta')
    } finally {
      setOpeningDrawer(false)
    }
  }

  // `balance` = saldo de la sesión con TODOS los métodos de pago. `cashExpected` = SOLO efectivo —
  // el número contra el que debe compararse cualquier arqueo físico, idéntico al que persiste el
  // backend al cerrar la caja. Nunca deben mezclarse: antes de este fix, el arqueo comparaba
  // contra `balance` (todos los métodos), así que un egreso por Yape/transferencia hacía que "la
  // diferencia con el esperado" en pantalla no coincidiera con la diferencia real que el sistema
  // guardaba.
  const balance = balanceSummary?.total ?? (session?.opening_balance ?? 0)
  const cashExpected = balanceSummary?.cash_expected ?? balance
  const totalIncome = balanceSummary?.by_method.reduce((s, m) => s + m.income, 0) ?? 0
  const totalExpense = balanceSummary?.by_method.reduce((s, m) => s + m.expense, 0) ?? 0

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Caja</h2>
          <p className="text-sm text-gray-500">Sesiones de operaciones — abre, cierra y revisa el detalle de cada una</p>
        </div>
        {/* Sin caja abierta para mí en esta sucursal: la única acción posible antes de operar. */}
        {session === null && (
          <button onClick={() => setShowOpen(true)} className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 whitespace-nowrap">
            Abrir caja
          </button>
        )}
      </div>

      {/* Avisa de devoluciones esperando una caja: con sesión abierta, el panel completo (puede
          aplicarlas ahí mismo); sin ella, solo el aviso de que existen (para no abrir "a ciegas"). */}
      {session ? (
        <PendingRefundsPanel sessionId={session.id} branchId={activeBranchId || session.branch_id} onApplied={load} />
      ) : (
        <PendingRefundsNotice branchId={activeBranchId} />
      )}

      {/* Historial de sesiones: única vista de /cashbank/cash — abrir/ingreso/egreso/arqueo/cerrar
          se operan por fila (columna Acciones), sobre la fila que es MI sesión abierta. El detalle
          completo de cualquier sesión (mía o no, abierta o cerrada) y su reporte/PDF están en la
          vista aparte (CashSessionDetailPage, enlace "Detalle"). */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <History size={14} className="text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Historial de sesiones</p>
            <span className="ml-auto text-xs text-gray-400">{historyTotal} sesiones</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50"><tr>{['Usuario','Apertura','Cierre','Balance apert.','Balance cierre','Saldo actual','Estado','Arqueo','Acciones'].map(h => <th key={h} className="text-left px-3 sm:px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {history.map(s => {
                  // Mi propia sesión abierta (GetOpenSession la resuelve por usuario, no solo por
                  // sucursal): solo en esa fila tiene sentido operar (ingreso/egreso/arqueo/
                  // cerrar/gaveta) — otra fila "Abierta" puede ser la caja de otro cajero, que
                  // este usuario no debe poder cerrar ni modificar desde aquí.
                  const isMine = session != null && s.id === session.id
                  return (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{s.opened_by_name || `#${s.opened_by}`}</td>
                    <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{new Date(s.opened_at).toLocaleString()}</td>
                    <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{s.closed_at ? new Date(s.closed_at).toLocaleString() : '-'}</td>
                    <td className="px-3 sm:px-4 py-2 font-medium whitespace-nowrap">S/ {Number(s.opening_balance).toFixed(2)}</td>
                    <td className="px-3 sm:px-4 py-2 font-medium">{s.closing_balance != null ? `S/ ${Number(s.closing_balance).toFixed(2)}` : '-'}</td>
                    {/* Saldo con TODOS los métodos de pago (efectivo + Yape/Plin/transferencia/
                        tarjeta) — "Balance cierre" es solo lo declarado en el arqueo (solo
                        efectivo), no alcanza para ver de un vistazo el total real de una sesión
                        con ventas electrónicas. */}
                    <td className="px-3 sm:px-4 py-2 font-medium whitespace-nowrap">S/ {Number(s.total ?? 0).toFixed(2)}</td>
                    <td className="px-3 sm:px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td>
                    <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                      {s.status === 'closed' ? (
                        s.arqueo_json ? (
                          <button type="button" onClick={() => { setArqueoModalSession(s); setArqueoModalMode('view'); setArqueoForm(parseArqueoJson(s.arqueo_json)) }} className="text-xs text-[rgb(var(--p600))] hover:underline">Ver arqueo</button>
                        ) : (
                          <button type="button" onClick={() => { setArqueoModalSession(s); setArqueoModalMode('add'); setArqueoForm(emptyArqueo()) }} className="text-xs text-amber-600 hover:underline">Hacer arqueo</button>
                        )
                      ) : isMine ? (
                        <button
                          type="button"
                          title="Contar el efectivo de mi caja abierta"
                          onClick={() => { setArqueoDraft(session?.arqueo_json ? parseArqueoJson(session.arqueo_json) : emptyArqueo()); setShowArqueoModal(true) }}
                          className="text-xs text-[rgb(var(--p600))] hover:underline"
                        >
                          Arqueo
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 sm:px-4 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {isMine && (
                          <>
                            <button
                              type="button"
                              title="Registrar ingreso"
                              onClick={() => { setMovType('income'); setMovForm({ category: 'ingreso_manual', reference: '', amount: 0, notes: '', payment_method: 'efectivo' }); setShowMov(true) }}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                            >
                              <TrendingUp size={14} />
                            </button>
                            <button
                              type="button"
                              title="Registrar egreso"
                              onClick={() => { setMovType('expense'); setMovForm({ category: 'egreso_manual', reference: '', amount: 0, notes: '', payment_method: 'efectivo' }); setShowMov(true) }}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                            >
                              <TrendingDown size={14} />
                            </button>
                            <button
                              type="button"
                              title="Abrir gaveta"
                              onClick={() => void handleOpenDrawer()}
                              disabled={openingDrawer}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            >
                              <Unlock size={14} />
                            </button>
                            <button
                              type="button"
                              title="Cerrar caja"
                              onClick={() => { setCloseNotes(''); setCloseArqueo(session?.arqueo_json ? parseArqueoJson(session.arqueo_json) : emptyArqueo()); setCloseWithArqueo(!!session?.arqueo_json); setShowClose(true) }}
                              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline"
                            >
                              <Wallet size={13} /> Cerrar
                            </button>
                          </>
                        )}
                        <Link
                          to={`/cashbank/cash/${s.id}`}
                          title="Ver el detalle completo de esta sesión y exportar su reporte"
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline"
                        >
                          <Eye size={13} /> Detalle
                        </Link>
                        {canAdjustOpening && (
                          <button
                            type="button"
                            title="Corregir el monto de apertura"
                            onClick={() => setOpeningEdit({ session: s, amount: Number(s.opening_balance) })}
                            className="inline-flex items-center gap-1 text-xs text-[rgb(var(--p600))] hover:underline"
                          >
                            <Pencil size={13} /> Apertura
                          </button>
                        )}
                        {/* Solo las cajas sin nada registrado: las demás respaldan dinero contado. */}
                        {canDeleteSession && s.empty && (
                          <button
                            type="button"
                            title="Eliminar esta caja (no registró movimientos ni ventas)"
                            onClick={() => setDeleteTarget(s)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {history.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Sin sesiones anteriores</p>
            )}
          </div>
          {historyTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 sm:px-4 py-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-gray-600">
                  Mostrando {(historyPage - 1) * historyPerPage + 1}-{Math.min(historyPage * historyPerPage, historyTotal)} de {historyTotal}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 whitespace-nowrap">Mostrar</span>
                  <select
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                    value={historyPerPage}
                    onChange={e => { setHistoryPerPage(Number(e.target.value)); setHistoryPage(1) }}
                  >
                    {HISTORY_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-xs text-gray-600">
                  Página {historyPage} de {Math.max(1, Math.ceil(historyTotal / historyPerPage))}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage(p => Math.min(Math.ceil(historyTotal / historyPerPage), p + 1))}
                  disabled={historyPage >= Math.ceil(historyTotal / historyPerPage)}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
      </div>

      {/* Modal corregir monto de apertura */}
      <Modal open={!!openingEdit} onClose={() => setOpeningEdit(null)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Corregir monto de apertura</h3>
        <p className="text-xs text-gray-500">
          Caja abierta el {openingEdit ? new Date(openingEdit.session.opened_at).toLocaleString() : ''}.
          {openingEdit?.session.status === 'closed' &&
            ' Al estar cerrada, se recalculan el saldo esperado y la diferencia del arqueo.'}
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Monto de apertura (S/)</label>
          <MoneyAmountInput
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openingEdit?.amount ?? 0}
            onChange={v => setOpeningEdit(prev => (prev ? { ...prev, amount: v } : prev))}
            emptyWhenZero
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={() => setOpeningEdit(null)}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveOpening}
            disabled={sessionAdminBusy}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sessionAdminBusy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* Modal eliminar caja vacía */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Eliminar caja</h3>
        <p className="text-sm text-gray-600">
          Se eliminará definitivamente la caja abierta el{' '}
          {deleteTarget ? new Date(deleteTarget.opened_at).toLocaleString() : ''}. No registró
          movimientos ni ventas, así que no se pierde información. Esta acción no se puede deshacer.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={() => setDeleteTarget(null)}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDeleteSession}
            disabled={sessionAdminBusy}
            className="flex-1 py-2.5 sm:py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sessionAdminBusy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      {/* Modal abrir caja */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Abrir caja</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Balance inicial (S/)</label>
          <MoneyAmountInput
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openBalance}
            onChange={setOpenBalance}
            emptyWhenZero
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openNotes}
            onChange={e => setOpenNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={() => setShowOpen(false)}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleOpen}
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : 'Abrir'}
          </button>
        </div>
      </Modal>

      {/* Modal nuevo movimiento */}
      <Modal open={showMov} onClose={() => setShowMov(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-800 text-base sm:text-lg">
            {movType === 'income' ? 'Registrar ingreso' : 'Registrar egreso'}
          </h3>
          <button onClick={() => setShowMov(false)} className="p-1 -m-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movForm.category}
              onChange={e => setMovForm(f => ({ ...f, category: e.target.value }))}
            >
              {(movType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Referencia</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movForm.reference}
              onChange={e => setMovForm(f => ({ ...f, reference: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movForm.notes}
              onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movForm.payment_method}
              onChange={e => setMovForm(f => ({ ...f, payment_method: e.target.value }))}
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
              value={movForm.amount}
              onChange={v => setMovForm(f => ({ ...f, amount: v }))}
              emptyWhenZero
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              onClick={() => setShowMov(false)}
              className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddMovement}
              disabled={saving}
              className={`flex-1 py-2.5 sm:py-2 ${
                movType === 'income' ? 'bg-green-600' : 'bg-red-500'
              } text-white rounded-xl text-sm font-medium disabled:opacity-50`}
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal cerrar caja */}
      <Modal open={showClose} onClose={() => setShowClose(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Cerrar caja</h3>
        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Balance apertura</span>
            <span>S/ {Number(session?.opening_balance ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>Ingresos</span>
            <span>+ S/ {totalIncome.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-500">
            <span>Egresos</span>
            <span>- S/ {totalExpense.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-gray-200 pt-1">
            <span>Balance final</span>
            <span>S/ {balance.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="close-with-arqueo"
            checked={closeWithArqueo}
            onChange={e => { setCloseWithArqueo(e.target.checked); if (!e.target.checked) setCloseArqueo(emptyArqueo()) }}
            className="mt-0.5 rounded border-gray-300"
          />
          <label htmlFor="close-with-arqueo" className="text-sm text-gray-700">Registrar arqueo de caja (cantidad por denominación)</label>
        </div>
        {closeWithArqueo && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              El arqueo cuenta solo efectivo físico — efectivo esperado: <span className="font-semibold">S/ {cashExpected.toFixed(2)}</span> (Yape/Plin/transferencia/tarjeta no llevan arqueo).
            </p>
            <ArqueoTable
              arqueo={closeArqueo}
              editable
              onChange={setCloseArqueo}
              totalColorClass={arqueoSumColorClass(sumArqueo(closeArqueo), cashExpected)}
            />
            {Math.abs(sumArqueo(closeArqueo) - cashExpected) > 0.01 && (
              <p className={`text-xs ${sumArqueo(closeArqueo) > cashExpected ? 'text-orange-600' : 'text-red-600'}`}>
                Diferencia con efectivo esperado: S/ {(sumArqueo(closeArqueo) - cashExpected).toFixed(2)}
              </p>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas de cierre</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={closeNotes}
            onChange={e => setCloseNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            onClick={() => setShowClose(false)}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 bg-gray-800 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : 'Cerrar caja'}
          </button>
        </div>
      </Modal>

      {/* Modal arqueo de la caja actual (solo cuando hay sesión abierta) */}
      <Modal open={showArqueoModal && !!session} onClose={() => setShowArqueoModal(false)} contentClassName="max-w-xl w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-800">Arqueo de caja</h3>
        <p className="text-xs text-gray-500 mb-3">Actualiza las cantidades por denominación. Al cerrar la caja podrás registrar el arqueo de forma opcional.</p>
        <p className="text-xs text-gray-500 mb-2">Efectivo esperado: <span className="font-semibold">S/ {cashExpected.toFixed(2)}</span></p>
        <ArqueoTable
          arqueo={arqueoDraft}
          editable
          onChange={setArqueoDraft}
          totalColorClass={arqueoSumColorClass(sumArqueo(arqueoDraft), cashExpected)}
        />
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
          <button type="button" onClick={() => setShowArqueoModal(false)} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
          <button
            type="button"
            onClick={handleUpdateArqueoDraft}
            disabled={savingArqueoDraft}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {savingArqueoDraft ? '...' : 'Actualizar arqueo'}
          </button>
        </div>
      </Modal>

      {/* Modal arqueo (ver o hacer) */}
      <Modal open={!!arqueoModalSession} onClose={() => setArqueoModalSession(null)} contentClassName="max-w-xl w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-800">{arqueoModalMode === 'view' ? 'Arqueo de caja' : 'Registrar arqueo de caja'}</h3>
        {arqueoModalSession && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Sesión cerrada {arqueoModalSession.closed_at ? new Date(arqueoModalSession.closed_at).toLocaleString() : ''}. Efectivo esperado: S/ {(arqueoModalSession.expected_balance ?? 0).toFixed(2)}
            </p>
            <ArqueoTable
              arqueo={arqueoForm}
              editable={arqueoModalMode === 'add'}
              onChange={arqueoModalMode === 'add' ? setArqueoForm : undefined}
              totalColorClass={arqueoSumColorClass(sumArqueo(arqueoForm), arqueoModalSession.expected_balance ?? 0)}
            />
            {arqueoModalMode === 'view' ? (
              <button type="button" onClick={() => setArqueoModalSession(null)} className="w-full mt-4 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
            ) : (
              <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
                <button type="button" onClick={() => setArqueoModalSession(null)} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="button" onClick={handleSaveArqueo} disabled={savingArqueo} className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{savingArqueo ? '...' : 'Guardar arqueo'}</button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
