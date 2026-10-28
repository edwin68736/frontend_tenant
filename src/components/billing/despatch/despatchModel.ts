import type { CreateDespatchInput } from '@/services/billing.service'
import type { GreCarrier, GreDriver, GreVehicle } from '@/services/fleet.service'
import { normalizeGreLicencia, validateGreDriverFields } from '@/utils/greDriver'
import { getTodayPeru } from '@/utils/datesPeru'

/** 09 = remitente (envío mis mercaderías), 31 = transportista (transporto mercadería de otros). */
export type GreKind = '09' | '31'

/** Motivos en lenguaje de negocio. El código del catálogo 20 nunca se muestra al usuario. */
export type Motivo = 'venta' | 'traslado' | 'compra' | 'devolucion' | 'otros'

export const MOTIVOS: { id: Motivo; code: string; title: string; hint: string }[] = [
  { id: 'venta', code: '01', title: 'Venta', hint: 'Entrego mercadería a un cliente' },
  { id: 'traslado', code: '04', title: 'Traslado entre establecimientos de la misma empresa', hint: 'Muevo mercadería a otra sucursal' },
  { id: 'compra', code: '02', title: 'Compra', hint: 'Recojo lo que me vende un proveedor' },
  { id: 'devolucion', code: '06', title: 'Devolución', hint: 'Devuelvo mercadería a un cliente o proveedor' },
  { id: 'otros', code: '13', title: 'Otros', hint: 'Cualquier otro traslado (lo describo)' },
]

export interface PartyData {
  tipo_doc: string
  num_doc: string
  rzn_social: string
  address: string
  ubigeo: string
}

export const emptyParty = (tipo = '6'): PartyData => ({ tipo_doc: tipo, num_doc: '', rzn_social: '', address: '', ubigeo: '' })

/** Punto de partida o llegada. `branchId` solo si es una de mis sucursales. */
export interface Place {
  address: string
  ubigeo: string
  branchId: number | null
}

export const emptyPlace = (): Place => ({ address: '', ubigeo: '', branchId: null })

export interface LineItem {
  key: string
  product_id?: number | null
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
}

export interface SecondaryDriverDraft {
  doc_type: string
  doc: string
  licencia: string
  nombres: string
}

/**
 * Documento relacionado (catálogo 61): tipo, RUC del emisor, serie y número. `primary` marca el
 * documento principal de la guía (la GRE remitente de una guía transportista): se edita arriba
 * y no se repite en «Opciones adicionales».
 */
export interface RelatedDocDraft {
  tipo: string
  ruc: string
  serie: string
  numero: string
  primary?: boolean
}

export const emptyRelatedDoc = (tipo = '01', ruc = ''): RelatedDocDraft => ({ tipo, ruc, serie: '', numero: '' })

/** RUC peruano: 11 dígitos con dígito verificador (módulo 11). */
export function isValidRuc(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0)
  const check = (11 - (sum % 11)) % 10
  return check === Number(ruc[10])
}

/** Serie de 4 caracteres alfanuméricos (T001, EG01…) y número de hasta 8 dígitos. */
export const isValidSerie = (s: string) => /^[A-Z0-9]{4}$/i.test(s.trim())
export const isValidNumero = (n: string) => /^\d{1,8}$/.test(n.trim())

const docFilled = (d: RelatedDocDraft) => Boolean(d.serie.trim() || d.numero.trim())

/** «T001-9» → { serie, numero } (sin ceros a la izquierda en el número). */
export function splitDocNumber(raw: string): { serie: string; numero: string } {
  const [serie = '', numero = ''] = raw.trim().toUpperCase().split('-')
  return { serie, numero: numero.replace(/^0+(?=\d)/, '') }
}


