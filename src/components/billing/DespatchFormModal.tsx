import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, X, Search, FileText, Settings, ArrowLeft, Loader2 } from 'lucide-react'
import { consultaService } from '@/services/consulta.service'
import { Modal } from '@/components/ui/Modal'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { ubigeoToIds } from '@/services/ubigeo.service'
import { companyService } from '@/services/company.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { type Product } from '@/services/products.service'
import { salesService, type Sale, type SaleDetail } from '@/services/sales.service'
import { billingService, type CreateDespatchInput, type SunatDespatch } from '@/services/billing.service'
import {
  validateGreDriverFields,
  normalizeGreLicencia,
} from '@/utils/greDriver'
import {
  fleetService,
  type GreCarrier,
  type GreDriver,
  type GreVehicle,
} from '@/services/fleet.service'
import {
  SUNAT_MOTIVO_TRASLADO,
  SUNAT_MODALIDAD_TRASLADO,
  formatTipoDocIdentidadDisplay,
  toTipoDocIdentidadCode,
} from '@/constants/sunat'
import { normalizeSunatUnit } from '@/constants/sunatUnits'
import { toISOStringPeru, toDateTimeLocalPeru, fromDateTimeLocalToISOPeru } from '@/utils/datesPeru'
import { formatSaleDocumentNumber } from '@/utils/format'
import {
  filterGuiaSeriesBySunatCode,
  guiaSeriesMissingMessage,
  GUIA_SERIES_SETTINGS_PATH,
  type GuiaSeriesRow,
  type GuiaSunatCode,
} from '@/utils/despatchSeries'

export type DespatchCreateMode = 'from_invoice' | 'from_boleta' | 'standalone'

export interface DespatchPrefill {
  mode?: DespatchCreateMode
  locked?: boolean
  branch_id?: number
  source_sale_id?: number
  source_doc_label?: string
  contact_id?: number
  destinatario?: Partial<CreateDespatchInput['destinatario']>
  envio?: Partial<CreateDespatchInput['envio']>
  details?: CreateDespatchInput['details']
}

export interface DespatchFormModalProps {
  open: boolean
  onClose: () => void
  onCreated: (d: SunatDespatch) => void
  series: GuiaSeriesRow[]
  branches: { id: number; name: string }[]
  mainBranchId: number
  prefill?: DespatchPrefill | null
  title?: string
  /** 'page' = vista completa; 'modal' (default) = diálogo */
  layout?: 'modal' | 'page'
  /** Tipo GRE inicial al abrir (09 remitente / 31 transportista) */
  initialGuiaCode?: GuiaSunatCode
}

type DespatchLineItem = {
  product_id?: number | null
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
}

function emptyForm(mainBranchId: number, seriesId = 0, guiaCode: GuiaSunatCode = '09'): Partial<CreateDespatchInput> {
  return {
    branch_id: mainBranchId,
    series_id: seriesId,
    destinatario: { tipo_doc: '6', num_doc: '', rzn_social: '', address: '', ubigeo: '' },
    envio: {
      cod_traslado: '01',
      des_traslado: 'Venta',
      mod_traslado: '02',
      fec_traslado: toISOStringPeru(),
      fec_entrega_transportista: toISOStringPeru(),
      partida_ubigueo: '',
      partida_direccion: '',
      llegada_ubigueo: '',
      llegada_direccion: '',
      peso_total: 0,
      und_peso_total: 'KGM',
      num_bultos: 1,
    },
    details: [],
  }
}

function contactToDestinatario(c: Contact): CreateDespatchInput['destinatario'] {
  return {
    tipo_doc: toTipoDocIdentidadCode(c.doc_type),
    num_doc: c.doc_number ?? '',
    rzn_social: c.business_name ?? '',
    address: c.address ?? '',
    ubigeo: c.ubigeo ?? '',
  }
}

function lineItemsToDetails(items: DespatchLineItem[]): CreateDespatchInput['details'] {
  return items.map((it) => ({
    codigo: it.codigo,
    descripcion: it.descripcion,
    unidad: it.unidad,
    cantidad: it.cantidad,
  }))
}

function detailsToLineItems(details: CreateDespatchInput['details']): DespatchLineItem[] {
  return (details ?? []).map((d) => ({
    product_id: null,
    codigo: d.codigo,
    descripcion: d.descripcion,
    unidad: d.unidad || 'NIU',
    cantidad: d.cantidad,
  }))
}

function resolveModeFromSaleDetail(detail: SaleDetail): DespatchCreateMode {
  const docUpper = (detail.sale.doc_type || '').toUpperCase()
  if (docUpper.includes('FACTURA')) return 'from_invoice'
  return 'from_boleta'
}

function splitDriverName(full: string): { nombres: string; apellidos: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { nombres: full.trim(), apellidos: '' }
  return { nombres: parts[0], apellidos: parts.slice(1).join(' ') }
}

function carrierToEnvio(carrier: GreCarrier): Partial<CreateDespatchInput['envio']> {
  return {
    transportista_ruc: carrier.doc_type === '6' ? carrier.doc_number : undefined,
    transportista_razon: carrier.business_name,
    transportista_mtc: carrier.mtc_number || undefined,
  }
}

function driverToEnvio(driver: GreDriver): Partial<CreateDespatchInput['envio']> {
  const { nombres, apellidos } = splitDriverName(driver.full_name)
  return {
    chofer_tipo_doc: driver.doc_type,
    chofer_doc: driver.doc_number,
    chofer_licencia: driver.license_number ? normalizeGreLicencia(driver.license_number) : undefined,
    chofer_nombres: nombres,
    chofer_apellidos: apellidos,
  }
}

function vehicleToEnvio(vehicle: GreVehicle): Partial<CreateDespatchInput['envio']> {
  return {
    transportista_placa: vehicle.plate,
    vehiculo_hab_cert: vehicle.habilitation_cert || undefined,
  }
}

