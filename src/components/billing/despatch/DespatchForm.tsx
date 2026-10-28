import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, PackageOpen, Truck, FileText, Search, X } from 'lucide-react'
import { billingService, type SunatDespatch } from '@/services/billing.service'
import { companyService, type BranchRow } from '@/services/company.service'
import { fleetService } from '@/services/fleet.service'
import {
  filterGuiaSeriesBySunatCode,
  type GuiaSeriesRow,
} from '@/utils/despatchSeries'
import { getTodayPeru } from '@/utils/datesPeru'
import { SearchableSelect } from '@/components/SearchableSelect'
import { consultaService } from '@/services/consulta.service'
import {
  MOTIVOS,
  emptyRelatedDoc,
  isValidRuc,
  splitDocNumber,
  type RelatedDocDraft,
  buildPayload,
  emptyDraft,
  emptyParty,
  emptyPlace,
  newKey,
  partyIsCompany,
  partyRoleLabel,
  validateDraft,
  type DespatchDraft,
  type FleetCatalog,
  type GreKind,
  type Place,
  type SectionId,
} from './despatchModel'
import { buildDespatchPrefillFromSaleDetail, type DespatchPrefill } from './prefill'
import { salesService, type Sale } from '@/services/sales.service'
import { SalePicker } from './SalePicker'
import { GrePicker } from './GrePicker'
import { PartyPicker } from './PartyPicker'
import { PlaceCard } from './PlaceCard'
import { TransportPicker } from './TransportPicker'
import { ItemsTable } from './CargoSection'
import { MoreOptions } from './MoreOptions'
import { Section, inputCls } from './ui'

export interface DespatchFormProps {
  /** Tipo de guía ya elegido (por la ruta o por venir de un comprobante). Sin valor = se pregunta primero. */
  initialKind?: GreKind
  onClose: () => void
  onCreated: (d: SunatDespatch, kind: GreKind) => void
  series: GuiaSeriesRow[]
  branches: { id: number; name: string }[]
  mainBranchId: number
  /** Comprobante de origen: guía de venta con cliente, ítems y sucursal precargados. */
  prefill?: DespatchPrefill | null
  title?: string
  layout?: 'page' | 'modal'
}

const normPlate = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')
const cleanDoc = (s: string) => s.replace(/-/g, '').trim()

