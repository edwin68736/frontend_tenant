import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X, TrendingUp, TrendingDown, Wallet, History } from 'lucide-react'
import { cashbankService, type CashSession, type CashMovement, type OpenCashSessionRow } from '@/services/cashbank.service'
import { useBranch } from '@/contexts/BranchContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'

// Categorías preestablecidas para movimientos de caja
const INCOME_CATEGORIES = [
  { value: 'ingreso_manual', label: 'Ingreso manual' },
  { value: 'venta_efectivo', label: 'Venta (efectivo manual)' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'prestamo_cobro', label: 'Cobro de préstamo' },
  { value: 'otro_ingreso', label: 'Otro ingreso' },
]
const EXPENSE_CATEGORIES = [
  { value: 'egreso_manual', label: 'Egreso manual' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'retiro', label: 'Retiro' },
  { value: 'pago_proveedor', label: 'Pago a proveedor' },
  { value: 'prestamo_entrega', label: 'Préstamo entregado' },
  { value: 'otro_egreso', label: 'Otro egreso' },
]

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
function categoryLabel(value: string): string {
  if (!value) return ''
  const found = ALL_CATEGORIES.find(c => c.value === value)
  return found ? found.label : value
}

// Denominaciones para arqueo (PEN): una sola lista; centavos con dos decimales (0.50, 0.20, 0.10)
const ARQUEO_DENOMINATIONS: { value: string; label: string }[] = [
  { value: '200', label: 'S/ 200' },
  { value: '100', label: 'S/ 100' },
  { value: '50', label: 'S/ 50' },
  { value: '20', label: 'S/ 20' },
  { value: '10', label: 'S/ 10' },
  { value: '5', label: 'S/ 5' },
  { value: '2', label: 'S/ 2' },
  { value: '1', label: 'S/ 1' },
  { value: '0.5', label: 'S/ 0.50' },
  { value: '0.2', label: 'S/ 0.20' },
  { value: '0.1', label: 'S/ 0.10' },
]

function sumArqueo(arqueo: Record<string, number>): number {
  return ARQUEO_DENOMINATIONS.reduce((s, d) => s + Number(d.value) * (arqueo[d.value] ?? 0), 0)
}

/** Clase de color para la suma del arqueo según el saldo esperado: verde = igual, naranja = mayor, rojo = menor */
function arqueoSumColorClass(sum: number, expectedBalance: number): string {
  const diff = sum - expectedBalance
  if (Math.abs(diff) < 0.01) return 'text-green-600 font-semibold'
  if (diff > 0) return 'text-orange-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function emptyArqueo(): Record<string, number> {
  return ARQUEO_DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.value]: 0 }), {} as Record<string, number>)
}

function parseArqueoJson(json: string | null | undefined): Record<string, number> {
  if (!json) return emptyArqueo()
  try {
    const o = JSON.parse(json) as Record<string, number>
    const out = emptyArqueo()
    ARQUEO_DENOMINATIONS.forEach(d => { out[d.value] = Number(o[d.value]) || 0 })
    return out
  } catch {
    return emptyArqueo()
  }
}