export interface DespatchDraft {
  kind: GreKind
  branchId: number
  motivo: Motivo
  otrosDescripcion: string
  devolucionHacia: 'cliente' | 'proveedor'
  /** 09: cliente / proveedor / tercero. 31: remitente (quien entrega la mercadería). */
  party: PartyData
  /** 31: destinatario. */
  receiver: PartyData
  /** Traslado entre locales: sucursal de destino. */
  destinoBranchId: number | null
  partida: Place
  llegada: Place
  /** Mientras no se toque a mano, el punto sigue a la parte (dirección del cliente, etc.). */
  partidaTouched: boolean
  llegadaTouched: boolean
  transporte: 'propio' | 'empresa'
  carrierId: number | ''
  driverId: number | ''
  vehicleId: number | ''
  peso: string
  bultos: string
  bultosTouched: boolean
  fecha: string
  items: LineItem[]
  sourceSaleId: number | null
  sourceLabel: string
  m1l: boolean
  retornoEnvases: boolean
  retornoVacio: boolean
  transbordo: boolean
  pagaFleteRemitente: boolean
  chofer2: SecondaryDriverDraft
  vehiculo2: string
  docsRel: RelatedDocDraft[]
  /** El origen elegido es una factura o boleta pero todavía no se escogió ninguna. */
  needsSource: boolean
  /** Guía transportista: el documento relacionado principal es una guía remitente que se debe indicar. */
  needsRelatedGre: boolean
  observacion: string
}

export const newKey = () => Math.random().toString(36).slice(2)

export function emptyDraft(kind: GreKind, branchId: number): DespatchDraft {
  return {
    kind,
    branchId,
    motivo: 'venta',
    otrosDescripcion: '',
    devolucionHacia: 'cliente',
    party: emptyParty(),
    receiver: emptyParty(),
    destinoBranchId: null,
    partida: emptyPlace(),
    llegada: emptyPlace(),
    partidaTouched: false,
    llegadaTouched: false,
    transporte: 'propio',
    carrierId: '',
    driverId: '',
    vehicleId: '',
    peso: '',
    bultos: '1',
    bultosTouched: false,
    fecha: getTodayPeru(),
    items: [],
    sourceSaleId: null,
    sourceLabel: '',
    m1l: false,
    retornoEnvases: false,
    retornoVacio: false,
    transbordo: false,
    pagaFleteRemitente: false,
    chofer2: { doc_type: '1', doc: '', licencia: '', nombres: '' },
    vehiculo2: '',
    docsRel: [],
    needsSource: false,
    needsRelatedGre: false,
    observacion: '',
  }
}

export interface FleetCatalog {
  carriers: GreCarrier[]
  drivers: GreDriver[]
  vehicles: GreVehicle[]
}

export interface ValidationContext {
  companyRuc: string
  fleet: FleetCatalog
  hasSeries: boolean
}

export type SectionId = 'motivo' | 'party' | 'route' | 'transport' | 'cargo'

export type SectionErrors = Partial<Record<SectionId, string[]>>

const cleanDoc = (v: string) => v.replace(/-/g, '').trim()

export function splitDriverName(full: string): { nombres: string; apellidos: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { nombres: full.trim(), apellidos: '' }
  return { nombres: parts[0], apellidos: parts.slice(1).join(' ') }
}

export const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')

/** El destinatario es la propia empresa (traslado entre locales y compra). */
export const partyIsCompany = (d: DespatchDraft) => d.kind === '09' && (d.motivo === 'traslado' || d.motivo === 'compra')

/** Qué rol cumple la "otra parte" y cómo se llama en pantalla. */
export function partyRoleLabel(d: DespatchDraft): string {
  if (d.kind === '31') return 'Remitente'
  switch (d.motivo) {
    case 'compra':
      return 'Proveedor'
    case 'devolucion':
      return d.devolucionHacia === 'proveedor' ? 'Proveedor al que devuelves' : 'Cliente al que devuelves'
    case 'otros':
      return 'Destinatario'
    default:
      return 'Cliente'
  }
}

/**
 * Valida cada sección con mensajes en lenguaje de negocio. Devuelve solo las secciones con
 * problemas; vacío = lista para emitir.
 */
