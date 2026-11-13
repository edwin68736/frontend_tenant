/**
 * Exportación de servicios (operaciones 0201, 0202 y 0208): cliente del exterior, sin IGV. Lógica pura del formulario simple de
 * «Nuevo comprobante»; el servidor vuelve a validar todo (internal/exportacion).
 *
 * El cliente elegido en la venta ES el huésped: su nombre y su documento (pasaporte o carné de extranjería) salen del cliente y no se
 * vuelven a pedir. Solo se piden los datos que el cliente no tiene: país del pasaporte y fechas de la estadía.
 */
import { SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE, isExportOperation } from '@/constants/sunat'
import { toContactDocCode } from '@/utils/contactDocTypes'

/** Permanencia máxima desde el ingreso al país para que el hospedaje cuente como exportación (Ley del IGV, art. 33.4). */
export const EXPORT_MAX_STAY_DAYS = 60

export interface ExportFormState {
  /** 0201 y 0208: país donde se usa el servicio (opcional). */
  country_use: string
  /** 0202: país que emitió el pasaporte del huésped (y donde reside, salvo que se indique otro). */
  passport_country: string
  /** 0202: solo si el huésped reside en un país distinto al de su pasaporte; vacío = el mismo. */
  residence_country: string
  /** Las tres fechas son opcionales: vacías = el día de la emisión (el huésped entra y sale hoy; ingreso al país = ingreso al hotel). */
  entry_date: string
  check_in: string
  check_out: string
}

export const EMPTY_EXPORT_FORM: ExportFormState = {
  country_use: '',
  passport_country: '',
  residence_country: '',
  entry_date: '',
  check_in: '',
  check_out: '',
}

/** Lo que se usa del cliente de la venta. */
export interface ExportContact {
  doc_type?: string | number | null
  doc_number?: string | null
  business_name?: string | null
  /** País (ISO alfa-2) de un cliente extranjero. */
  country?: string | null
}

/** Huésped que sale del cliente: pasaporte (7) o carné de extranjería (4) con número y nombre; null si el cliente no sirve. */
export function guestFromContact(c: ExportContact | null | undefined): { name: string; docType: '7' | '4'; docNumber: string } | null {
  if (!c) return null
  const code = toContactDocCode(String(c.doc_type ?? ''))
  if (code !== '7' && code !== '4') return null
  const name = (c.business_name ?? '').replace(/\s+/g, ' ').trim()
  const docNumber = (c.doc_number ?? '').trim()
  if (name.length < 3 || docNumber.length < 4) return null
  return { name, docType: code, docNumber }
}

function parseDay(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  return Number.isNaN(t) ? null : t
}

const DAY_MS = 86_400_000

/** Días de la estadía (mínimo 1 si hay fechas válidas y salida ≥ ingreso); null si faltan o son inválidas. */
export function stayDays(checkIn: string, checkOut: string): number | null {
  const a = parseDay(checkIn)
  const b = parseDay(checkOut)
  if (a === null || b === null || b < a) return null
  return Math.max(1, Math.round((b - a) / DAY_MS))
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fechas efectivas de la estadía: las indicadas o, si están vacías, el día de la emisión. */
export function resolvedStayDates(f: ExportFormState): { entry: string; checkIn: string; checkOut: string } {
  const checkIn = f.check_in || todayISO()
  return { entry: f.entry_date || checkIn, checkIn, checkOut: f.check_out || checkIn }
}

/** Mensaje para el cajero si falta o sobra algo; null si el formulario está completo para esa operación. */
/** País del pasaporte que se usa: el elegido en la venta o, si no, el de la ficha del cliente. */
export function effectivePassportCountry(f: ExportFormState, contact?: ExportContact | null): string {
  return f.passport_country || (contact?.country ?? '').trim().toUpperCase()
}

export function exportFormError(op: string, f: ExportFormState, contact?: ExportContact | null): string | null {
  if (!isExportOperation(op)) return null
  if (op !== SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) {
    // El país donde se usa el servicio es opcional (SUNAT beta acepta 0201/0208 sin él).
    if (f.country_use === 'PE') return 'En una exportación el servicio se usa fuera del Perú'
    return null
  }
  if (!guestFromContact(contact)) {
    return 'Elija como cliente al huésped: debe estar registrado con su pasaporte o carné de extranjería (use «Nuevo cliente»)'
  }
  const passport = effectivePassportCountry(f, contact)
  if (!passport) return 'Indique el país del pasaporte del huésped (o regístrelo en la ficha del cliente)'
  if ((f.residence_country || passport) === 'PE') {
    return 'El huésped reside en el Perú: no es una exportación (use una venta normal con IGV)'
  }
  const r = resolvedStayDates(f)
  const entry = parseDay(r.entry)
  const inn = parseDay(r.checkIn)
  const out = parseDay(r.checkOut)
  if (entry === null) return 'La fecha de ingreso al país no es válida'
  if (inn === null) return 'La fecha de ingreso al hotel no es válida'
  if (out === null) return 'La fecha de salida del hotel no es válida'
  if (inn < entry) return 'El ingreso al hotel no puede ser anterior al ingreso al país'
  if (out < inn) return 'La salida no puede ser anterior al ingreso al hotel'
  if (Math.round((out - entry) / DAY_MS) > EXPORT_MAX_STAY_DAYS) {
    return `Pasa de ${EXPORT_MAX_STAY_DAYS} días desde su ingreso al país: ya no es exportación (use una venta normal con IGV)`
  }
  return null
}

/** Texto que sale en el comprobante (vista previa); el servidor arma el mismo texto al imprimir el documento guardado. */
export function exportPrintLines(op: string, f: ExportFormState, contact?: ExportContact | null): string[] {
  if (!isExportOperation(op)) return []
  const fmt = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—')
  if (op === SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) {
    const g = guestFromContact(contact)
    const doc = g?.docType === '4' ? 'C. Extranjería' : 'Pasaporte'
    const r = resolvedStayDates(f)
    const days = stayDays(r.checkIn, r.checkOut) ?? 1
    return [
      'EXPORTACIÓN DE SERVICIOS - DECRETO LEGISLATIVO Nº 919',
      `Huésped: ${g?.name ?? '—'} · Doc. ${doc} ${g?.docNumber ?? '—'} (emitido en ${effectivePassportCountry(f, contact)}) · Residencia: ${f.residence_country || effectivePassportCountry(f, contact)}`,
      `Ingreso al país: ${fmt(r.entry)} · Estadía: ${fmt(r.checkIn)} al ${fmt(r.checkOut)} (${days} día(s))`,
    ]
  }
  const lines = ['EXPORTACIÓN DE SERVICIOS']
  if (f.country_use) lines.push(`País donde se usa el servicio: ${f.country_use}`)
  return lines
}

/** Cuerpo `export` que espera el servidor para esa operación (el huésped lo toma el servidor del cliente de la venta). */
export function buildExportPayload(op: string, f: ExportFormState): Record<string, string> | undefined {
  if (!isExportOperation(op)) return undefined
  if (op !== SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) return f.country_use ? { country_use: f.country_use } : {}
  const body: Record<string, string> = {}
  if (f.passport_country) body.passport_country = f.passport_country
  if (f.entry_date) body.entry_date = f.entry_date
  if (f.check_in) body.check_in = f.check_in
  if (f.check_out) body.check_out = f.check_out
  if (f.residence_country) body.residence_country = f.residence_country
  return body
}