/** Tabla de arqueo: I- EFECTIVO ARQUEADO con columnas Descripción, Cantidad, Denominación (S/), Importe */
function ArqueoTable({
  arqueo,
  editable,
  onChange,
  totalColorClass,
}: {
  arqueo: Record<string, number>
  editable: boolean
  onChange?: (arqueo: Record<string, number>) => void
  totalColorClass?: string
}) {
  const total = sumArqueo(arqueo)
  const cellClass = 'px-2 py-1.5 text-sm border-b border-gray-100'
  const headerClass = 'px-2 py-2 text-xs font-semibold text-gray-700 uppercase bg-amber-50/80 border-b border-amber-100'

  const renderRow = (d: { value: string; label: string }) => {
    const qty = arqueo[d.value] ?? 0
    const denom = Number(d.value)
    const importe = qty * denom
    const denomDisplay = denom < 1 ? denom.toFixed(2) : d.value
    return (
      <tr key={d.value}>
        <td className={`${cellClass} text-gray-600`}>{d.label}</td>
        <td className={cellClass}>
          {editable && onChange ? (
            <input
              type="number"
              min={0}
              step={1}
              className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-sm text-right"
              value={qty}
              onChange={e => onChange({ ...arqueo, [d.value]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          ) : (
            <span className="text-right block">{qty}</span>
          )}
        </td>
        <td className={`${cellClass} text-gray-600`}>{denomDisplay}</td>
        <td className={`${cellClass} text-right font-medium`}>{importe.toFixed(2)}</td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <p className="text-sm font-semibold text-gray-800 mb-2 text-center">I- EFECTIVO ARQUEADO</p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={`${headerClass} text-left`}>Descripción</th>
            <th className={`${headerClass} text-right w-24`}>Cantidad</th>
            <th className={`${headerClass} text-left`}>Denominación (S/)</th>
            <th className={`${headerClass} text-right`}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {ARQUEO_DENOMINATIONS.map(renderRow)}
          <tr>
            <td colSpan={3} className="px-2 py-2 font-semibold border-t border-gray-200 bg-amber-50/80 text-gray-800">TOTAL EFECTIVO</td>
            <td className={`px-2 py-2 text-right border-t border-gray-200 bg-amber-50/80 font-semibold ${totalColorClass ?? 'text-gray-800'}`}>{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function CashPage() {
  return <RequireModule moduleKey="cashbank"><CashContent /></RequireModule>
}

function CashContent() {
  const { activeBranchId } = useBranch()
  const [session, setSession] = useState<CashSession | null | undefined>(undefined)
  const [openInBranch, setOpenInBranch] = useState<OpenCashSessionRow[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [history, setHistory] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

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

  // Modal arqueo (historial: ver o hacer arqueo)
  const [arqueoModalSession, setArqueoModalSession] = useState<CashSession | null>(null)
  const [arqueoModalMode, setArqueoModalMode] = useState<'view' | 'add'>('view')
  const [arqueoForm, setArqueoForm] = useState<Record<string, number>>(emptyArqueo())
  const [savingArqueo, setSavingArqueo] = useState(false)

  // Arqueo con caja abierta (borrador) — se muestra en modal
  const [showArqueoModal, setShowArqueoModal] = useState(false)
  const [arqueoDraft, setArqueoDraft] = useState<Record<string, number>>(emptyArqueo())
  const [savingArqueoDraft, setSavingArqueoDraft] = useState(false)

  const load = async () => {
    try {
      const branchId = activeBranchId || session?.branch_id
      const [sess, hist] = await Promise.all([
        cashbankService.getOpenSession(branchId || undefined),
        cashbankService.listSessions(branchId || undefined),
      ])
      if (branchId) {
        const openList = await cashbankService.listOpenSessionsInBranch(branchId)
        setOpenInBranch(openList)
      } else {
        setOpenInBranch([])
      }
      setSession(sess ?? null)
      setHistory(hist ?? [])
      if (sess?.id != null) {
        const movs = await cashbankService.listMovements(sess.id)
        setMovements(movs ?? [])
      } else {
        setMovements([])
      }
    } catch { toast.error('Error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (activeBranchId) load()
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
      const payload: { closing_balance: number; notes: string; arqueo?: Record<string, number> } = {
        closing_balance: balance,
        notes: closeNotes,
      }
      if (closeWithArqueo) {
        const hasAny = ARQUEO_DENOMINATIONS.some(d => (closeArqueo[d.value] ?? 0) > 0)
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

  const totalIncome = movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const totalExpense = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const balance = (session?.opening_balance ?? 0) + totalIncome - totalExpense

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Caja</h2>
          <p className="text-sm text-gray-500">Mi caja — una sesión abierta por usuario en la sucursal</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 w-full sm:w-auto justify-center sm:justify-start"
        >
          <History size={14} /> Historial
        </button>
      </div>

      {openInBranch.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cajas abiertas en sucursal</h3>
          <p className="text-xs text-gray-500 mb-3">Solo lectura — cada cajero gestiona su propia caja.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2 pr-3">Apertura</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {openInBranch.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-medium text-gray-800">{row.user_name || `#${row.user_id}`}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      {row.opened_at ? new Date(row.opened_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-right font-medium">S/ {Number(row.current_balance).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {session ? (
        <>
          {/* Cards de resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Apertura', val: session.opening_balance, color: 'text-gray-800', bg: 'bg-white' },
              { label: 'Ingresos', val: totalIncome, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Egresos', val: totalExpense, color: 'text-red-500', bg: 'bg-red-50' },
              { label: 'Balance actual', val: balance, color: 'text-[rgb(var(--p700))]', bg: 'bg-[rgb(var(--p50))]' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} rounded-2xl shadow-sm p-3 sm:p-4`}>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 truncate ${card.color}`}>S/ {Number(card.val).toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Acciones: en móvil 2x2 para que no se corte "Cerrar caja" */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button
              onClick={() => { setMovType('income'); setMovForm({ category: 'ingreso_manual', reference: '', amount: 0, notes: '', payment_method: 'efectivo' }); setShowMov(true) }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90"
            >
              <TrendingUp size={14} /> Ingreso
            </button>
            <button
              onClick={() => { setMovType('expense'); setMovForm({ category: 'egreso_manual', reference: '', amount: 0, notes: '', payment_method: 'efectivo' }); setShowMov(true) }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:opacity-90"
            >
              <TrendingDown size={14} /> Egreso
            </button>
            <button
              type="button"
              onClick={() => { setArqueoDraft(session?.arqueo_json ? parseArqueoJson(session.arqueo_json) : emptyArqueo()); setShowArqueoModal(true) }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              <Wallet size={14} /> Arqueo
            </button>
            <button
              onClick={() => { setCloseNotes(''); setCloseArqueo(session?.arqueo_json ? parseArqueoJson(session.arqueo_json) : emptyArqueo()); setCloseWithArqueo(!!session?.arqueo_json); setShowClose(true) }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 sm:ml-auto"
            >
              Cerrar caja
            </button>
          </div>

          {/* Movimientos */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="text-sm font-semibold text-gray-700">Movimientos de la sesión</p>
              <span className="text-xs text-gray-400">{movements.length} registros</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {movements.map(m => (
                <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {m.type === 'income' ? <TrendingUp size={14} className="text-green-500 flex-shrink-0" /> : <TrendingDown size={14} className="text-red-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{categoryLabel(m.category) || m.type}</p>
                      <p className="text-xs text-gray-400">{m.reference || '-'} · {new Date(m.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <p className={`font-bold text-sm flex-shrink-0 ${m.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                    {m.type === 'income' ? '+' : '-'} S/ {Number(m.amount).toFixed(2)}
                  </p>
                </div>
              ))}
              {movements.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos en esta sesión</div>}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Wallet size={40} className="text-gray-300 mb-4" />
          <h3 className="text-xl font-bold text-gray-700">Caja cerrada</h3>
          <p className="text-gray-400 text-sm mt-1 mb-6">Abre la caja para comenzar a registrar movimientos</p>
          <button onClick={() => setShowOpen(true)} className="px-6 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
            Abrir caja
          </button>
        </div>
      )}

      {/* Historial */}
      {showHistory && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-3 sm:px-4 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-700">Historial de sesiones</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50"><tr>{['Apertura','Cierre','Balance apert.','Balance cierre','Estado','Arqueo'].map(h => <th key={h} className="text-left px-3 sm:px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {history.map(s => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{new Date(s.opened_at).toLocaleString()}</td>
                    <td className="px-3 sm:px-4 py-2 text-xs whitespace-nowrap">{s.closed_at ? new Date(s.closed_at).toLocaleString() : '-'}</td>
                    <td className="px-3 sm:px-4 py-2 font-medium">S/ {Number(s.opening_balance).toFixed(2)}</td>
                    <td className="px-3 sm:px-4 py-2 font-medium">{s.closing_balance != null ? `S/ ${Number(s.closing_balance).toFixed(2)}` : '-'}</td>
                    <td className="px-3 sm:px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td>
                    <td className="px-3 sm:px-4 py-2">
                      {s.status === 'closed' && (
                        s.arqueo_json ? (
                          <button type="button" onClick={() => { setArqueoModalSession(s); setArqueoModalMode('view'); setArqueoForm(parseArqueoJson(s.arqueo_json)) }} className="text-xs text-[rgb(var(--p600))] hover:underline">Ver arqueo</button>
                        ) : (
                          <button type="button" onClick={() => { setArqueoModalSession(s); setArqueoModalMode('add'); setArqueoForm(emptyArqueo()) }} className="text-xs text-amber-600 hover:underline">Hacer arqueo</button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal abrir caja */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">Abrir caja</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Balance inicial (S/)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openBalance}
            onChange={e => setOpenBalance(Number(e.target.value))}
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
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={movForm.amount}
              onChange={e => setMovForm(f => ({ ...f, amount: Number(e.target.value) }))}
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
            <ArqueoTable
              arqueo={closeArqueo}
              editable
              onChange={setCloseArqueo}
              totalColorClass={arqueoSumColorClass(sumArqueo(closeArqueo), balance)}
            />
            {Math.abs(sumArqueo(closeArqueo) - balance) > 0.01 && (
              <p className={`text-xs ${sumArqueo(closeArqueo) > balance ? 'text-orange-600' : 'text-red-600'}`}>
                Diferencia con balance esperado: S/ {(sumArqueo(closeArqueo) - balance).toFixed(2)}
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
        <ArqueoTable
          arqueo={arqueoDraft}
          editable
          onChange={setArqueoDraft}
          totalColorClass={arqueoSumColorClass(sumArqueo(arqueoDraft), balance)}
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
              Sesión cerrada {arqueoModalSession.closed_at ? new Date(arqueoModalSession.closed_at).toLocaleString() : ''}. Balance esperado: S/ {(arqueoModalSession.expected_balance ?? 0).toFixed(2)}
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