export function buildDespatchPrefillFromSaleDetail(detail: SaleDetail): DespatchPrefill {
  const client = detail.print_data?.client ?? undefined
  const contact = detail.contact
  const tipoDoc = contact?.doc_type === 'DNI' ? '1' : contact?.doc_type === 'RUC' ? '6' : toTipoDocIdentidadCode(contact?.doc_type ?? '6')
  return {
    mode: resolveModeFromSaleDetail(detail),
    locked: true,
    source_sale_id: detail.sale.id,
    source_doc_label: formatSaleDocumentNumber(detail.sale.series, detail.sale.number),
    contact_id: contact?.id ?? detail.sale.contact_id ?? undefined,
    branch_id: detail.sale.branch_id,
    destinatario: {
      tipo_doc: tipoDoc,
      num_doc: contact?.doc_number ?? client?.doc_number ?? '',
      rzn_social: contact?.business_name ?? client?.business_name ?? '',
      address: contact?.address ?? client?.address ?? '',
      ubigeo: contact?.ubigeo ?? '',
    },
    envio: {
      cod_traslado: '01',
      des_traslado: 'Venta',
      mod_traslado: '02',
      llegada_direccion: contact?.address ?? client?.address ?? '',
      llegada_ubigueo: contact?.ubigeo ?? '',
    },
    details: detail.items.map((it) => ({
      codigo: it.code,
      descripcion: it.description,
      unidad: it.unit || 'NIU',
      cantidad: it.quantity,
    })),
  }
}