export function validateDraft(d: DespatchDraft, ctx: ValidationContext): SectionErrors {
  const errs: SectionErrors = {}
  const add = (s: SectionId, msg: string) => {
    ;(errs[s] ??= []).push(msg)
  }
  const ruc = cleanDoc(ctx.companyRuc)

  if (!ctx.hasSeries) add(d.kind === '31' ? 'party' : 'motivo', d.kind === '31' ? 'Falta configurar una serie de guía transportista (Empresa → Series).' : 'Falta configurar una serie de guía remitente (Empresa → Series).')
  if (d.kind === '09' && d.needsSource && !d.sourceSaleId) add('motivo', 'Selecciona la factura o boleta de origen.')
  if (d.kind === '09' && d.motivo === 'otros' && !d.otrosDescripcion.trim()) {
    add('motivo', 'Cuéntanos brevemente el motivo del traslado.')
  }

  // Documentos relacionados: formato (no existencia). Si una fila se empieza, debe completarse.
  const rowErr = (x: RelatedDocDraft, label: string) => {
    if (!isValidRuc(x.ruc.trim())) add('party', `${label}: el RUC del emisor no es válido (11 dígitos).`)
    if (!isValidSerie(x.serie)) add('party', `${label}: la serie debe tener 4 caracteres (por ejemplo T001).`)
    if (!isValidNumero(x.numero)) add('party', `${label}: indica el número del documento.`)
  }
  if (d.kind === '31' && d.needsRelatedGre) {
    const primary = d.docsRel.find((x) => x.primary)
    if (!primary) add('party', 'Indica la guía de remisión remitente (RUC del remitente, serie y número).')
    else rowErr(primary, 'Guía remitente relacionada')
  }
  d.docsRel.filter((x) => !x.primary && docFilled(x)).forEach((x, i) => rowErr(x, `Documento relacionado ${i + 1}`))

  // Partes
  if (d.kind === '09') {
    if (d.motivo === 'traslado') {
      if (!d.destinoBranchId) add('party', 'Elige a qué sucursal envías la mercadería.')
      else if (d.destinoBranchId === d.branchId) add('party', 'La sucursal de destino debe ser distinta de la que envía.')
    } else {
      if (!d.party.num_doc.trim() || !d.party.rzn_social.trim()) {
        add('party', `Busca al ${partyRoleLabel(d).toLowerCase()} por RUC o DNI.`)
      } else if (ruc && cleanDoc(d.party.num_doc) === ruc) {
        add('party', 'No puedes enviarte a tu propia empresa con este motivo; usa «Traslado entre establecimientos».')
      }
    }
  } else {
    if (!d.party.num_doc.trim() || !d.party.rzn_social.trim()) add('party', 'Indica quién entrega la mercadería (remitente).')
    else if (ruc && cleanDoc(d.party.num_doc) === ruc) add('party', 'El remitente no puede ser tu propia empresa.')
    if (!d.party.address.trim() || !d.party.ubigeo.trim()) add('party', 'Falta la dirección fiscal del remitente (con su distrito).')
    if (!d.receiver.num_doc.trim() || !d.receiver.rzn_social.trim()) add('party', 'Indica quién recibe la mercadería (destinatario).')
    else if (ruc && cleanDoc(d.receiver.num_doc) === ruc) add('party', 'El destinatario no puede ser tu propia empresa.')
  }

  // Ruta
  if (!d.partida.address.trim() || !d.partida.ubigeo.trim()) {
    add('route', d.kind === '31' || d.motivo === 'compra' ? 'Indica dónde se recoge la mercadería (dirección y distrito).' : 'Indica desde dónde sale la mercadería (dirección y distrito).')
  }
  if (!d.llegada.address.trim() || !d.llegada.ubigeo.trim()) {
    add('route', 'Indica a dónde llega la mercadería (dirección y distrito).')
  }
  if (d.kind === '09' && d.motivo === 'traslado' && d.partida.address.trim() && d.llegada.address.trim()) {
    if (d.partida.ubigeo === d.llegada.ubigeo && norm(d.partida.address) === norm(d.llegada.address)) {
      add('route', 'En un traslado entre locales el destino debe ser distinto del origen.')
    }
  }

  // Transporte
  const driver = ctx.fleet.drivers.find((x) => x.id === d.driverId)
  const vehicle = ctx.fleet.vehicles.find((x) => x.id === d.vehicleId)
  const carrier = ctx.fleet.carriers.find((x) => x.id === d.carrierId)
  const privado = d.kind === '31' || d.transporte === 'propio'
  const sinVehiculoYConductor = d.kind === '09' && d.m1l
  if (privado) {
    if (!sinVehiculoYConductor) {
      if (!driver) add('transport', 'Elige el conductor.')
      else {
        const e = validateGreDriverFields(driver.doc_number, driver.license_number ?? '', true)
        if (e) add('transport', `A ${driver.full_name} le falta una licencia de conducir válida (9 a 10 caracteres). Corrígela en Conductores.`)
      }
      if (!vehicle) add('transport', 'Elige el vehículo.')
      else if (!driver) add('transport', 'La placa solo se declara junto con el conductor.')
    }
  } else {
    if (!carrier) add('transport', 'Elige la empresa de transporte.')
    else {
      const carrierRuc = carrier.doc_type === '6' ? cleanDoc(carrier.doc_number) : ''
      if (!carrierRuc) add('transport', 'La empresa de transporte necesita un RUC.')
      if (carrierRuc && ruc && carrierRuc === ruc) {
        add('transport', 'La empresa de transporte no puede ser tu propia empresa. Si transportas tú, elige «Yo mismo».')
      }
      const destDoc = d.kind === '09' ? (partyIsCompany(d) ? ruc : cleanDoc(d.party.num_doc)) : cleanDoc(d.receiver.num_doc)
      if (carrierRuc && destDoc && carrierRuc === destDoc) {
        add('transport', 'La empresa de transporte no puede ser la misma que recibe la mercadería.')
      }
    }
  }
  if (d.chofer2.doc.trim() || d.chofer2.licencia.trim()) {
    const e = validateGreDriverFields(d.chofer2.doc, d.chofer2.licencia, true)
    if (e) add('transport', `Segundo conductor: ${e}`)
  }

  // Carga
  const peso = Number(d.peso)
  if (!(peso > 0)) add('cargo', 'Indica el peso total en kilos (mayor a 0).')
  if (!d.items.some((i) => i.descripcion.trim() && i.cantidad > 0)) add('cargo', 'Agrega al menos un producto con cantidad mayor a 0.')
  if (!d.fecha) add('cargo', 'Indica la fecha del traslado.')
  else if (d.fecha < getTodayPeru()) add('cargo', 'La fecha del traslado no puede ser anterior a hoy.')
  if (d.observacion.length > 250) add('cargo', 'Las observaciones pueden tener hasta 250 caracteres.')

  return errs
}

