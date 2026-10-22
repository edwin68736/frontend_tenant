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
import { SearchableSelect } from '@/components/SearchableSelect'
import {
  MOTIVOS,
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
import type { DespatchPrefill } from './prefill'
import { PartyPicker } from './PartyPicker'
import { PlaceCard } from './PlaceCard'
import { TransportPicker } from './TransportPicker'
import { CargoSection } from './CargoSection'
import { MoreOptions } from './MoreOptions'
import { ChoiceCard, Field, SectionCard, inputCls } from './ui'

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
    let alive = true
    Promise.all([billingService.lastDespatchTransport(draft.branchId, kind).catch(() => null), fleetService.defaults().catch(() => ({}))]).then(
      ([last, defaults]) => {
        if (!alive) return
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
    return () => {
      alive = false
    }
  }, [fleetReady, kind, draft.branchId, fleet])

  const branchById = useCallback((id: number | null | undefined) => branchRows.find((b) => b.id === id), [branchRows])
  const placeOfBranch = useCallback(
    (id: number): Place => {
      const b = branchById(id)
      return {
        address: b?.address?.trim() || company.address,
        ubigeo: b?.fiscal_domicile_code?.trim() || company.ubigeo,
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

  const loadRelatedGre = async () => {
    const number = draft.relatedGre.trim()
    if (!number) return
    setLookupBusy(true)
    try {
      const r = await billingService.lookupDespatch(number)
      setDraft((d) => ({
        ...d,
        relatedGre: r.number,
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
      toast.message(msg ?? 'No encontramos esa guía en tu sistema.', { description: 'Puedes completar los datos a mano; el número quedará como documento relacionado.' })
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

  // ---- Paso inicial ---------------------------------------------------------------------------
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
        {draft.sourceLabel && (
          <p className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1">
            <FileText size={12} /> Desde el comprobante <strong className="font-mono">{draft.sourceLabel}</strong>
          </p>
        )}
      </div>
      {layout === 'modal' && (
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Cerrar">
          <X size={18} />
        </button>
      )}
    </header>
  )

  if (!kind) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {header}
        <h2 className="text-lg font-semibold text-gray-900">¿Qué guía necesitas?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

  // ---- Secciones ------------------------------------------------------------------------------
  const sourceLocked = draft.sourceSaleId != null
  const partyType: 'customer' | 'supplier' | '' =
    draft.motivo === 'compra' || (draft.motivo === 'devolucion' && draft.devolucionHacia === 'proveedor') ? 'supplier' : draft.motivo === 'otros' ? '' : 'customer'
  const partyTitle = is09
    ? draft.motivo === 'traslado'
      ? '¿A qué local lo envías?'
      : draft.motivo === 'compra'
        ? '¿Quién te vende?'
        : draft.motivo === 'devolucion'
          ? '¿A quién se lo devuelves?'
          : draft.motivo === 'otros'
            ? '¿Quién lo recibe?'
            : '¿A quién se lo envías?'
    : '¿De quién es la mercadería?'
  const fromBranchName = branchById(draft.branchId)?.name ?? ''
  const usesOwnTransport = !is09 || draft.transporte === 'propio'

  const sectionNums = is09 ? { party: 2, route: 3, transport: 4, cargo: 5 } : { party: 1, route: 2, transport: 3, cargo: 4 }

  const routeTitles = is09
    ? draft.motivo === 'compra'
      ? { a: 'Se recoge en', b: 'Llega a mi local' }
      : { a: 'Sale de', b: 'Llega a' }
    : { a: 'Punto de recojo', b: 'Punto de entrega' }

  const summary = [
    is09 ? (MOTIVOS.find((m) => m.id === draft.motivo)?.title ?? '') : 'Transporte de carga',
    is09 && !partyIsCompany(draft) && draft.party.rzn_social ? draft.party.rzn_social : !is09 && draft.receiver.rzn_social ? `para ${draft.receiver.rzn_social}` : '',
    Number(draft.peso) > 0 ? `${draft.peso} kg` : '',
    draft.items.length ? `${draft.items.length} producto${draft.items.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const body = (
    <div className="space-y-4 text-sm" ref={topRef}>
      {!sourceLocked && !initialKind && (
        <button type="button" onClick={() => setKind(null)} className="text-xs text-gray-500 hover:text-gray-800 underline">
          Cambiar el tipo de guía
        </button>
      )}

      {is09 && (
        <div data-sec="motivo">
          <SectionCard n={1} title="¿Qué vas a hacer con la mercadería?" subtitle="Elige el motivo del traslado" errors={errors.motivo} showErrors={showErr('motivo')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {MOTIVOS.map((m) => (
                <ChoiceCard
                  key={m.id}
                  selected={draft.motivo === m.id}
                  onClick={() => chooseMotivo(m.id)}
                  title={m.title}
                  hint={m.hint}
                  disabled={sourceLocked && (m.id === 'traslado' || m.id === 'compra')}
                />
              ))}
            </div>
            {draft.motivo === 'otros' && (
              <Field label="Describe el motivo *" hint="Aparece en la guía (máx. 100 caracteres)">
                <input className={inputCls} maxLength={100} value={draft.otrosDescripcion} onChange={(e) => patch({ otrosDescripcion: e.target.value }, 'motivo')} placeholder="Ej. Muestras para una feria" />
              </Field>
            )}
          </SectionCard>
        </div>
      )}

      <div data-sec="party">
        <SectionCard n={sectionNums.party} title={partyTitle} errors={errors.party} showErrors={showErr('party')}>
          {!is09 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Si ya emitiste la guía del remitente desde este sistema, cárgala y completamos los datos.</p>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} max-w-xs`}
                  value={draft.relatedGre}
                  onChange={(e) => patch({ relatedGre: e.target.value })}
                  placeholder="Guía del remitente, ej. T001-23"
                  aria-label="Guía del remitente"
                />
                <button type="button" onClick={() => void loadRelatedGre()} disabled={lookupBusy || !draft.relatedGre.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50">
                  {lookupBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Cargar
                </button>
              </div>
            </div>
          )}

          {is09 && draft.motivo === 'traslado' && (
            <div className="space-y-2">
              <Field label="Sucursal de destino *" hint="El destinatario de la guía es tu propia empresa">
                <SearchableSelect
                  value={draft.destinoBranchId}
                  onChange={(v) => patch({ destinoBranchId: v === null ? null : Number(v), llegadaTouched: false }, 'party')}
                  options={branchRows.filter((b) => b.active !== false && b.id !== draft.branchId).map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={branchRows.length <= 1 ? 'Necesitas otra sucursal registrada' : 'Elige la sucursal'}
                  searchable={false}
                />
              </Field>
            </div>
          )}

          {is09 && draft.motivo === 'devolucion' && (
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <ChoiceCard selected={draft.devolucionHacia === 'cliente'} onClick={() => patch({ devolucionHacia: 'cliente', party: emptyParty(), llegadaTouched: false }, 'party')} title="A un cliente" />
              <ChoiceCard selected={draft.devolucionHacia === 'proveedor'} onClick={() => patch({ devolucionHacia: 'proveedor', party: emptyParty(), llegadaTouched: false }, 'party')} title="A un proveedor" />
            </div>
          )}

          {(!is09 || draft.motivo !== 'traslado') && (
            <div>
              {!is09 && <p className="text-xs font-semibold text-gray-600 mb-2">Remitente (quien entrega la mercadería)</p>}
              <PartyPicker
                key={`party-${draft.motivo}-${draft.devolucionHacia}`}
                value={draft.party}
                onChange={(p) => patch({ party: p, partidaTouched: false, llegadaTouched: false }, 'party')}
                contactType={is09 ? partyType : ''}
                companyRuc={company.ruc}
                requireAddress={!is09 || draft.motivo === 'compra'}
                addressLabel={!is09 ? 'Dirección fiscal' : 'Dirección'}
                placeholder={`Busca al ${partyRoleLabel(draft).toLowerCase()} por RUC, DNI o nombre`}
              />
            </div>
          )}

          {!is09 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Destinatario (quien recibe la mercadería)</p>
              <PartyPicker
                key="receiver"
                value={draft.receiver}
                onChange={(p) => patch({ receiver: p, llegadaTouched: false }, 'party')}
                contactType=""
                companyRuc={company.ruc}
                placeholder="Busca al destinatario por RUC, DNI o nombre"
              />
            </div>
          )}
        </SectionCard>
      </div>

      <div data-sec="route">
        <SectionCard n={sectionNums.route} title={is09 ? 'Ruta del traslado' : 'Puntos de recojo y entrega'} subtitle="Precargamos las direcciones; cámbialas si hace falta" errors={errors.route} showErrors={showErr('route')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PlaceCard
              title={routeTitles.a}
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
              title={routeTitles.b}
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
        </SectionCard>
      </div>

      <div data-sec="transport">
        <SectionCard n={sectionNums.transport} title={is09 ? '¿Quién transporta?' : 'Conductor y vehículo'} errors={errors.transport} showErrors={showErr('transport')}>
          <TransportPicker
            draft={draft}
            fleet={fleet}
            allowCompany={is09}
            hideVehicle={is09 && draft.m1l && draft.transporte === 'propio'}
            onPatch={(p) => patch(p, 'transport')}
            onFleetChange={(f) => setFleet((cur) => ({ ...cur, ...f }))}
          />
        </SectionCard>
      </div>

      <div data-sec="cargo">
        <SectionCard n={sectionNums.cargo} title={is09 ? 'La carga' : 'La mercadería'} errors={errors.cargo} showErrors={showErr('cargo')}>
          <CargoSection draft={draft} onPatch={(p) => patch(p, 'cargo')} allowProducts={is09 && !sourceLocked} allowManual={!is09} />
        </SectionCard>
      </div>

      <MoreOptions draft={draft} onPatch={(p) => patch(p)} ownTransport={usesOwnTransport} />
    </div>
  )

  const footer = (
    <div className={`${layout === 'page' ? 'sticky bottom-0' : ''} -mx-1 px-1 bg-white/95 backdrop-blur border-t border-gray-100 pt-3 pb-1 mt-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="min-w-0 text-xs text-gray-600" aria-live="polite">
          {summary && <p className="truncate font-medium text-gray-800">{summary}</p>}
          <p className={allErrors.length ? 'text-amber-700' : 'text-emerald-700'}>
            {allErrors.length ? `Falta completar: ${allErrors.length} ${allErrors.length === 1 ? 'punto' : 'puntos'}` : 'Todo listo para emitir'}
            {seriesForKind[0] && <span className="text-gray-400"> · Serie {seriesForKind[0].series}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={sending} className="px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {sending ? 'Emitiendo…' : 'Emitir guía'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className={layout === 'page' ? 'max-w-4xl mx-auto' : ''}>
      {header}
      <div className="mt-4">{body}</div>
      {footer}
    </div>
  )
}