export function DespatchFormModal({
  open,
  onClose,
  onCreated,
  series,
  branches,
  mainBranchId,
  prefill,
  title = 'Nueva guía de remisión',
  layout = 'modal',
  initialGuiaCode = '09',
}: DespatchFormModalProps) {
  const [sending, setSending] = useState(false)
  const [createMode, setCreateMode] = useState<DespatchCreateMode>('standalone')
  const [sourceLocked, setSourceLocked] = useState(false)
  const [sourceDocLabel, setSourceDocLabel] = useState('')
  const [guiaSunatCode, setGuiaSunatCode] = useState<GuiaSunatCode>('09')
  const [form, setForm] = useState<Partial<CreateDespatchInput>>(() => emptyForm(mainBranchId, 0))
  const [lineItems, setLineItems] = useState<DespatchLineItem[]>([])
  const [customers, setCustomers] = useState<Contact[]>([])
  const [contactId, setContactId] = useState<number | null>(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [destUbigeo, setDestUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [partidaUbigeo, setPartidaUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [llegadaUbigeo, setLlegadaUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [remitenteUbigeo, setRemitenteUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [remitenteConsultando, setRemitenteConsultando] = useState(false)
  const [saleSearch, setSaleSearch] = useState('')
  const [saleResults, setSaleResults] = useState<Sale[]>([])
  const [saleSearchLoading, setSaleSearchLoading] = useState(false)
  const [salePickLoading, setSalePickLoading] = useState<number | null>(null)
  const [fleetCarriers, setFleetCarriers] = useState<GreCarrier[]>([])
  const [fleetDrivers, setFleetDrivers] = useState<GreDriver[]>([])
  const [fleetVehicles, setFleetVehicles] = useState<GreVehicle[]>([])
  const [selectedCarrierId, setSelectedCarrierId] = useState<number | ''>('')
  const [selectedDriverId, setSelectedDriverId] = useState<number | ''>('')
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | ''>('')
  const [companyRuc, setCompanyRuc] = useState('')

  const seriesFiltered = useMemo(() => {
    const byCode = filterGuiaSeriesBySunatCode(series, guiaSunatCode)
    if (!form.branch_id) return byCode
    return byCode.filter((s) => !s.branch_id || s.branch_id === form.branch_id)
  }, [series, guiaSunatCode, form.branch_id])

  const missingSeriesMessage = guiaSeriesMissingMessage(guiaSunatCode)

  const showTransportista = guiaSunatCode === '31'
  const modTraslado = form.envio?.mod_traslado ?? '02'
  const showTransportistaPublico = guiaSunatCode === '09' && modTraslado === '01'
  const showFlotaPrivada = guiaSunatCode === '09' && modTraslado === '02'
  const showFleetPickers = showTransportistaPublico || showFlotaPrivada || showTransportista
  const modalidadLocked = guiaSunatCode === '31'
  const isStandalone = createMode === 'standalone'
  const isPageLayout = layout === 'page'
  const fieldGrid = isPageLayout
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'
  const fieldCol2 = isPageLayout ? 'lg:col-span-2' : ''
  const fieldCol3 = isPageLayout ? 'lg:col-span-3' : ''
  const sectionDivider = isPageLayout
    ? 'border-t border-gray-100 pt-5 space-y-3'
    : 'border-t border-gray-100 pt-4 space-y-3'
  const routesGrid = isPageLayout
    ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-gray-100 pt-5'
    : 'grid grid-cols-1 lg:grid-cols-2 gap-4'
  const itemsLocked = sourceLocked || !isStandalone
  const customerLocked = sourceLocked || !isStandalone
  const selectedContact = contactId ? customers.find((c) => c.id === contactId) ?? null : null

  const applyPrefill = (p: DespatchPrefill, baseSeriesId?: number) => {
    const base = emptyForm(p.branch_id ?? mainBranchId, baseSeriesId ?? 0)
    if (p.destinatario) base.destinatario = { ...base.destinatario!, ...p.destinatario }
    if (p.envio) base.envio = { ...base.envio!, ...p.envio }
    if (p.source_sale_id) base.source_sale_id = p.source_sale_id
    if (p.details?.length) {
      base.details = p.details
      setLineItems(detailsToLineItems(p.details))
    } else {
      setLineItems([])
    }
    setForm(base)
    setContactId(p.contact_id ?? null)
    setDestUbigeo(ubigeoToIds(base.destinatario?.ubigeo ?? ''))
    setPartidaUbigeo(ubigeoToIds(base.envio?.partida_ubigueo ?? ''))
    setLlegadaUbigeo(ubigeoToIds(base.envio?.llegada_ubigueo ?? ''))
    setRemitenteUbigeo(ubigeoToIds(base.remitente?.ubigeo ?? ''))
    if (p.source_doc_label) setSourceDocLabel(p.source_doc_label)
    if (p.mode) setCreateMode(p.mode)
    if (p.locked) setSourceLocked(true)
  }

  useEffect(() => {
    if (!open) return
    setSourceLocked(false)
    setSourceDocLabel('')
    setSaleSearch('')
    setSaleResults([])
    setSelectedCarrierId('')
    setSelectedDriverId('')
    setSelectedVehicleId('')
    setCreateMode(prefill?.mode ?? 'standalone')
    const startGuiaCode = prefill ? '09' : initialGuiaCode
    setGuiaSunatCode(startGuiaCode)
    const remitenteSeries = filterGuiaSeriesBySunatCode(series, startGuiaCode)
    const firstSeriesId = remitenteSeries[0]?.id ?? 0
    if (prefill) {
      applyPrefill(prefill, firstSeriesId)
      if (prefill.locked) setSourceLocked(true)
    } else {
      const base = emptyForm(mainBranchId, firstSeriesId, startGuiaCode)
      setForm(base)
      setLineItems([])
      setContactId(null)
      setDestUbigeo(ubigeoToIds(''))
      setPartidaUbigeo(ubigeoToIds(''))
      setLlegadaUbigeo(ubigeoToIds(''))
      setRemitenteUbigeo(ubigeoToIds(''))
      if (startGuiaCode === '31') {
        setForm((f) => ({
          ...f,
          remitente: { tipo_doc: '6', num_doc: '', rzn_social: '', address: '', ubigeo: '' },
          envio: { ...f.envio!, mod_traslado: '02' },
        }))
      }
    }
    contactsService
      .list('', 'customer')
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => {})
    companyService
      .getConfig()
      .then((cfg) => {
        setCompanyRuc((cfg.ruc ?? '').replace(/-/g, '').trim())
        if (prefill?.envio?.partida_ubigueo) return
        if (cfg.ubigeo) {
          const ids = ubigeoToIds(cfg.ubigeo)
          setPartidaUbigeo(ids)
          setForm((f) => ({
            ...f,
            envio: {
              ...f.envio!,
              partida_ubigueo: cfg.ubigeo ?? '',
              partida_direccion: f.envio?.partida_direccion || cfg.address || '',
            },
          }))
        }
      })
      .catch(() => {})
    Promise.all([
      fleetService.listCarriers({ active_only: true }),
      fleetService.listDrivers({ active_only: true }),
      fleetService.listVehicles({ active_only: true }),
      fleetService.defaults(),
    ])
      .then(([carriers, drivers, vehicles, defaults]) => {
        setFleetCarriers(carriers)
        setFleetDrivers(drivers)
        setFleetVehicles(vehicles)
        if (defaults.carrier) setSelectedCarrierId(defaults.carrier.id)
        if (defaults.driver) setSelectedDriverId(defaults.driver.id)
        if (defaults.vehicle) setSelectedVehicleId(defaults.vehicle.id)
        setForm((f) => {
          const envio = { ...f.envio! }
          let changed = false
          if (defaults.carrier && !envio.transportista_ruc && !envio.transportista_razon) {
            Object.assign(envio, carrierToEnvio(defaults.carrier))
            changed = true
          }
          if (defaults.driver && !envio.chofer_doc && !envio.chofer_licencia) {
            Object.assign(envio, driverToEnvio(defaults.driver))
            changed = true
          }
          if (defaults.vehicle && !envio.transportista_placa) {
            Object.assign(envio, vehicleToEnvio(defaults.vehicle))
            changed = true
          }
          return changed ? { ...f, envio } : f
        })
      })
      .catch(() => {})
  }, [open, prefill, mainBranchId, series, initialGuiaCode])

  useEffect(() => {
    if (!open) return
    const match = seriesFiltered.find((s) => s.id === form.series_id)
    if (match) return
    if (seriesFiltered.length > 0) {
      setForm((f) => ({ ...f, series_id: seriesFiltered[0].id }))
    } else {
      setForm((f) => ({ ...f, series_id: 0 }))
    }
  }, [open, guiaSunatCode, seriesFiltered, form.series_id])

  useEffect(() => {
    if (!open || customerLocked || !isStandalone || !contactId) return
    const c = customers.find((x) => x.id === contactId)
    if (!c) return
    const dest = contactToDestinatario(c)
    setDestUbigeo(ubigeoToIds(dest.ubigeo ?? ''))
    setLlegadaUbigeo(ubigeoToIds(dest.ubigeo ?? ''))
    setForm((f) => ({
      ...f,
      destinatario: dest,
      envio: {
        ...f.envio!,
        llegada_direccion: dest.address ?? '',
        llegada_ubigueo: dest.ubigeo ?? '',
      },
    }))
  }, [contactId, customers, open, customerLocked, isStandalone])

  useEffect(() => {
    if (!open || isStandalone || sourceLocked) return
    const sunatCode = createMode === 'from_invoice' ? '01' : '03'
    setSaleSearchLoading(true)
    salesService
      .list({
        q: saleSearch.trim() || undefined,
        sunat_code: sunatCode,
        billing_status: 'accepted',
        per_page: 15,
        sale_status: 'active',
      })
      .then(({ data }) => setSaleResults(data ?? []))
      .catch(() => toast.error('Error al buscar comprobantes'))
      .finally(() => setSaleSearchLoading(false))
  }, [open, createMode, isStandalone, sourceLocked, saleSearch])

  const syncUbigeo = (
    kind: 'dest' | 'partida' | 'llegada' | 'remitente',
    r: string,
    p: string,
    d: string,
  ) => {
    const ids = { regionId: r, provinciaId: p, distritoId: d }
    if (kind === 'dest') {
      setDestUbigeo(ids)
      setForm((f) => ({ ...f, destinatario: { ...f.destinatario!, ubigeo: d } }))
    } else if (kind === 'partida') {
      setPartidaUbigeo(ids)
      setForm((f) => ({ ...f, envio: { ...f.envio!, partida_ubigueo: d } }))
    } else if (kind === 'llegada') {
      setLlegadaUbigeo(ids)
      setForm((f) => ({ ...f, envio: { ...f.envio!, llegada_ubigueo: d } }))
    } else {
      setRemitenteUbigeo(ids)
      setForm((f) => ({
        ...f,
        remitente: { ...(f.remitente ?? { tipo_doc: '6', num_doc: '', rzn_social: '', address: '' }), ubigeo: d },
      }))
    }
  }

  const consultRemitenteDoc = async () => {
    const num = (form.remitente?.num_doc ?? '').replace(/-/g, '').trim()
    const tipo = form.remitente?.tipo_doc ?? '6'
    if (!num) {
      toast.error('Ingrese el documento del remitente')
      return
    }
    if (!companyRuc) {
      toast.error('Configure el RUC de su empresa primero')
      return
    }
    setRemitenteConsultando(true)
    try {
      if (tipo === '6' || num.length === 11) {
        if (num.length !== 11) {
          toast.error('Ingrese un RUC de 11 dígitos')
          return
        }
        const res = await consultaService.ruc(companyRuc, num)
        if (!res.success || !res.razon_social) {
          toast.error('No se encontró el RUC en SUNAT')
          return
        }
        const ubigeo = res.ubigeo ?? ''
        setRemitenteUbigeo(ubigeoToIds(ubigeo))
        setForm((f) => ({
          ...f,
          remitente: {
            ...(f.remitente ?? { tipo_doc: '6', num_doc: num, address: '', ubigeo: '' }),
            tipo_doc: '6',
            num_doc: num,
            rzn_social: res.razon_social ?? '',
            address: res.direccion ?? res.direccion_completa ?? '',
            ubigeo,
          },
        }))
        toast.success('Datos del remitente obtenidos de SUNAT')
      } else {
        if (num.length !== 8) {
          toast.error('Ingrese un DNI de 8 dígitos')
          return
        }
        const res = await consultaService.dni(companyRuc, num)
        if (!res.success || !res.nombre_completo) {
          toast.error('No se encontró el DNI en RENIEC')
          return
        }
        setForm((f) => ({
          ...f,
          remitente: {
            ...(f.remitente ?? { tipo_doc: '1', num_doc: num, address: '', ubigeo: '' }),
            tipo_doc: '1',
            num_doc: num,
            rzn_social: res.nombre_completo ?? '',
          },
        }))
        toast.success('Nombre del remitente obtenido de RENIEC')
      }
    } catch {
      toast.error('Error al consultar documento')
    } finally {
      setRemitenteConsultando(false)
    }
  }

  const handleFleetCarrierChange = (raw: string) => {
    const id = raw === '' ? '' : Number(raw)
    setSelectedCarrierId(id)
    if (id === '') return
    const row = fleetCarriers.find((c) => c.id === id)
    if (!row) return
    const carrierRuc = row.doc_type === '6' ? row.doc_number.replace(/-/g, '').trim() : ''
    if (
      showTransportistaPublico &&
      carrierRuc &&
      companyRuc &&
      carrierRuc === companyRuc
    ) {
      toast.error('No puede usar su propio RUC como transportista externo (SUNAT 2560). Use modalidad privada (02) para flota propia.')
      setSelectedCarrierId('')
      return
    }
    setForm((f) => ({ ...f, envio: { ...f.envio!, ...carrierToEnvio(row) } }))
  }

  const handleFleetDriverChange = (raw: string) => {
    const id = raw === '' ? '' : Number(raw)
    setSelectedDriverId(id)
    if (id === '') return
    const row = fleetDrivers.find((d) => d.id === id)
    if (!row) return
    setForm((f) => ({ ...f, envio: { ...f.envio!, ...driverToEnvio(row) } }))
  }

  const handleFleetVehicleChange = (raw: string) => {
    const id = raw === '' ? '' : Number(raw)
    setSelectedVehicleId(id)
    if (id === '') return
    const row = fleetVehicles.find((v) => v.id === id)
    if (!row) return
    setForm((f) => ({ ...f, envio: { ...f.envio!, ...vehicleToEnvio(row) } }))
  }

  const handleGuiaTypeChange = (code: GuiaSunatCode) => {
    setGuiaSunatCode(code)
    if (code === '31') {
      setRemitenteUbigeo(ubigeoToIds(''))
    }
    setForm((f) => ({
      ...f,
      remitente:
        code === '31'
          ? f.remitente ?? { tipo_doc: '6', num_doc: '', rzn_social: '', address: '', ubigeo: '' }
          : undefined,
      envio: {
        ...f.envio!,
        mod_traslado: '02',
        transportista_ruc: code === '31' ? undefined : f.envio?.transportista_ruc,
        transportista_razon: code === '31' ? undefined : f.envio?.transportista_razon,
      },
    }))
  }

  const handleModTrasladoChange = (mod: string) => {
    setForm((f) => ({
      ...f,
      envio: {
        ...f.envio!,
        mod_traslado: mod,
        ...(mod === '02'
          ? { transportista_ruc: undefined, transportista_razon: undefined }
          : {}),
      },
    }))
  }

  const handleMotivoChange = (code: string) => {
    const label = SUNAT_MOTIVO_TRASLADO.find((m) => m.code === code)?.label ?? code
    setForm((f) => ({ ...f, envio: { ...f.envio!, cod_traslado: code, des_traslado: label } }))
  }

  const handleModeChange = (mode: DespatchCreateMode) => {
    if (sourceLocked) return
    setCreateMode(mode)
    setSourceDocLabel('')
    setForm((f) => ({ ...f, source_sale_id: undefined }))
    if (mode === 'standalone') {
      setLineItems([])
      setContactId(null)
      setForm((f) => ({
        ...emptyForm(f.branch_id ?? mainBranchId, f.series_id ?? 0),
        series_id: f.series_id,
        branch_id: f.branch_id,
        envio: f.envio,
      }))
    } else {
      setLineItems([])
      setContactId(null)
    }
  }

  const pickSaleForGuia = async (saleId: number) => {
    setSalePickLoading(saleId)
    try {
      const detail = await salesService.get(saleId)
      const built = buildDespatchPrefillFromSaleDetail(detail)
      applyPrefill({ ...built, locked: false, mode: createMode }, form.series_id ?? undefined)
      setSourceDocLabel(built.source_doc_label ?? '')
      setForm((f) => ({ ...f, source_sale_id: saleId }))
    } catch {
      toast.error('No se pudo cargar el comprobante')
    } finally {
      setSalePickLoading(null)
    }
  }

  const addProductToItems = (p: Product) => {
    setLineItems((prev) => {
      const existing = prev.find((it) => it.product_id === p.id)
      if (existing) {
        return prev.map((it) =>
          it.product_id === p.id ? { ...it, cantidad: it.cantidad + 1 } : it,
        )
      }
      return [
        ...prev,
        {
          product_id: p.id,
          codigo: p.code ?? '',
          descripcion: p.name,
          unidad: normalizeSunatUnit(p.unit ?? '', p.type ?? 'product'),
          cantidad: 1,
        },
      ]
    })
    toast.success(`"${p.name}" agregado`)
    setShowProductPicker(false)
  }

  const updateLineItem = (idx: number, patch: Partial<DespatchLineItem>) => {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = () => {
    const d = form.destinatario
    const e = form.envio
    const details = lineItemsToDetails(lineItems)

    if (isStandalone && !contactId) {
      toast.error('Seleccione un cliente destinatario')
      return
    }
    if (!form.branch_id) {
      toast.error('Seleccione la sucursal')
      return
    }
    if (!form.series_id || !seriesFiltered.some((s) => s.id === form.series_id)) {
      toast.error(missingSeriesMessage)
      return
    }
    if (!d?.num_doc?.trim() || !d?.rzn_social?.trim()) {
      toast.error('Complete los datos del destinatario (documento y razón social)')
      return
    }
    if (!d.address?.trim()) {
      toast.error('Ingrese la dirección del destinatario')
      return
    }
    if (!d.ubigeo?.trim()) {
      toast.error('Seleccione el ubigeo del destinatario')
      return
    }
    if (!e?.cod_traslado?.trim()) {
      toast.error('Seleccione el motivo de traslado')
      return
    }
    if (!e?.mod_traslado?.trim()) {
      toast.error('Seleccione la modalidad de traslado')
      return
    }
    if (!e?.fec_traslado?.trim()) {
      toast.error('Indique la fecha de traslado')
      return
    }
    if (!e?.partida_ubigueo?.trim() || !e?.llegada_ubigueo?.trim()) {
      toast.error('Seleccione ubigeos de partida y llegada')
      return
    }
    if (!e?.partida_direccion?.trim() || !e?.llegada_direccion?.trim()) {
      toast.error('Ingrese direcciones de partida y llegada')
      return
    }
    if (!e?.peso_total || e.peso_total <= 0) {
      toast.error('Ingrese el peso total del traslado (debe ser mayor a cero)')
      return
    }
    if (showFlotaPrivada) {
      if (!e.transportista_placa?.trim()) {
        toast.error('Ingrese la placa del vehículo (transporte privado)')
        return
      }
      const driverErr = validateGreDriverFields(e.chofer_doc ?? '', e.chofer_licencia ?? '', true)
      if (driverErr) {
        toast.error(driverErr)
        return
      }
    }
    if (showTransportistaPublico) {
      if (!e.transportista_ruc?.trim()) {
        toast.error('Ingrese el RUC del transportista (transporte público)')
        return
      }
      if (!e.transportista_razon?.trim()) {
        toast.error('Ingrese la razón social del transportista')
        return
      }
      const transpRuc = (e.transportista_ruc ?? '').replace(/-/g, '').trim()
      const destRuc = (form.destinatario?.num_doc ?? '').replace(/-/g, '').trim()
      if (companyRuc && transpRuc === companyRuc) {
        toast.error('El transportista no puede ser su mismo RUC (SUNAT 2560). Use modalidad privada (02) si transporta usted mismo.')
        return
      }
      if (destRuc && transpRuc === destRuc) {
        toast.error('El transportista no puede ser el mismo RUC del destinatario (SUNAT 2560)')
        return
      }
      const hasDriverData = Boolean(e.chofer_doc?.trim() || e.chofer_licencia?.trim())
      const hasPlaca = Boolean(e.transportista_placa?.trim())
      if (hasPlaca && hasDriverData) {
        const driverErr = validateGreDriverFields(e.chofer_doc ?? '', e.chofer_licencia ?? '', true)
        if (driverErr) {
          toast.error(driverErr)
          return
        }
      }
    }
    if (showTransportista) {
      const rem = form.remitente
      if (!rem?.num_doc?.trim() || !rem?.rzn_social?.trim()) {
        toast.error('Complete los datos del remitente (quien entrega la mercadería)')
        return
      }
      if (!rem?.address?.trim()) {
        toast.error('Ingrese la dirección fiscal del remitente')
        return
      }
      if (!rem?.ubigeo?.trim()) {
        toast.error('Seleccione el ubigeo del remitente')
        return
      }
      if (!e.transportista_placa?.trim()) {
        toast.error('Ingrese la placa del vehículo')
        return
      }
      const driverErr = validateGreDriverFields(e.chofer_doc ?? '', e.chofer_licencia ?? '', true)
      if (driverErr) {
        toast.error(driverErr)
        return
      }
    }
    if (!e?.fec_entrega_transportista?.trim()) {
      e.fec_entrega_transportista = e.fec_traslado
    }
    if (!details.length || !details.some((x) => x.descripcion.trim() && x.cantidad > 0)) {
      toast.error('Agregue al menos un producto con cantidad mayor a cero')
      return
    }
    if (!isStandalone && !form.source_sale_id) {
      toast.error('Seleccione el comprobante de origen (factura o boleta)')
      return
    }

    const payload: CreateDespatchInput = {
      ...(form as CreateDespatchInput),
      envio: {
        ...form.envio!,
        chofer_licencia: form.envio?.chofer_licencia
          ? normalizeGreLicencia(form.envio.chofer_licencia)
          : form.envio?.chofer_licencia,
      },
      details,
      remitente: showTransportista
        ? {
            tipo_doc: (form.remitente?.num_doc?.length ?? 0) === 11 ? '6' : (form.remitente?.tipo_doc || '6'),
            num_doc: form.remitente?.num_doc ?? '',
            rzn_social: form.remitente?.rzn_social ?? '',
            address: form.remitente?.address ?? '',
            ubigeo: form.remitente?.ubigeo ?? '',
          }
        : undefined,
    }

    setSending(true)
    billingService
      .createDespatch(payload)
      .then(({ despatch, message }) => {
        toast.success(message ?? 'Guía encolada para emisión SUNAT')
        onCreated(despatch)
        onClose()
      })
      .catch((err: { response?: { data?: { error?: string } } }) =>
        toast.error(err.response?.data?.error ?? 'Error al crear guía'),
      )
      .finally(() => setSending(false))
  }

  const modeOptions: { value: DespatchCreateMode; label: string; hint: string }[] = [
    { value: 'from_invoice', label: 'Desde Factura', hint: 'Cliente, productos y documento automáticos' },
    { value: 'from_boleta', label: 'Desde Boleta', hint: 'Cliente, productos y documento automáticos' },
    { value: 'standalone', label: 'Guía Independiente', hint: 'Selección manual de cliente y productos' },
  ]

  const formFooter =
    layout === 'page' ? (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 sm:min-w-[7.5rem]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={sending || seriesFiltered.length === 0}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 sm:min-w-[9rem]"
        >
          {sending ? 'Enviando…' : 'Enviar a SUNAT'}
        </button>
      </div>
    ) : (
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={sending || seriesFiltered.length === 0}
          className="px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar a SUNAT'}
        </button>
      </div>
    )

  const formHeader =
    layout === 'page' ? (
      <header className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <Link
          to="/billing/docs/despatches"
          className="inline-flex items-center justify-center p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
          aria-label="Volver a guías"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {guiaSunatCode === '31' ? 'Guía transportista GRE 31' : 'Guía remitente GRE 09'}
          </p>
        </div>
      </header>
    ) : (
      <div className="flex justify-between border-b border-gray-100 pb-3 mb-4 sticky top-0 bg-white z-10">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </button>
      </div>
    )

  const auxiliaryModals = (
    <>
      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal variant="sale" onAdd={addProductToItems} onClose={() => setShowProductPicker(false)} />
      </Modal>

      <QuickContactCreateModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        stacked
        onCreated={(contact) => {
          setCustomers((prev) => [...prev, contact])
          setContactId(contact.id)
        }}
      />
    </>
  )

  if (layout === 'page' && !open) return null

  const formFields = (
    <div className="space-y-5 text-sm">
          {!sourceLocked && (
            <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Origen de la guía</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {modeOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                      createMode === opt.value
                        ? 'border-[rgb(var(--p400))] bg-[rgb(var(--p50))]'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="despatch_mode"
                      className="mt-0.5"
                      checked={createMode === opt.value}
                      onChange={() => handleModeChange(opt.value)}
                    />
                    <span>
                      <span className="block font-medium text-gray-800">{opt.label}</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {sourceLocked && sourceDocLabel && (
            <div className="rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))] px-4 py-3 flex items-center gap-2 text-sm text-[rgb(var(--p800))]">
              <FileText size={16} className="shrink-0" />
              <span>
                Generando guía desde comprobante <strong className="font-mono">{sourceDocLabel}</strong>
                {createMode === 'from_invoice' ? ' (Factura)' : ' (Boleta)'}
              </span>
            </div>
          )}

          {!isStandalone && !sourceLocked && (
            <section className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Buscar {createMode === 'from_invoice' ? 'factura' : 'boleta'} aceptada por SUNAT
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
                  placeholder="Serie, número o cliente..."
                  value={saleSearch}
                  onChange={(ev) => setSaleSearch(ev.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-50">
                {saleSearchLoading ? (
                  <p className="text-center py-6 text-gray-400 text-xs">Buscando…</p>
                ) : saleResults.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 text-xs">No hay comprobantes aceptados</p>
                ) : (
                  saleResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={salePickLoading === s.id}
                      onClick={() => pickSaleForGuia(s.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-2 ${
                        form.source_sale_id === s.id ? 'bg-[rgb(var(--p50))]' : ''
                      }`}
                    >
                      <span>
                        <span className="font-mono font-medium text-gray-800">
                          {formatSaleDocumentNumber(s.series, s.number)}
                        </span>
                        <span className="text-gray-500 ml-2">{s.contact_name ?? 'Sin cliente'}</span>
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {salePickLoading === s.id ? 'Cargando…' : 'Usar'}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {sourceDocLabel && !sourceLocked && (
                <p className="text-xs text-emerald-700">
                  Comprobante seleccionado: <strong className="font-mono">{sourceDocLabel}</strong>
                </p>
              )}
            </section>
          )}

          {seriesFiltered.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>{missingSeriesMessage}</span>
              <Link
                to={GUIA_SERIES_SETTINGS_PATH}
                className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-[rgb(var(--p700))] hover:underline"
                onClick={onClose}
              >
                <Settings size={14} />
                Ir a Series y numeración
              </Link>
            </div>
          )}

          <div className={fieldGrid}>
            <div className={fieldCol2}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de guía</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={guiaSunatCode}
                onChange={(ev) => handleGuiaTypeChange(ev.target.value as GuiaSunatCode)}
              >
                <option value="09">Guía Remitente (09)</option>
                <option value="31">Guía Transportista (31)</option>
              </select>
            </div>
            <div className={fieldCol2}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                value={form.series_id ?? ''}
                onChange={(ev) => setForm((f) => ({ ...f, series_id: Number(ev.target.value) }))}
              >
                {seriesFiltered.length === 0 ? (
                  <option value="">Sin serie configurada</option>
                ) : (
                  seriesFiltered.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.series}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className={fieldCol2}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.branch_id}
                onChange={(ev) => setForm((f) => ({ ...f, branch_id: Number(ev.target.value) }))}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section className={sectionDivider}>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Destinatario</p>
            <div className={isPageLayout ? 'grid grid-cols-1 lg:grid-cols-6 gap-3' : 'space-y-3'}>
              {isStandalone && !customerLocked ? (
                <div className={fieldCol3 || undefined}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
                  <div className="flex gap-2 items-stretch">
                    <select
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      value={contactId ?? ''}
                      onChange={(ev) =>
                        setContactId(ev.target.value ? Number(ev.target.value) : null)
                      }
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.business_name}
                          {formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number)
                            ? ` — ${formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number)}`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAddClientOpen(true)}
                      className="shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
                      title="Nuevo cliente"
                      aria-label="Nuevo cliente"
                    >
                      <UserPlus size={18} />
                    </button>
                  </div>
                  {selectedContact && (
                    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-xs text-gray-600 space-y-0.5">
                      <p>
                        <span className="font-medium text-gray-700">Documento:</span>{' '}
                        {formatTipoDocIdentidadDisplay(selectedContact.doc_type, selectedContact.doc_number) ||
                          '—'}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Dirección:</span>{' '}
                        {selectedContact.address?.trim() || '—'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1 ${fieldCol3}`}>
                  <p className="font-medium text-gray-800">{form.destinatario?.rzn_social || '—'}</p>
                  <p className="text-xs text-gray-600 font-mono">
                    {formatTipoDocIdentidadDisplay(
                      form.destinatario?.tipo_doc ?? '',
                      form.destinatario?.num_doc ?? '',
                    ) || form.destinatario?.num_doc}
                  </p>
                  <p className="text-xs text-gray-600">{form.destinatario?.address || '—'}</p>
                </div>
              )}
              <div className={fieldCol3 || undefined}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ubigeo destinatario *</label>
                <UbigeoSelects
                  regionId={destUbigeo.regionId}
                  provinciaId={destUbigeo.provinciaId}
                  distritoId={destUbigeo.distritoId}
                  onChange={(r, p, d) => syncUbigeo('dest', r, p, d)}
                />
              </div>
            </div>
          </section>

          <section className={sectionDivider}>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Traslado</p>
            <div className={fieldGrid}>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.envio?.cod_traslado}
                  onChange={(ev) => handleMotivoChange(ev.target.value)}
                >
                  {SUNAT_MOTIVO_TRASLADO.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modalidad *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                  value={modTraslado}
                  disabled={modalidadLocked}
                  onChange={(ev) => handleModTrasladoChange(ev.target.value)}
                >
                  {SUNAT_MODALIDAD_TRASLADO.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {modalidadLocked && (
                  <p className="text-[11px] text-gray-500 mt-1">Guía transportista usa transporte privado (02).</p>
                )}
              </div>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha traslado *</label>
                <input
                  type="datetime-local"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.envio?.fec_traslado?.slice(0, 16) ?? toDateTimeLocalPeru()}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      envio: { ...f.envio!, fec_traslado: fromDateTimeLocalToISOPeru(ev.target.value) },
                    }))
                  }
                />
              </div>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha entrega al transportista *</label>
                <input
                  type="datetime-local"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.envio?.fec_entrega_transportista?.slice(0, 16) ?? form.envio?.fec_traslado?.slice(0, 16) ?? toDateTimeLocalPeru()}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      envio: { ...f.envio!, fec_entrega_transportista: fromDateTimeLocalToISOPeru(ev.target.value) },
                    }))
                  }
                />
              </div>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nº bultos</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.envio?.num_bultos ?? 1}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      envio: { ...f.envio!, num_bultos: Number(ev.target.value) || 1 },
                    }))
                  }
                />
              </div>
              <div className={fieldCol2}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Peso total (KGM)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.envio?.peso_total || ''}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      envio: { ...f.envio!, peso_total: Number(ev.target.value) },
                    }))
                  }
                />
              </div>
            </div>
          </section>

          <section className={routesGrid}>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Partida</p>
              <input
                placeholder="Dirección de partida *"
                value={form.envio?.partida_direccion ?? ''}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, envio: { ...f.envio!, partida_direccion: ev.target.value } }))
                }
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
              <UbigeoSelects
                regionId={partidaUbigeo.regionId}
                provinciaId={partidaUbigeo.provinciaId}
                distritoId={partidaUbigeo.distritoId}
                onChange={(r, p, d) => syncUbigeo('partida', r, p, d)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Llegada</p>
              <input
                placeholder="Dirección de llegada *"
                value={form.envio?.llegada_direccion ?? ''}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, envio: { ...f.envio!, llegada_direccion: ev.target.value } }))
                }
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
              <UbigeoSelects
                regionId={llegadaUbigeo.regionId}
                provinciaId={llegadaUbigeo.provinciaId}
                distritoId={llegadaUbigeo.distritoId}
                onChange={(r, p, d) => syncUbigeo('llegada', r, p, d)}
              />
            </div>
          </section>

          {showFleetPickers && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-900 uppercase tracking-wide">
                  Catálogo de flota
                </p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {showTransportistaPublico && (
                    <Link to="/fleet/carriers" className="text-violet-700 hover:underline" onClick={onClose}>
                      Gestionar transportistas
                    </Link>
                  )}
                  <Link to="/fleet/drivers" className="text-violet-700 hover:underline" onClick={onClose}>
                    Gestionar conductores
                  </Link>
                  <Link to="/fleet/vehicles" className="text-violet-700 hover:underline" onClick={onClose}>
                    Gestionar vehículos
                  </Link>
                </div>
              </div>
              <p className="text-xs text-violet-800">
                Seleccione registros del catálogo o complete los campos manualmente abajo. Se aplican los marcados como predeterminados.
              </p>
              <div className={isPageLayout ? fieldGrid : 'grid grid-cols-1 sm:grid-cols-3 gap-3'}>
                {showTransportistaPublico && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Transportista</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                      value={selectedCarrierId === '' ? '' : String(selectedCarrierId)}
                      onChange={(ev) => handleFleetCarrierChange(ev.target.value)}
                    >
                      <option value="">— Manual —</option>
                      {fleetCarriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.doc_number} — {c.business_name}
                          {c.is_default ? ' ★' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Conductor</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={selectedDriverId === '' ? '' : String(selectedDriverId)}
                    onChange={(ev) => handleFleetDriverChange(ev.target.value)}
                  >
                    <option value="">— Manual —</option>
                    {fleetDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.doc_number} — {d.full_name}
                        {d.is_default ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vehículo</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={selectedVehicleId === '' ? '' : String(selectedVehicleId)}
                    onChange={(ev) => handleFleetVehicleChange(ev.target.value)}
                  >
                    <option value="">— Manual —</option>
                    {fleetVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                        {v.brand ? ` — ${v.brand}` : ''}
                        {v.is_default ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {showTransportistaPublico && (
            <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-sky-900 uppercase tracking-wide">
                Transportista (transporte público)
              </p>
              <p className="text-xs text-sky-800">
                Indique un transportista <strong>externo</strong> (otro RUC distinto al suyo y al destinatario). SUNAT rechaza con error 2560 si el transportista es igual al remitente/emisor.
                Si transporta con flota propia, cambie la modalidad a <strong>privado (02)</strong>.
              </p>
              <div className={isPageLayout ? fieldGrid : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">RUC transportista *</label>
                  <input
                    placeholder="RUC empresa transporte"
                    value={form.envio?.transportista_ruc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_ruc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Razón social transportista *</label>
                  <input
                    placeholder="Nombre del transportista"
                    value={form.envio?.transportista_razon ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_razon: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Placa</label>
                  <input
                    placeholder="ABC123"
                    value={form.envio?.transportista_placa ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_placa: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TUC / cert. habilitación vehicular</label>
                  <input
                    placeholder="Tarjeta única circulación o CHV (MTC)"
                    value={form.envio?.vehiculo_hab_cert ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, vehiculo_hab_cert: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nº MTC</label>
                  <input
                    placeholder="Registro MTC"
                    value={form.envio?.transportista_mtc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_mtc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doc. chofer</label>
                  <input
                    placeholder="DNI u otro documento"
                    value={form.envio?.chofer_doc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_doc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Licencia chofer</label>
                  <input
                    placeholder="Licencia de conducir"
                    value={form.envio?.chofer_licencia ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_licencia: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombres chofer</label>
                  <input
                    placeholder="Nombres del conductor"
                    value={form.envio?.chofer_nombres ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_nombres: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apellidos chofer</label>
                  <input
                    placeholder="Apellidos del conductor"
                    value={form.envio?.chofer_apellidos ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_apellidos: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-sky-700">
                Si registra placa y conductor aquí, SUNAT puede eximir la emisión de guía transportista (indicador GRE-T).
              </p>
            </section>
          )}

          {showFlotaPrivada && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-violet-900 uppercase tracking-wide">
                Flota propia (transporte privado)
              </p>
              <p className="text-xs text-violet-800">
                Usted transporta con vehículo propio: indique placa y conductor. No requiere RUC de transportista externo.
              </p>
              <div className={isPageLayout ? fieldGrid : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Placa vehículo *</label>
                  <input
                    placeholder="ABC123"
                    value={form.envio?.transportista_placa ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_placa: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TUC / cert. habilitación vehicular</label>
                  <input
                    placeholder="Recomendado si el vehículo está inscrito en MTC"
                    value={form.envio?.vehiculo_hab_cert ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, vehiculo_hab_cert: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doc. chofer *</label>
                  <input
                    placeholder="DNI"
                    value={form.envio?.chofer_doc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_doc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Licencia chofer *</label>
                  <input
                    placeholder="Licencia de conducir"
                    value={form.envio?.chofer_licencia ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_licencia: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombres chofer</label>
                  <input
                    placeholder="Nombres"
                    value={form.envio?.chofer_nombres ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_nombres: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apellidos chofer</label>
                  <input
                    placeholder="Apellidos"
                    value={form.envio?.chofer_apellidos ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_apellidos: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>
          )}

          {showTransportista && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                Guía transportista (31) — su empresa es el transportista emisor
              </p>
              <p className="text-xs text-amber-800">Indique quién entrega la mercadería (remitente) y los datos del vehículo.</p>
              <div className={isPageLayout ? fieldGrid : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remitente — tipo doc.</label>
                  <select
                    value={form.remitente?.tipo_doc ?? '6'}
                    onChange={(ev) =>
                      setForm((f) => ({
                        ...f,
                        remitente: { ...(f.remitente ?? { num_doc: '', rzn_social: '', address: '', ubigeo: '' }), tipo_doc: ev.target.value },
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="6">RUC</option>
                    <option value="1">DNI</option>
                    <option value="4">C.E.</option>
                    <option value="7">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remitente — RUC/DNI *</label>
                  <div className="flex gap-2">
                    <input
                      placeholder="RUC o DNI del remitente"
                      value={form.remitente?.num_doc ?? ''}
                      onChange={(ev) =>
                        setForm((f) => ({
                          ...f,
                          remitente: { ...(f.remitente ?? { tipo_doc: '6', rzn_social: '', address: '', ubigeo: '' }), num_doc: ev.target.value },
                        }))
                      }
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={consultRemitenteDoc}
                      disabled={remitenteConsultando}
                      className="shrink-0 px-3 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-medium hover:bg-amber-50 disabled:opacity-50"
                      title="Consultar SUNAT/RENIEC"
                    >
                      {remitenteConsultando ? <Loader2 size={16} className="animate-spin" /> : 'Consultar'}
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remitente — razón social *</label>
                  <input
                    placeholder="Quien entrega la mercadería"
                    value={form.remitente?.rzn_social ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({
                        ...f,
                        remitente: { ...(f.remitente ?? { tipo_doc: '6', num_doc: '', address: '', ubigeo: '' }), rzn_social: ev.target.value },
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remitente — dirección fiscal *</label>
                  <input
                    placeholder="Dirección del remitente (SUNAT exige ubigeo y dirección)"
                    value={form.remitente?.address ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({
                        ...f,
                        remitente: { ...(f.remitente ?? { tipo_doc: '6', num_doc: '', rzn_social: '', ubigeo: '' }), address: ev.target.value },
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remitente — ubigeo *</label>
                  <UbigeoSelects
                    regionId={remitenteUbigeo.regionId}
                    provinciaId={remitenteUbigeo.provinciaId}
                    distritoId={remitenteUbigeo.distritoId}
                    onChange={(r, p, d) => syncUbigeo('remitente', r, p, d)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Placa *</label>
                  <input
                    placeholder="ABC123"
                    value={form.envio?.transportista_placa ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_placa: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TUC / cert. habilitación vehicular</label>
                  <input
                    placeholder="Tarjeta única circulación o CHV (MTC)"
                    value={form.envio?.vehiculo_hab_cert ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, vehiculo_hab_cert: ev.target.value.toUpperCase() } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nº MTC</label>
                  <input
                    placeholder="Registro MTC"
                    value={form.envio?.transportista_mtc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, transportista_mtc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doc. chofer</label>
                  <input
                    placeholder="DNI u otro documento"
                    value={form.envio?.chofer_doc ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_doc: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Licencia *</label>
                  <input
                    placeholder="Licencia de conducir"
                    value={form.envio?.chofer_licencia ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_licencia: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombres chofer</label>
                  <input
                    placeholder="Nombres del conductor"
                    value={form.envio?.chofer_nombres ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_nombres: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Apellidos chofer</label>
                  <input
                    placeholder="Apellidos del conductor"
                    value={form.envio?.chofer_apellidos ?? ''}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, envio: { ...f.envio!, chofer_apellidos: ev.target.value } }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>
          )}

          <section className={isPageLayout ? 'border-t border-gray-100 pt-5' : 'border-t border-gray-100 pt-4'}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {!itemsLocked && (
                <button
                  type="button"
                  onClick={() => setShowProductPicker(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90"
                >
                  <Plus size={14} /> Agregar producto
                </button>
              )}
              <p className="text-xs text-gray-500 ml-auto">Total de ítems: {lineItems.length}</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">
                      Descripción
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[12%]">
                      Código
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[10%]">
                      Unid.
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[10%]">
                      Cant.
                    </th>
                    {!itemsLocked && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={itemsLocked ? 4 : 5} className="text-center py-8 text-gray-400 text-xs">
                        {itemsLocked
                          ? 'Seleccione un comprobante para cargar los productos'
                          : 'Agregue productos con el botón superior'}
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((it, idx) => (
                      <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2">
                          {itemsLocked ? (
                            <span className="text-gray-800">{it.descripcion}</span>
                          ) : (
                            <input
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                              value={it.descripcion}
                              onChange={(ev) => updateLineItem(idx, { descripcion: ev.target.value })}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-600">{it.codigo || '—'}</td>
                        <td className="px-3 py-2">
                          {itemsLocked ? (
                            <span>{it.unidad}</span>
                          ) : (
                            <input
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                              value={it.unidad}
                              onChange={(ev) => updateLineItem(idx, { unidad: ev.target.value })}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0.001}
                            step={0.01}
                            readOnly={itemsLocked}
                            className={`w-full max-w-[5rem] border border-gray-200 rounded-lg px-2 py-1 text-sm ${itemsLocked ? 'bg-gray-50' : ''}`}
                            value={it.cantidad}
                            onChange={(ev) =>
                              updateLineItem(idx, { cantidad: Number(ev.target.value) || 0 })
                            }
                          />
                        </td>
                        {!itemsLocked && (
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => removeLineItem(idx)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Quitar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
    </div>
  )

  return (
    <>
      {layout === 'page' ? (
        <div className="space-y-4 relative">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5">
            {formHeader}
            {formFields}
            {formFooter}
          </div>
        </div>
      ) : (
        <Modal open={open} onClose={onClose} contentClassName="max-w-4xl max-h-[92vh] overflow-y-auto">
          {formHeader}
          {formFields}
          {formFooter}
        </Modal>
      )}
      {auxiliaryModals}
    </>
  )
}