/** Arma el cuerpo que espera `POST /api/billing/despatches`. */
export function buildPayload(
  d: DespatchDraft,
  seriesId: number,
  fleet: FleetCatalog,
  company: { ruc: string; razon: string },
): CreateDespatchInput {
  const motivo = MOTIVOS.find((m) => m.id === d.motivo)!
  const driver = fleet.drivers.find((x) => x.id === d.driverId)
  const vehicle = fleet.vehicles.find((x) => x.id === d.vehicleId)
  const carrier = fleet.carriers.find((x) => x.id === d.carrierId)
  const privado = d.kind === '31' || d.transporte === 'propio'
  const sinVehiculo = d.kind === '09' && d.m1l

  const fecha = d.fecha
  const bultos = Math.max(1, Math.floor(Number(d.bultos) || 1))
  const envio: CreateDespatchInput['envio'] = {
    cod_traslado: d.kind === '09' ? motivo.code : '01',
    des_traslado: d.kind === '09' ? (d.motivo === 'otros' ? d.otrosDescripcion.trim() : motivo.title) : 'Venta',
    mod_traslado: privado ? '02' : '01',
    fec_traslado: fecha,
    fec_entrega_transportista: fecha,
    partida_ubigueo: d.partida.ubigeo,
    partida_direccion: d.partida.address.trim(),
    llegada_ubigueo: d.llegada.ubigeo,
    llegada_direccion: d.llegada.address.trim(),
    peso_total: Number(d.peso),
    und_peso_total: 'KGM',
    num_bultos: bultos,
  }
  if (d.kind === '09' && d.motivo === 'traslado') envio.des_traslado = 'Traslado entre establecimientos'

  if (privado && !sinVehiculo && driver && vehicle) {
    const { nombres, apellidos } = splitDriverName(driver.full_name)
    envio.chofer_tipo_doc = driver.doc_type
    envio.chofer_doc = driver.doc_number
    envio.chofer_licencia = normalizeGreLicencia(driver.license_number ?? '')
    envio.chofer_nombres = nombres
    envio.chofer_apellidos = apellidos
    envio.transportista_placa = vehicle.plate
    if (vehicle.habilitation_cert) envio.vehiculo_hab_cert = vehicle.habilitation_cert
  }
  if (!privado && carrier) {
    envio.transportista_ruc = carrier.doc_number
    envio.transportista_razon = carrier.business_name
    if (carrier.mtc_number) envio.transportista_mtc = carrier.mtc_number
  }
  if (d.kind === '31' && carrier) {
    // La guía transportista la emite la propia empresa; el MTC es el de la empresa si lo tiene.
    if (carrier.mtc_number) envio.transportista_mtc = carrier.mtc_number
  }
  if (d.kind === '09' && d.m1l) envio.ind_m1l = true
  if (d.retornoEnvases) envio.ind_retorno_envases = true
  if (d.retornoVacio) envio.ind_retorno_vehiculo_vacio = true
  if (d.transbordo) envio.ind_transbordo = true
  if (d.kind === '31' && d.pagaFleteRemitente) envio.paga_flete_remitente = true
  if (privado && !sinVehiculo && d.chofer2.doc.trim() && d.chofer2.licencia.trim()) {
    envio.chofer_secundario = {
      tipo_doc: d.chofer2.doc_type,
      doc: d.chofer2.doc.trim(),
      licencia: normalizeGreLicencia(d.chofer2.licencia),
      nombres: d.chofer2.nombres.trim() || undefined,
    }
  }
  if (privado && !sinVehiculo && d.vehiculo2.trim()) envio.vehiculo_secundario = { placa: d.vehiculo2.trim() }

  const toParty = (p: PartyData) => ({
    tipo_doc: p.tipo_doc,
    num_doc: cleanDoc(p.num_doc),
    rzn_social: p.rzn_social.trim(),
    address: p.address.trim(),
    ubigeo: p.ubigeo || undefined,
  })

  const payload: CreateDespatchInput = {
    branch_id: d.branchId,
    series_id: seriesId,
    source_sale_id: d.sourceSaleId ?? undefined,
    destinatario: d.kind === '31' ? toParty(d.receiver) : partyIsCompany(d) ? { tipo_doc: '6', num_doc: company.ruc, rzn_social: company.razon } : toParty(d.party),
    envio,
    details: d.items
      .filter((i) => i.descripcion.trim() && i.cantidad > 0)
      .map((i) => ({ codigo: i.codigo, descripcion: i.descripcion.trim(), unidad: i.unidad || 'NIU', cantidad: i.cantidad })),
    observacion: d.observacion.trim() || undefined,
  }
  if (d.kind === '31') payload.remitente = toParty(d.party)
  if (d.kind === '09' && d.motivo === 'compra') payload.tercero = toParty(d.party)

  const seen = new Set<string>()
  const docs: NonNullable<CreateDespatchInput['docs_relacionados']> = []
  for (const x of d.docsRel) {
    if (!x.serie.trim() || !x.numero.trim()) continue
    const nro = `${x.serie.trim().toUpperCase()}-${x.numero.trim().replace(/^0+(?=\d)/, '')}`
    const emisor = x.ruc.trim()
    const key = `${x.tipo}|${emisor}|${nro}`
    if (seen.has(key)) continue
    seen.add(key)
    docs.push({ tipo: x.tipo, nro, emisor: emisor || undefined })
  }
  if (docs.length) payload.docs_relacionados = docs
  return payload
}