export function DespatchForm({
  initialKind,
  onClose,
  onCreated,
  series,
  branches,
  mainBranchId,
  prefill,
  title,
  layout = 'page',
}: DespatchFormProps) {
  const [kind, setKind] = useState<GreKind | null>(prefill ? '09' : (initialKind ?? null))
  const [draft, setDraft] = useState<DespatchDraft>(() => {
    const d = emptyDraft(prefill ? '09' : (initialKind ?? '09'), prefill?.branchId ?? mainBranchId)
    if (prefill) {
      d.party = prefill.party
      d.items = prefill.items
      d.sourceSaleId = prefill.sourceSaleId
      d.sourceLabel = prefill.sourceLabel
      d.bultos = String(Math.max(1, Math.ceil(prefill.items.reduce((s, i) => s + i.cantidad, 0))))
    }
    return d
  })
  const [fleet, setFleet] = useState<FleetCatalog>({ carriers: [], drivers: [], vehicles: [] })
  const [company, setCompany] = useState({ ruc: '', razon: '', address: '', ubigeo: '' })
  const [branchRows, setBranchRows] = useState<BranchRow[]>([])
  const [sending, setSending] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<SectionId, boolean>>>({})
  const [attempted, setAttempted] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [origin, setOrigin] = useState<'independiente' | '01' | '03' | 'gre' | 'externa'>('independiente')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [fleetReady, setFleetReady] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const patch = useCallback((p: Partial<DespatchDraft>, section?: SectionId) => {
    setDraft((d) => ({ ...d, ...p }))
    if (section) setTouched((t) => ({ ...t, [section]: true }))
  }, [])

  const kindNow: GreKind = kind ?? '09'
  const is09 = kindNow === '09'

  // ---- Datos de la empresa, sucursales y flota -------------------------------------------------
  useEffect(() => {
    companyService
      .getConfig()
      .then((cfg) =>
        setCompany({
          ruc: cleanDoc(cfg.ruc ?? ''),
          razon: cfg.business_name ?? '',
          address: cfg.address ?? '',
          ubigeo: cfg.ubigeo ?? '',
        }),
      )
      .catch(() => {})
    companyService
      .listBranches()
      .then((rows) => setBranchRows(Array.isArray(rows) ? rows : []))
      .catch(() => {})
    Promise.all([
      fleetService.listCarriers({ active_only: true }),
      fleetService.listDrivers({ active_only: true }),
      fleetService.listVehicles({ active_only: true }),
    ])
      .then(([carriers, drivers, vehicles]) => {
        setFleet({ carriers, drivers, vehicles })
        setFleetReady(true)
      })
      .catch(() => setFleetReady(true))
  }, [])

  // Último conductor/vehículo usados por la sucursal (con el predeterminado como respaldo).
  const preselectedFor = useRef('')
  useEffect(() => {
    if (!fleetReady || !kind) return
    const key = `${kind}:${draft.branchId}`
    if (preselectedFor.current === key) return
    preselectedFor.current = key
    Promise.all([billingService.lastDespatchTransport(draft.branchId, kind).catch(() => null), fleetService.defaults().catch(() => ({}))]).then(
      ([last, defaults]) => {
        const def = defaults as Awaited<ReturnType<typeof fleetService.defaults>>
        const driverByDoc = last?.found && last.driver_doc ? fleet.drivers.find((d) => d.doc_number === last.driver_doc) : undefined
        const vehicleByPlate = last?.found && last.placa ? fleet.vehicles.find((v) => normPlate(v.plate) === normPlate(last.placa!)) : undefined
        const carrierByDoc = last?.found && last.carrier_doc ? fleet.carriers.find((c) => c.doc_number === last.carrier_doc) : undefined
        const driver = driverByDoc ?? def.driver
        const vehicle = vehicleByPlate ?? def.vehicle
        const carrier = carrierByDoc ?? def.carrier
        setDraft((d) => ({
          ...d,
          driverId: d.driverId === '' && driver ? driver.id : d.driverId,
          vehicleId: d.vehicleId === '' && vehicle ? vehicle.id : d.vehicleId,
          carrierId: d.carrierId === '' && carrier ? carrier.id : d.carrierId,
          transporte: kind === '09' && last?.found && last.mod_traslado === '01' && carrierByDoc ? 'empresa' : d.transporte,
        }))
      },
    )
  }, [fleetReady, kind, draft.branchId, fleet])

  const branchById = useCallback((id: number | null | undefined) => branchRows.find((b) => b.id === id), [branchRows])
  const placeOfBranch = useCallback(
    (id: number): Place => {
      const b = branchById(id)
      return {
        address: b?.address?.trim() || company.address,
        ubigeo: /^\d{6}$/.test(b?.fiscal_domicile_code?.trim() ?? '') ? b!.fiscal_domicile_code!.trim() : company.ubigeo,
        branchId: id,
      }
    },
    [branchById, company],
  )

  // ---- Puntos de partida y llegada que siguen a lo elegido mientras no se toquen --------------
  useEffect(() => {
    if (!kind || (branchRows.length === 0 && !company.address)) return
    setDraft((d) => {
      let partida = d.partida
      let llegada = d.llegada
      const mine = placeOfBranch(d.branchId)
      if (d.kind === '31') {
        if (!d.partidaTouched) partida = { address: d.party.address, ubigeo: d.party.ubigeo, branchId: null }
        if (!d.llegadaTouched) llegada = { address: d.receiver.address, ubigeo: d.receiver.ubigeo, branchId: null }
      } else if (d.motivo === 'compra') {
        if (!d.partidaTouched) partida = { address: d.party.address, ubigeo: d.party.ubigeo, branchId: null }
        if (!d.llegadaTouched) llegada = mine
      } else if (d.motivo === 'traslado') {
        if (!d.partidaTouched) partida = mine
        if (!d.llegadaTouched) llegada = d.destinoBranchId ? placeOfBranch(d.destinoBranchId) : emptyPlace()
      } else {
        if (!d.partidaTouched) partida = mine
        if (!d.llegadaTouched) llegada = { address: d.party.address, ubigeo: d.party.ubigeo, branchId: null }
      }
      const same = (a: Place, b: Place) => a.address === b.address && a.ubigeo === b.ubigeo && a.branchId === b.branchId
      if (same(partida, d.partida) && same(llegada, d.llegada)) return d
      return { ...d, partida, llegada }
    })
  }, [kind, draft.motivo, draft.branchId, draft.destinoBranchId, draft.party.address, draft.party.ubigeo, draft.receiver.address, draft.receiver.ubigeo, draft.partidaTouched, draft.llegadaTouched, branchRows, company, placeOfBranch])

  // ---- Serie ----------------------------------------------------------------------------------
  const seriesForKind = useMemo(
    () => filterGuiaSeriesBySunatCode(series, kindNow).filter((s) => !s.branch_id || s.branch_id === draft.branchId),
    [series, kindNow, draft.branchId],
  )
  const seriesId = seriesForKind[0]?.id ?? 0

  const errors = useMemo(
    () => (kind ? validateDraft(draft, { companyRuc: company.ruc, fleet, hasSeries: seriesId > 0 }) : {}),
    [kind, draft, company.ruc, fleet, seriesId],
  )
  const showErr = (s: SectionId) => attempted || !!touched[s]
  const allErrors = Object.values(errors).flat()

  // ---- Acciones -------------------------------------------------------------------------------
  const chooseKind = (k: GreKind) => {
    setKind(k)
    setDraft((d) => ({ ...emptyDraft(k, d.branchId), driverId: d.driverId, vehicleId: d.vehicleId, carrierId: d.carrierId }))
    setTouched({})
    setAttempted(false)
    preselectedFor.current = ''
  }

  const chooseMotivo = (m: DespatchDraft['motivo']) => {
    setDraft((d) => ({
      ...d,
      motivo: m,
      // Cada motivo tiene su propia "otra parte": no arrastrar la del motivo anterior.
      party: m === d.motivo ? d.party : emptyParty(),
      destinoBranchId: null,
      partidaTouched: false,
      llegadaTouched: false,
      devolucionHacia: 'cliente',
      // La empresa de transporte distinta no cambia con el motivo.
    }))
    setTouched((t) => ({ ...t, motivo: true }))
  }

  // Documento relacionado: la factura/boleta (o la GRE remitente) se envía a SUNAT como documento relacionado y trae cliente y productos.
  const changeOrigin = (o: 'independiente' | '01' | '03' | 'gre' | 'externa') => {
    setOrigin(o)
    setDraft((d) => ({
      ...d,
      needsRelatedGre: d.kind === '31' && (o === 'gre' || o === 'externa'),
      docsRel: [...d.docsRel.filter((x) => !x.primary), ...(o === 'externa' ? [{ ...emptyRelatedDoc('09'), primary: true }] : [])],
      receiver: d.kind === '31' ? emptyParty() : d.receiver,
      needsSource: o === '01' || o === '03',
      sourceSaleId: null,
      sourceLabel: '',
      items: [],
      party: emptyParty(),
      motivo: 'venta',
      partidaTouched: false,
      llegadaTouched: false,
      bultos: '1',
      bultosTouched: false,
    }))
  }

  const pickSale = async (sale: Sale) => {
    setSourceLoading(true)
    setDraft((d) => ({ ...d, sourceLabel: `${sale.series}-${sale.number}` }))
    try {
      const pre = buildDespatchPrefillFromSaleDetail(await salesService.get(sale.id))
      setDraft((d) => ({
        ...d,
        branchId: pre.branchId,
        party: pre.party,
        items: pre.items,
        sourceSaleId: pre.sourceSaleId,
        sourceLabel: pre.sourceLabel,
        motivo: 'venta',
        bultos: String(Math.max(1, Math.ceil(pre.items.reduce((acc, i) => acc + i.cantidad, 0)))),
        bultosTouched: false,
        partidaTouched: false,
        llegadaTouched: false,
      }))
    } catch {
      toast.error('No se pudo cargar el comprobante')
      setDraft((d) => ({ ...d, sourceLabel: '' }))
    } finally {
      setSourceLoading(false)
    }
  }

  // Guía remitente de otra empresa/sistema: no se consulta la BD; se registra como documento relacionado.
  const primaryDoc = draft.docsRel.find((x) => x.primary)
  const setPrimaryDoc = (p: Partial<RelatedDocDraft>) => setDraft((d) => ({ ...d, docsRel: d.docsRel.map((x) => (x.primary ? { ...x, ...p } : x)) }))

  const useExternalGre = (raw: string) => {
    const { serie, numero } = splitDocNumber(raw)
    setOrigin('externa')
    setDraft((d) => ({
      ...d,
      needsRelatedGre: true,
      docsRel: [...d.docsRel.filter((x) => !x.primary), { ...emptyRelatedDoc('09', d.party.num_doc), serie, numero, primary: true }],
    }))
  }

  const consultExternalRuc = async (ruc: string) => {
    if (!company.ruc || !isValidRuc(ruc) || ruc === company.ruc) return
    try {
      const res = await consultaService.ruc(company.ruc, ruc)
      if (!res.success || !res.razon_social) return
      setDraft((d) =>
        d.party.num_doc === ruc
          ? d
          : { ...d, partidaTouched: false, party: { tipo_doc: '6', num_doc: ruc, rzn_social: res.razon_social ?? '', address: res.direccion ?? res.direccion_completa ?? '', ubigeo: res.ubigeo ?? '' } },
      )
    } catch {
      /* la consulta es una ayuda: si falla, el remitente se completa a mano */
    }
  }

  const loadRelatedGre = async (numberArg: string) => {
    const number = numberArg.trim()
    if (!number) return
    setLookupBusy(true)
    try {
      const r = await billingService.lookupDespatch(number)
      setDraft((d) => ({
        ...d,
        docsRel: [...d.docsRel.filter((x) => !x.primary), { tipo: '09', ruc: r.remitente.num_doc, ...splitDocNumber(r.number), primary: true }],
        party: { tipo_doc: r.remitente.tipo_doc, num_doc: r.remitente.num_doc, rzn_social: r.remitente.rzn_social, address: r.partida.direccion, ubigeo: r.partida.ubigueo },
        receiver: { tipo_doc: r.destinatario.tipo_doc, num_doc: r.destinatario.num_doc, rzn_social: r.destinatario.rzn_social, address: r.llegada.direccion, ubigeo: r.llegada.ubigueo },
        partidaTouched: false,
        llegadaTouched: false,
        peso: r.peso_total ? String(r.peso_total) : d.peso,
        bultos: r.num_bultos ? String(r.num_bultos) : d.bultos,
        bultosTouched: true,
        items: r.details.map((x) => ({ key: newKey(), product_id: null, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad || 'NIU', cantidad: x.cantidad })),
      }))
      toast.success(`Cargamos los datos de la guía ${r.number}`)
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      useExternalGre(number)
      toast.message(msg ?? 'No encontramos esa guía en tu sistema, se enviará como documento relacionado.', { description: 'Completa el RUC del remitente, la serie y el número.' })
    } finally {
      setLookupBusy(false)
    }
  }

  const submit = () => {
    setAttempted(true)
    if (!kind) return
    if (allErrors.length > 0) {
      toast.error('Revisa las secciones marcadas antes de emitir la guía.')
      const first = (['motivo', 'party', 'route', 'transport', 'cargo'] as SectionId[]).find((s) => errors[s]?.length)
      if (first) document.querySelector(`[data-sec="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSending(true)
    billingService
      .createDespatch(buildPayload(draft, seriesId, fleet, { ruc: company.ruc, razon: company.razon }))
      .then(({ despatch, message }) => {
        toast.success(message ?? 'Guía encolada para emisión SUNAT')
        onCreated(despatch, kind)
      })
      .catch((err: { response?: { data?: { error?: string } } }) => toast.error(err.response?.data?.error ?? 'No se pudo emitir la guía'))
      .finally(() => setSending(false))
  }

  // ---- Cabecera y paso inicial ----------------------------------------------------------------
  const listPath = kindNow === '31' ? '/billing/docs/despatches/transportista' : '/billing/docs/despatches/remitente'
  const header = (
    <header className="flex items-center gap-3 pb-4 border-b border-gray-100">
      {layout === 'page' ? (
        <Link to={listPath} className="inline-flex p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0" aria-label="Volver a guías">
          <ArrowLeft size={18} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-bold text-gray-900">{title ?? 'Nueva guía de remisión'}</h1>
        <p className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1">
          {kind ? (kind === '31' ? 'Guía de remisión transportista' : 'Guía de remisión remitente') : 'Elige el tipo de guía'}
          {draft.sourceLabel && (
            <>
              <FileText size={12} className="ml-2" /> Desde el comprobante <strong className="font-mono">{draft.sourceLabel}</strong>
            </>
          )}
        </p>
      </div>
      {layout === 'modal' && (
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Cerrar">
          <X size={18} />
        </button>
      )}
    </header>
  )
  const shell = layout === 'page' ? 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5' : 'space-y-5'

  if (!kind) {
    return (
      <div className={shell}>
        {header}
        <h2 className="text-base font-semibold text-gray-900">¿Qué guía necesitas?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={() => chooseKind('09')} className="text-left rounded-2xl border border-gray-200 bg-white p-5 hover:border-[rgb(var(--p400))] hover:shadow-sm transition">
            <PackageOpen size={26} className="text-[rgb(var(--p600))]" />
            <p className="mt-3 font-semibold text-gray-900">Yo envío mis mercaderías</p>
            <p className="text-sm text-gray-500 mt-1">Ventas, traslados entre mis locales, compras, devoluciones. Guía de remisión remitente.</p>
          </button>
          <button type="button" onClick={() => chooseKind('31')} className="text-left rounded-2xl border border-gray-200 bg-white p-5 hover:border-[rgb(var(--p400))] hover:shadow-sm transition">
            <Truck size={26} className="text-[rgb(var(--p600))]" />
            <p className="mt-3 font-semibold text-gray-900">Yo transporto mercaderías de otros</p>
            <p className="text-sm text-gray-500 mt-1">Soy la empresa de transporte y llevo la carga de un remitente. Guía de remisión transportista.</p>
          </button>
        </div>
      </div>
    )
  }

  // ---- Campos ---------------------------------------------------------------------------------
  const sourceLocked = draft.sourceSaleId != null
  const publico = is09 && draft.transporte === 'empresa'
  const partyType: 'customer' | 'supplier' | '' =
    draft.motivo === 'compra' || (draft.motivo === 'devolucion' && draft.devolucionHacia === 'proveedor') ? 'supplier' : draft.motivo === 'otros' ? '' : 'customer'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const fromBranchName = branchById(draft.branchId)?.name ?? ''
  const branchOptions = branchRows.filter((b) => b.active !== false)
  const partidaTitle = is09 ? (draft.motivo === 'compra' ? 'Punto de partida (proveedor)' : 'Punto de partida') : 'Punto de partida (remitente)'
  const llegadaTitle = is09 ? (draft.motivo === 'compra' ? 'Punto de llegada (mi local)' : 'Punto de llegada') : 'Punto de llegada (destinatario)'

  const summary = [
    is09 ? (MOTIVOS.find((m) => m.id === draft.motivo)?.title ?? '') : 'Transporte de carga',
    is09 && !partyIsCompany(draft) && draft.party.rzn_social ? draft.party.rzn_social : !is09 && draft.receiver.rzn_social ? `para ${draft.receiver.rzn_social}` : '',
    Number(draft.peso) > 0 ? `${draft.peso} kg` : '',
    draft.items.length ? `${draft.items.length} ítem${draft.items.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const body = (
    <div className="space-y-5 text-sm" ref={topRef}>
      {!sourceLocked && !initialKind && (
        <button type="button" onClick={() => setKind(null)} className="text-xs text-gray-500 hover:text-gray-800 underline">
          Cambiar el tipo de guía
        </button>
      )}

      {/* Origen de la guía (remitente): independiente o desde una factura/boleta ya emitida. */}
      {!prefill && (
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="col-span-2 lg:col-span-4">
            <label className={lbl}>Documento relacionado *</label>
            <select className={inputCls} value={origin} onChange={(e) => changeOrigin(e.target.value as 'independiente' | '01' | '03' | 'gre' | 'externa')}>
              <option value="independiente">Ninguno (guía independiente)</option>
              {is09 ? (
                <>
                  <option value="01">Factura</option>
                  <option value="03">Boleta</option>
                </>
              ) : (
                <>
                  <option value="gre">Guía remitente: buscar en mis guías</option>
                  <option value="externa">Guía remitente: es de otra empresa</option>
                </>
              )}
            </select>
          </div>
          {origin === 'gre' && !is09 && (
            <div className="col-span-2 lg:col-span-8">
              <label className={lbl}>Guía de remisión remitente *</label>
              <GrePicker
                key="gre"
                selectedLabel={primaryDoc && primaryDoc.serie && primaryDoc.numero ? `${primaryDoc.serie}-${primaryDoc.numero}` : ''}
                onPick={(n) => void loadRelatedGre(n)}
                onUseExternal={useExternalGre}
                onClear={() => changeOrigin('gre')}
              />
            </div>
          )}
          {origin === 'externa' && !is09 && primaryDoc && (
            <div className="col-span-2 lg:col-span-8">
              <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
                <div className="col-span-2 lg:col-span-6">
                  <label className={lbl}>RUC del remitente (emisor de la guía) *</label>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="11 dígitos"
                    value={primaryDoc.ruc}
                    onChange={(e) => {
                      const ruc = e.target.value.replace(/\D/g, '')
                      setPrimaryDoc({ ruc })
                      if (isValidRuc(ruc)) void consultExternalRuc(ruc)
                    }}
                  />
                  {primaryDoc.ruc.length === 11 && !isValidRuc(primaryDoc.ruc) && <p className="text-[11px] text-red-600 mt-1">El RUC no es válido.</p>}
                </div>
                <div className="lg:col-span-3">
                  <label className={lbl}>Serie *</label>
                  <input className={inputCls} maxLength={4} placeholder="T001" value={primaryDoc.serie} onChange={(e) => setPrimaryDoc({ serie: e.target.value.toUpperCase() })} />
                </div>
                <div className="lg:col-span-3">
                  <label className={lbl}>Número *</label>
                  <input className={inputCls} inputMode="numeric" maxLength={8} placeholder="123" value={primaryDoc.numero} onChange={(e) => setPrimaryDoc({ numero: e.target.value.replace(/\D/g, '') })} />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">No se consulta la guía: se envía a SUNAT como documento relacionado. Con el RUC traemos los datos del remitente, que puedes editar abajo.</p>
            </div>
          )}
          {is09 && origin !== 'independiente' && (

            <div className="col-span-2 lg:col-span-8">
              <label className={lbl}>{origin === '01' ? 'Factura *' : 'Boleta *'}</label>
              <SalePicker key={origin} sunatCode={origin as '01' | '03'} selectedLabel={draft.sourceLabel} loading={sourceLoading} onPick={(s) => void pickSale(s)} onClear={() => changeOrigin(origin)} />
            </div>
          )}
        </div>
      )}

      {/* Documento: misma grilla de 12 columnas que el formulario de ventas. */}
      <div className="grid grid-cols-2 lg:grid-cols-12 gap-3" data-sec="motivo">
        <div className="lg:col-span-3">
          <label className={lbl}>Sucursal</label>
          <select
            className={inputCls}
            value={draft.branchId}
            disabled={sourceLocked}
            onChange={(e) => patch({ branchId: Number(e.target.value), partidaTouched: false, llegadaTouched: false })}
          >
            {(branchOptions.length ? branchOptions : branches).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className={lbl}>Serie</label>
          <select className={`${inputCls} font-mono`} value={seriesId || ''} disabled>
            {seriesForKind.length === 0 && <option value="">Sin serie</option>}
            {seriesForKind.map((s) => (
              <option key={s.id} value={s.id}>
                {s.series}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className={lbl}>Fecha de emisión</label>
          <input type="date" className={inputCls} value={getTodayPeru()} disabled />
        </div>
        <div className="lg:col-span-2">
          <label className={lbl}>Fecha de traslado *</label>
          <input type="date" min={getTodayPeru()} className={inputCls} value={draft.fecha} onChange={(e) => patch({ fecha: e.target.value }, 'cargo')} />
        </div>
        {is09 ? (
          <div className="col-span-2 lg:col-span-3">
            <label className={lbl}>Motivo de traslado *</label>
            <select className={inputCls} value={draft.motivo} onChange={(e) => chooseMotivo(e.target.value as DespatchDraft['motivo'])}>
              {MOTIVOS.map((m) => (
                <option key={m.id} value={m.id} disabled={sourceLocked && (m.id === 'traslado' || m.id === 'compra')}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {is09 && draft.motivo === 'otros' && (
          <div className="col-span-2 lg:col-span-12">
            <label className={lbl}>Descripción del motivo *</label>
            <input className={inputCls} maxLength={100} value={draft.otrosDescripcion} onChange={(e) => patch({ otrosDescripcion: e.target.value }, 'motivo')} placeholder="Ej. Muestras para una feria" />
          </div>
        )}
      </div>
      {showErr('motivo') &&
        errors.motivo?.map((e, i) => (
          <p key={i} className="text-xs text-red-600">
            {e}
          </p>
        ))}

      {/* Destinatario / remitente */}
      <Section errors={errors.party} showErrors={showErr('party')}>
        {is09 ? (
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
            {draft.motivo === 'traslado' ? (
              <div className="col-span-2 lg:col-span-6">
                <label className={lbl}>Sucursal de destino *</label>
                <SearchableSelect
                  value={draft.destinoBranchId}
                  onChange={(v) => patch({ destinoBranchId: v === null ? null : Number(v), llegadaTouched: false }, 'party')}
                  options={branchRows.filter((b) => b.active !== false && b.id !== draft.branchId).map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={branchRows.length <= 1 ? 'Necesitas otra sucursal registrada' : 'Seleccionar sucursal'}
                  searchable={false}
                />
                <p className="text-[11px] text-gray-400 mt-1">El destinatario es tu propia empresa.</p>
              </div>
            ) : (
              <div className="col-span-2 lg:col-span-8">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">{partyRoleLabel(draft)} *</label>
                  {draft.motivo === 'devolucion' && (
                    <span className="inline-flex gap-3 text-xs text-gray-600">
                      {(['cliente', 'proveedor'] as const).map((h) => (
                        <label key={h} className="inline-flex items-center gap-1 cursor-pointer">
                          <input type="radio" checked={draft.devolucionHacia === h} onChange={() => patch({ devolucionHacia: h, party: emptyParty(), llegadaTouched: false }, 'party')} />
                          {h === 'cliente' ? 'Cliente' : 'Proveedor'}
                        </label>
                      ))}
                    </span>
                  )}
                </div>
                <PartyPicker
                  key={`party-${draft.motivo}-${draft.devolucionHacia}-${draft.kind}`}
                  value={draft.party}
                  onChange={(p) => patch({ party: p, partidaTouched: false, llegadaTouched: false }, 'party')}
                  contactType={partyType}
                  companyRuc={company.ruc}
                  requireAddress={draft.motivo === 'compra'}
                  addressLabel="Dirección"
                  placeholder="Buscar por RUC, DNI o nombre"
                />
              </div>
            )}
            <div className="col-span-2 lg:col-span-4">
              <label className={lbl}>Modalidad de traslado *</label>
              <select className={inputCls} value={draft.transporte} onChange={(e) => patch({ transporte: e.target.value as 'propio' | 'empresa' }, 'transport')}>
                <option value="propio">Transporte privado</option>
                <option value="empresa">Transporte público</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Remitente (quien entrega la mercadería) *</label>
              <PartyPicker
                key="remitente"
                value={draft.party}
                onChange={(p) => patch({ party: p, partidaTouched: false }, 'party')}
                contactType=""
                companyRuc={company.ruc}
                requireAddress
                addressLabel="Dirección fiscal"
                placeholder="Buscar por RUC, DNI o nombre"
              />
            </div>
            <div>
              <label className={lbl}>Destinatario (quien recibe la mercadería) *</label>
              <PartyPicker
                key="receiver"
                value={draft.receiver}
                onChange={(p) => patch({ receiver: p, llegadaTouched: false }, 'party')}
                contactType=""
                companyRuc={company.ruc}
                placeholder="Buscar por RUC, DNI o nombre"
              />
            </div>
          </div>
        )}
      </Section>

      {/* Datos de envío */}
      <Section title="Datos de envío" errors={errors.route} showErrors={showErr('route')}>
        <div data-sec="route" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PlaceCard
            title={partidaTitle}
            caption={is09 ? (draft.motivo === 'compra' ? draft.party.rzn_social : fromBranchName) : draft.party.rzn_social}
            place={draft.partida}
            branches={is09 && draft.motivo !== 'compra' ? branchRows : undefined}
            onChange={(p) => {
              const next: Partial<DespatchDraft> = { partida: p, partidaTouched: true }
              if (is09 && draft.motivo !== 'compra' && p.branchId) next.branchId = p.branchId
              patch(next, 'route')
            }}
          />
          <PlaceCard
            title={llegadaTitle}
            caption={
              is09
                ? draft.motivo === 'compra'
                  ? fromBranchName
                  : draft.motivo === 'traslado'
                    ? (branchById(draft.destinoBranchId)?.name ?? '')
                    : draft.party.rzn_social
                : draft.receiver.rzn_social
            }
            place={draft.llegada}
            branches={is09 && (draft.motivo === 'compra' || draft.motivo === 'traslado') ? branchRows : undefined}
            lockedBranchId={is09 && draft.motivo === 'traslado' ? draft.branchId : undefined}
            onChange={(p) => {
              const next: Partial<DespatchDraft> = { llegada: p, llegadaTouched: true }
              if (is09 && draft.motivo === 'compra' && p.branchId) next.branchId = p.branchId
              if (is09 && draft.motivo === 'traslado' && p.branchId) next.destinoBranchId = p.branchId
              patch(next, 'route')
            }}
          />
        </div>
      </Section>

      {/* Transporte */}
      <Section title={publico ? 'Transportista' : 'Conductor y vehículo'} errors={errors.transport} showErrors={showErr('transport')}>
        <div data-sec="transport">
          <TransportPicker
            draft={draft}
            fleet={fleet}
            publico={publico}
            hideVehicle={is09 && draft.m1l && !publico}
            onPatch={(p) => patch(p, 'transport')}
            onFleetChange={(f) => setFleet((cur) => ({ ...cur, ...f }))}
          />
        </div>
      </Section>

      {/* Mercadería */}
      <Section title="Mercadería" errors={errors.cargo} showErrors={showErr('cargo')}>
        <div data-sec="cargo" className="space-y-3">
          <ItemsTable draft={draft} onPatch={(p) => patch(p, 'cargo')} />
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3">
              <label className={lbl}>Peso total (KGM) *</label>
              <input type="number" min={0} step="0.01" className={inputCls} value={draft.peso} onChange={(e) => patch({ peso: e.target.value }, 'cargo')} placeholder="0.00" />
            </div>
            <div className="lg:col-span-3">
              <label className={lbl}>N° de bultos</label>
              <input type="number" min={1} className={inputCls} value={draft.bultos} onChange={(e) => patch({ bultos: e.target.value, bultosTouched: true }, 'cargo')} />
            </div>
          </div>
        </div>
      </Section>

      <MoreOptions draft={draft} onPatch={(p) => patch(p)} ownTransport={!publico} companyRuc={company.ruc} />
    </div>
  )

  const footer = (
    <div className="pt-4 border-t border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 text-xs text-gray-600" aria-live="polite">
        {summary && <p className="truncate font-medium text-gray-800">{summary}</p>}
        <p className={allErrors.length ? 'text-amber-700' : 'text-emerald-700'}>
          {allErrors.length ? `Falta completar ${allErrors.length} ${allErrors.length === 1 ? 'dato' : 'datos'}` : 'Todo listo para emitir'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={sending} className="px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {sending ? 'Emitiendo…' : 'Emitir guía'}
        </button>
      </div>
    </div>
  )

  return (
    <div className={shell}>
      {header}
      {body}
      {footer}
    </div>
  )
}
