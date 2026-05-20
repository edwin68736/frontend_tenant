import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CreditCard,
  Plus,
  Pencil,
  RefreshCw,
  Receipt,
  Pause,
  Play,
  Ban,
  Trash2,
  History,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { companyService } from '@/services/company.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { productsService, type Product } from '@/services/products.service'
import {
  membershipsService,
  type Membership,
  type MembershipBillingRow,
  type BillingCycle,
} from '@/services/memberships.service'
import { getTodayPeru } from '@/utils/datesPeru'
import {
  buildMembershipWhatsAppUrl,
  daysUntilNextPayment,
  membershipPaymentTrafficClass,
} from '@/utils/membershipReminders'

const IGV_TYPES = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
]

const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Personalizado (días)' },
]

function formatMoney(n: number, cur: string) {
  return `${cur || 'PEN'} ${Number(n).toFixed(2)}`
}

function formatDate(s: string) {
  if (!s) return '—'
  const d = s.slice(0, 10)
  return d
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

/** SUNAT 00 = nota de venta (comprobante no electrónico típico para cobros internos). */
function defaultNotaVentaSeriesId(
  items: { id: number; series: string; doc_type: string; sunat_code?: string }[],
): string {
  const code = (s: { sunat_code?: string }) => String(s.sunat_code ?? '').trim()
  const nv = items.find(
    (s) => code(s) === '00' || /nota\s*(de\s*)?venta/i.test(String(s.doc_type ?? '')),
  )
  if (nv) return String(nv.id)
  return items[0] ? String(items[0].id) : ''
}

function membershipToEditForm(m: Membership) {
  return {
    product_id: m.product_id != null && m.product_id > 0 ? m.product_id : '',
    branch_id: m.branch_id,
    title: m.title ?? '',
    billing_cycle: m.billing_cycle,
    billing_interval_days: m.billing_interval_days ?? 0,
    amount: String(m.amount),
    end_date: m.end_date ? m.end_date.slice(0, 10) : '',
    notes: m.notes ?? '',
    igv_affectation_type: m.igv_affectation_type || '10',
    price_includes_igv: !!m.price_includes_igv,
    next_billing_date: (m.next_billing_date || '').slice(0, 10),
  }
}

export default function MembershipsPage() {
  return (
    <RequireModule moduleKey="memberships">
      <MembershipsContent />
    </RequireModule>
  )
}

function MembershipsContent() {
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const dueParamRaw = searchParams.get('due') || ''
  const dueKey =
    dueParamRaw === 'overdue' ||
    dueParamRaw === 'today' ||
    dueParamRaw === 'week' ||
    dueParamRaw === 'month'
      ? dueParamRaw
      : ''

  const [rows, setRows] = useState<Membership[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [qInput, setQInput] = useState('')
  const [qDebounced, setQDebounced] = useState('')

  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [series, setSeries] = useState<
    { id: number; series: string; doc_type: string; sunat_code?: string; branch_id: number }[]
  >([])

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editTargetId, setEditTargetId] = useState<number | null>(null)
  const [editClientLabel, setEditClientLabel] = useState('')
  const [customers, setCustomers] = useState<Contact[]>([])
  /** Solo servicios del catálogo (vínculo membresía ↔ SUNAT sin stock). */
  const [services, setServices] = useState<Product[]>([])

  const [createForm, setCreateForm] = useState({
    contact_id: '' as string | number,
    product_id: '' as string | number,
    branch_id: '' as string | number,
    title: '',
    billing_cycle: 'monthly' as BillingCycle,
    billing_interval_days: 30,
    amount: '',
    start_date: getTodayPeru(),
    end_date: '',
    notes: '',
    igv_affectation_type: '10',
    price_includes_igv: false,
  })

  const [detail, setDetail] = useState<Membership | null>(null)
  const [history, setHistory] = useState<MembershipBillingRow[]>([])
  const [showGenSale, setShowGenSale] = useState(false)
  const [genForm, setGenForm] = useState({
    series_id: '' as string | number,
    issue_date: getTodayPeru(),
    payment_method: 'cash',
    allow_early: false,
    notes: '',
  })

  const [editForm, setEditForm] = useState({
    product_id: '' as string | number,
    branch_id: '' as string | number,
    title: '',
    billing_cycle: 'monthly' as BillingCycle,
    billing_interval_days: 30,
    amount: '',
    end_date: '',
    notes: '',
    igv_affectation_type: '10',
    price_includes_igv: false,
    next_billing_date: '',
  })

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qInput), 400)
    return () => window.clearTimeout(t)
  }, [qInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const branch_id = branchFilter ? Number(branchFilter) : undefined
      const r = await membershipsService.list({
        ...(dueKey
          ? { due: dueKey }
          : { status: statusFilter || undefined }),
        branch_id: branch_id && branch_id > 0 ? branch_id : undefined,
        q: qDebounced.trim() || undefined,
        limit: 100,
        offset: 0,
      })
      setRows(r.data)
      setTotal(r.total)
    } catch {
      toast.error('No se pudieron cargar las membresías')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, branchFilter, qDebounced, dueKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      try {
        const b = await companyService.listBranches()
        setBranches((b as { id: number; name: string }[]) ?? [])
        const c = await contactsService.list('', 'customer')
        setCustomers(Array.isArray(c) ? c : [])
        const sr = await productsService.list('', undefined, undefined, true, 1, 500, undefined, 'service')
        setServices((sr.data ?? []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })))
      } catch {
        /* ignore */
      }
    })()
  }, [])

  useEffect(() => {
    const bid = Number(createForm.branch_id)
    if (!bid) {
      setSeries([])
      return
    }
    void companyService.listSeries({ branch_id: bid, category: 'venta' }).then((s) => {
      setSeries((s as typeof series) ?? [])
    })
  }, [createForm.branch_id])

  useEffect(() => {
    const bid = detail?.branch_id
    if (!bid || !showGenSale) return
    void companyService.listSeries({ branch_id: bid, category: 'venta' }).then((s) => {
      setSeries((s as typeof series) ?? [])
    })
  }, [detail?.branch_id, showGenSale])

  useEffect(() => {
    if (!showGenSale || series.length === 0) return
    setGenForm((g) => {
      const sid = g.series_id === '' ? NaN : Number(g.series_id)
      if (Number.isFinite(sid) && sid > 0 && series.some((x) => x.id === sid)) return g
      return { ...g, series_id: defaultNotaVentaSeriesId(series) }
    })
  }, [showGenSale, series])

  const serviceCatalogOptions = useMemo(
    () =>
      services.map((p) => ({
        value: String(p.id),
        label: [p.code?.trim(), p.name].filter(Boolean).join(' — ') || p.name,
      })),
    [services],
  )

  const loadDetailById = async (id: number) => {
    const full = await membershipsService.get(id)
    setDetail(full)
    const h = await membershipsService.billingHistory(id)
    setHistory(h)
  }

  const openDetail = async (m: Membership) => {
    try {
      await loadDetailById(m.id)
    } catch {
      toast.error('Error cargando detalle')
    }
  }

  const beginEditMembership = () => {
    if (!detail) return
    setEditTargetId(detail.id)
    setEditForm(membershipToEditForm(detail))
    setEditClientLabel(detail.contact_name ?? `Cliente #${detail.contact_id}`)
    setDetail(null)
    setShowEdit(true)
  }

  const openEditFromRow = async (m: Membership) => {
    try {
      const full = await membershipsService.get(m.id)
      setEditTargetId(full.id)
      setEditForm(membershipToEditForm(full))
      setEditClientLabel(full.contact_name ?? `Cliente #${full.contact_id}`)
      setShowEdit(true)
    } catch {
      toast.error('Error cargando membresía')
    }
  }

  const submitEdit = async () => {
    if (!editTargetId) return
    const branch_id = Number(editForm.branch_id)
    const amount = Number(editForm.amount)
    if (!branch_id || !(amount > 0)) {
      toast.error('Complete sucursal y monto')
      return
    }
    if (editForm.billing_cycle === 'custom' && editForm.billing_interval_days <= 0) {
      toast.error('Indique días válidos para ciclo personalizado')
      return
    }
    if (!editForm.next_billing_date) {
      toast.error('Indique la próxima fecha de cobro')
      return
    }
    try {
      await membershipsService.update(editTargetId, {
        title: editForm.title.trim(),
        product_id: editForm.product_id === '' ? 0 : Number(editForm.product_id),
        branch_id,
        billing_cycle: editForm.billing_cycle,
        billing_interval_days: editForm.billing_cycle === 'custom' ? editForm.billing_interval_days : 0,
        amount,
        end_date: editForm.end_date.trim() || null,
        notes: editForm.notes,
        igv_affectation_type: editForm.igv_affectation_type,
        price_includes_igv: editForm.price_includes_igv,
        next_billing_date: editForm.next_billing_date,
      })
      toast.success('Membresía actualizada')
      setShowEdit(false)
      const savedId = editTargetId
      setEditTargetId(null)
      void load()
      try {
        await loadDetailById(savedId)
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al guardar')
    }
  }

  const submitCreate = async () => {
    const branch_id = Number(createForm.branch_id)
    const contact_id = Number(createForm.contact_id)
    const amount = Number(createForm.amount)
    if (!contact_id || !branch_id || !createForm.start_date || !(amount > 0)) {
      toast.error('Complete cliente, sucursal, fecha de inicio y monto')
      return
    }
    if (createForm.billing_cycle === 'custom' && createForm.billing_interval_days <= 0) {
      toast.error('Indique días válidos para ciclo personalizado')
      return
    }
    try {
      await membershipsService.create({
        contact_id,
        branch_id,
        product_id: createForm.product_id === '' ? null : Number(createForm.product_id),
        title: createForm.title.trim(),
        billing_cycle: createForm.billing_cycle,
        billing_interval_days:
          createForm.billing_cycle === 'custom' ? createForm.billing_interval_days : 0,
        amount,
        start_date: createForm.start_date,
        end_date: createForm.end_date.trim() || null,
        notes: createForm.notes,
        igv_affectation_type: createForm.igv_affectation_type,
        price_includes_igv: createForm.price_includes_igv,
      })
      toast.success('Membresía creada')
      setShowCreate(false)
      setCreateForm((f) => ({
        ...f,
        contact_id: '',
        product_id: '',
        title: '',
        amount: '',
        end_date: '',
        notes: '',
        start_date: getTodayPeru(),
      }))
      void load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al crear')
    }
  }

  const changeStatus = async (m: Membership, status: Membership['status']) => {
    try {
      await membershipsService.setStatus(m.id, status)
      toast.success('Estado actualizado')
      void load()
      if (detail?.id === m.id) {
        const full = await membershipsService.get(m.id)
        setDetail(full)
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error')
    }
  }

  const remove = async (m: Membership) => {
    if (!window.confirm(`¿Eliminar membresía #${m.id}?`)) return
    try {
      await membershipsService.remove(m.id)
      toast.success('Eliminada')
      if (detail?.id === m.id) setDetail(null)
      void load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error')
    }
  }

  const submitGenerateSale = async () => {
    if (!detail) return
    const series_id = Number(genForm.series_id)
    if (!series_id) {
      toast.error('Seleccione un comprobante')
      return
    }
    try {
      await membershipsService.generateSale(detail.id, {
        series_id,
        issue_date: genForm.issue_date || undefined,
        payment_method: genForm.payment_method,
        allow_early: genForm.allow_early,
        notes: genForm.notes || undefined,
      })
      toast.success('Venta registrada. Puede enviarla a SUNAT desde Facturación si aplica.')
      setShowGenSale(false)
      void load()
      void openDetail(detail)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string }; status?: number } }
      const msg = err.response?.data?.error
      toast.error(msg ?? 'No se pudo generar la venta')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="text-[rgb(var(--p600))]" size={22} />
            Membresías y cuotas
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            disabled={!!dueKey}
            title={dueKey ? 'Al filtrar por próximo cobro solo se listan membresías activas' : undefined}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              if (searchParams.get('due')) {
                const n = new URLSearchParams(searchParams)
                n.delete('due')
                setSearchParams(n, { replace: true })
              }
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="paused">Pausadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="expired">Vencidas</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
          {hasPermission('memberships.create') && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-95"
            >
              <Plus size={16} /> Nueva membresía
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Sucursal</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">Todas</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Cliente</label>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Nombre, razón social o documento…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white w-full"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Próximo cobro</label>
          <select
            value={dueKey}
            onChange={(e) => {
              const v = e.target.value
              setSearchParams(
                (prev) => {
                  const n = new URLSearchParams(prev)
                  if (v) n.set('due', v)
                  else n.delete('due')
                  return n
                },
                { replace: true },
              )
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">Todos</option>
            <option value="overdue">Vencido (activas)</option>
            <option value="today">Cobro hoy</option>
            <option value="week">Próximos 7 días</option>
            <option value="month">Próximos 30 días</option>
          </select>
        </div>
        {dueKey ? (
          <p className="text-xs text-gray-500 sm:self-center sm:pb-1">
            Filtro de cobro: solo membresías <strong>activas</strong>.
          </p>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
          Total: <strong className="text-gray-800">{total}</strong>
        </div>
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">No hay membresías registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-left px-4 py-2">Ciclo</th>
                  <th className="text-right px-4 py-2">Monto</th>
                  <th className="text-left px-4 py-2">Próx. cobro</th>
                  <th className="text-left px-4 py-2">Días</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-center px-4 py-2 w-14">WA</th>
                  <th className="text-right px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((m) => {
                  const payDays = daysUntilNextPayment(m.next_billing_date)
                  const traffic = membershipPaymentTrafficClass(payDays)
                  const waUrl =
                    m.status === 'active'
                      ? buildMembershipWhatsAppUrl(m.contact_phone ?? '', {
                          clientName: m.contact_name ?? `Cliente #${m.contact_id}`,
                          concept: m.title?.trim() || 'su cuota',
                          amount: formatMoney(m.amount, m.currency),
                          dueDate: formatDate(m.next_billing_date),
                        })
                      : null
                  return (
                  <tr key={m.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{m.contact_name ?? `#${m.contact_id}`}</div>
                      {m.product_name && (
                        <div className="text-xs text-gray-500">{m.product_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{m.title || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 capitalize">{m.billing_cycle}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMoney(m.amount, m.currency)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{formatDate(m.next_billing_date)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${traffic}`}
                        title={
                          Number.isFinite(payDays)
                            ? payDays > 0
                              ? `Faltan ${payDays} día(s) para el cobro`
                              : payDays === 0
                                ? 'Cobro hoy'
                                : `Vencido hace ${Math.abs(payDays)} día(s)`
                            : undefined
                        }
                      >
                        {Number.isFinite(payDays)
                          ? payDays > 0
                            ? `${payDays} d`
                            : payDays === 0
                              ? 'Hoy'
                              : `${Math.abs(payDays)} venc.`
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : m.status === 'paused'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 rounded-lg text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Recordatorio por WhatsApp"
                        >
                          <WhatsAppGlyph className="w-5 h-5" />
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs" title={m.status !== 'active' ? 'Solo activas' : 'Sin teléfono'}>
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="text-[rgb(var(--p600))] text-xs font-medium mr-2"
                        onClick={() => void openDetail(m)}
                      >
                        Ver
                      </button>
                      {hasPermission('memberships.edit') && (
                        <button
                          type="button"
                          className="text-gray-600 text-xs font-medium mr-2 inline-flex items-center gap-1"
                          onClick={() => void openEditFromRow(m)}
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      {hasPermission('memberships.generate_sale') && m.status === 'active' && (
                        <button
                          type="button"
                          className="text-gray-700 text-xs font-medium mr-2 inline-flex items-center gap-1"
                          onClick={() => {
                            setDetail(m)
                            setGenForm((g) => ({
                              ...g,
                              series_id: '',
                              issue_date: getTodayPeru(),
                              allow_early: false,
                            }))
                            setShowGenSale(true)
                          }}
                        >
                          <Receipt size={12} /> Cobrar
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!detail && !showGenSale}
        onClose={() => setDetail(null)}
        contentClassName="max-w-lg w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto"
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <h3 className="font-bold text-gray-800 text-base">Membresía #{detail.id}</h3>
            <div className="grid grid-cols-2 gap-2 text-gray-600">
              <div>
                <span className="text-gray-400">Cliente</span>
                <p className="font-medium text-gray-900">{detail.contact_name}</p>
              </div>
              <div>
                <span className="text-gray-400">Monto</span>
                <p className="font-mono font-medium">{formatMoney(detail.amount, detail.currency)}</p>
              </div>
              <div>
                <span className="text-gray-400">Ciclo</span>
                <p className="capitalize">{detail.billing_cycle}</p>
              </div>
              <div>
                <span className="text-gray-400">Próximo cobro</span>
                <p>{formatDate(detail.next_billing_date)}</p>
              </div>
            </div>
            {detail.notes && (
              <div>
                <span className="text-gray-400 text-xs">Notas</span>
                <p className="text-gray-700 mt-0.5 whitespace-pre-wrap">{detail.notes}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {hasPermission('memberships.edit') && (
                <button
                  type="button"
                  onClick={beginEditMembership}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs bg-[rgb(var(--p600))] text-white border-[rgb(var(--p600))]"
                >
                  <Pencil size={14} /> Editar
                </button>
              )}
              {hasPermission('memberships.edit') && detail.status === 'active' && (
                <button
                  type="button"
                  onClick={() => changeStatus(detail, 'paused')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs"
                >
                  <Pause size={14} /> Pausar
                </button>
              )}
              {hasPermission('memberships.edit') && detail.status === 'paused' && (
                <button
                  type="button"
                  onClick={() => changeStatus(detail, 'active')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs"
                >
                  <Play size={14} /> Reactivar
                </button>
              )}
              {hasPermission('memberships.edit') && (
                <button
                  type="button"
                  onClick={() => changeStatus(detail, 'cancelled')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs text-red-700 border-red-200"
                >
                  <Ban size={14} /> Cancelar
                </button>
              )}
              {hasPermission('memberships.delete') && (
                <button
                  type="button"
                  onClick={() => remove(detail)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs text-red-700"
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1 mb-2">
                <History size={14} /> Historial de cobros
              </h4>
              {history.length === 0 ? (
                <p className="text-gray-400 text-xs">Sin ventas generadas aún.</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="flex justify-between gap-2 border-b border-gray-50 pb-1">
                      <span className="font-mono text-gray-800">{h.sale_number}</span>
                      <span className="text-gray-500">
                        {formatDate(h.period_start)} → {formatDate(h.period_end)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} contentClassName="max-w-lg w-full mx-2 sm:mx-0">
        <div className="space-y-3 text-sm">
          <h3 className="font-bold text-gray-800 text-base">Nueva membresía</h3>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente *</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={createForm.contact_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, contact_id: e.target.value }))}
            >
              <option value="">Seleccione…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name} — {c.doc_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Servicio (opcional)</label>
            <SearchSelect
              options={serviceCatalogOptions}
              value={createForm.product_id === '' ? '' : String(createForm.product_id)}
              onChange={(v) => setCreateForm((f) => ({ ...f, product_id: v }))}
              placeholder="Sin servicio"
              showSearchOnlyWhenMany={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal *</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={createForm.branch_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, branch_id: e.target.value }))}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={createForm.amount}
                onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Concepto</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ciclo *</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={createForm.billing_cycle}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, billing_cycle: e.target.value as BillingCycle }))
                }
              >
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {createForm.billing_cycle === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cada (días)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2"
                  value={createForm.billing_interval_days}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, billing_interval_days: Number(e.target.value) || 1 }))
                  }
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Inicio *</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={createForm.start_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fin (opcional)</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={createForm.end_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pigv"
              type="checkbox"
              checked={createForm.price_includes_igv}
              onChange={(e) => setCreateForm((f) => ({ ...f, price_includes_igv: e.target.checked }))}
            />
            <label htmlFor="pigv" className="text-xs text-gray-600">
              Precio incluye IGV
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setShowCreate(false)}>
              Cerrar
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg bg-[rgb(var(--p600))] text-white"
              onClick={() => void submitCreate()}
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showEdit}
        onClose={() => {
          setShowEdit(false)
          setEditTargetId(null)
          setEditClientLabel('')
        }}
        contentClassName="max-w-lg w-full mx-2 sm:mx-0"
      >
        <div className="space-y-3 text-sm">
          <h3 className="font-bold text-gray-800 text-base">Editar membresía</h3>
          <p className="text-xs text-gray-500">{editClientLabel}</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Servicio (opcional)</label>
            <SearchSelect
              options={serviceCatalogOptions}
              value={editForm.product_id === '' ? '' : String(editForm.product_id)}
              onChange={(v) => setEditForm((f) => ({ ...f, product_id: v }))}
              placeholder="Sin servicio"
              showSearchOnlyWhenMany={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal *</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={editForm.branch_id}
                onChange={(e) => setEditForm((f) => ({ ...f, branch_id: e.target.value }))}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Concepto</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ciclo *</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={editForm.billing_cycle}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, billing_cycle: e.target.value as BillingCycle }))
                }
              >
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {editForm.billing_cycle === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cada (días)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2"
                  value={editForm.billing_interval_days}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, billing_interval_days: Number(e.target.value) || 1 }))
                  }
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Próximo cobro *</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={editForm.next_billing_date}
                onChange={(e) => setEditForm((f) => ({ ...f, next_billing_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fin (opcional)</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
                value={editForm.end_date}
                onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Afectación IGV</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={editForm.igv_affectation_type}
              onChange={(e) => setEditForm((f) => ({ ...f, igv_affectation_type: e.target.value }))}
            >
              {IGV_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="eigv"
              type="checkbox"
              checked={editForm.price_includes_igv}
              onChange={(e) => setEditForm((f) => ({ ...f, price_includes_igv: e.target.checked }))}
            />
            <label htmlFor="eigv" className="text-xs text-gray-600">
              Precio incluye IGV
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm border rounded-lg"
              onClick={() => {
                setShowEdit(false)
                setEditTargetId(null)
                setEditClientLabel('')
              }}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg bg-[rgb(var(--p600))] text-white"
              onClick={() => void submitEdit()}
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showGenSale} onClose={() => setShowGenSale(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <div className="space-y-3 text-sm">
          <h3 className="font-bold text-gray-800 text-base">Generar venta</h3>
          {detail && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <span className="text-xs text-gray-500">Total a cobrar</span>
              <span className="font-mono text-base font-semibold text-gray-900">
                {formatMoney(detail.amount, detail.currency)}
              </span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Comprobante *</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={genForm.series_id}
              onChange={(e) => setGenForm((f) => ({ ...f, series_id: e.target.value }))}
            >
              <option value="">Seleccione…</option>
              {[...series]
                .sort((a, b) => {
                  const rank = (s: (typeof series)[0]) => (String(s.sunat_code ?? '').trim() === '00' ? 0 : 1)
                  return rank(a) - rank(b) || a.series.localeCompare(b.series)
                })
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.doc_type || '').trim() || s.series}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha emisión</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={genForm.issue_date}
              onChange={(e) => setGenForm((f) => ({ ...f, issue_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={genForm.payment_method}
              onChange={(e) => setGenForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              <option value="cash">Efectivo (cash)</option>
              <option value="yape">Yape</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="early"
              type="checkbox"
              checked={genForm.allow_early}
              onChange={(e) => setGenForm((f) => ({ ...f, allow_early: e.target.checked }))}
            />
            <label htmlFor="early" className="text-xs text-gray-600">
              Cobro anticipado (antes de la fecha de próximo cobro)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setShowGenSale(false)}>
              Cerrar
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg bg-[rgb(var(--p600))] text-white"
              onClick={() => void submitGenerateSale()}
            >
              Generar venta
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
