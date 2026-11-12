/**
 * Exportación de servicios (operaciones 0201, 0202 y 0208): cliente del exterior, sin IGV. Lógica pura del formulario simple de
 * «Nuevo comprobante»; el servidor vuelve a validar todo (internal/exportacion).
 */
import {
  SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE,
  isExportOperation,
} from '@/constants/sunat'

/** Permanencia máxima desde el ingreso al país para que el hospedaje cuente como exportación (Ley del IGV, art. 33.4). */
export const EXPORT_MAX_STAY_DAYS = 60

export interface ExportFormState {
  /** 0201 y 0208: país donde se usa el servicio. */
  country_use: string
  /** 0202: huésped y estadía. */
  guest_name: string
  guest_doc_type: '7' | '4'
  guest_doc_number: string
  passport_country: string
  residence_country: string
  entry_date: string
  check_in: string
  check_out: string
}

export const EMPTY_EXPORT_FORM: ExportFormState = {
  country_use: '',
  guest_name: '',
  guest_doc_type: '7',
  guest_doc_number: '',
  passport_country: '',
  residence_country: '',
  entry_date: '',
  check_in: '',
  check_out: '',
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

/** Mensaje para el cajero si falta o sobra algo; null si el formulario está completo para esa operación. */
export function exportFormError(op: string, f: ExportFormState): string | null {
  if (!isExportOperation(op)) return null
  if (op !== SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) {
    if (!f.country_use) return 'Elija el país donde se usa el servicio'
    if (f.country_use === 'PE') return 'En una exportación el servicio se usa fuera del Perú'
    return null
  }
  if (f.guest_name.trim().length < 3) return 'Indique el nombre del huésped'
  if (f.guest_doc_number.trim().length < 4) return 'Indique el número de pasaporte del huésped'
  if (!f.passport_country) return 'Indique el país que emitió el pasaporte'
  if (!f.residence_country) return 'Indique el país de residencia del huésped'
  if (f.residence_country === 'PE') {
    return 'El huésped reside en el Perú: no es una exportación (use una venta normal con IGV)'
  }
  const entry = parseDay(f.entry_date)
  const inn = parseDay(f.check_in)
  const out = parseDay(f.check_out)
  if (entry === null) return 'Indique la fecha de ingreso al país'
  if (inn === null) return 'Indique la fecha de ingreso al hotel'
  if (out === null) return 'Indique la fecha de salida del hotel'
  if (inn < entry) return 'El ingreso al hotel no puede ser anterior al ingreso al país'
  if (out < inn) return 'La salida no puede ser anterior al ingreso al hotel'
  if (Math.round((out - entry) / DAY_MS) > EXPORT_MAX_STAY_DAYS) {
    return `Pasa de ${EXPORT_MAX_STAY_DAYS} días desde su ingreso al país: ya no es exportación (use una venta normal con IGV)`
  }
  return null
}

/** Texto que sale en el comprobante (vista previa); el servidor arma el mismo texto al imprimir el documento guardado. */
export function exportPrintLines(op: string, f: ExportFormState): string[] {
  if (!isExportOperation(op)) return []
  const fmt = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—')
  if (op === SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) {
    const doc = f.guest_doc_type === '4' ? 'C. Extranjería' : 'Pasaporte'
    const days = stayDays(f.check_in, f.check_out) ?? 0
    return [
      'EXPORTACIÓN DE SERVICIOS - DECRETO LEGISLATIVO Nº 919',
      `Huésped: ${f.guest_name.trim()} · Doc. ${doc} ${f.guest_doc_number.trim()} (emitido en ${f.passport_country}) · Residencia: ${f.residence_country}`,
      `Ingreso al país: ${fmt(f.entry_date)} · Estadía: ${fmt(f.check_in)} al ${fmt(f.check_out)} (${days} día(s))`,
    ]
  }
  const lines = ['EXPORTACIÓN DE SERVICIOS']
  if (f.country_use) lines.push(`País donde se usa el servicio: ${f.country_use}`)
  return lines
}

/** Cuerpo `export` que espera el servidor para esa operación (solo los campos que corresponden). */
export function buildExportPayload(op: string, f: ExportFormState): Record<string, string> | undefined {
  if (!isExportOperation(op)) return undefined
  if (op !== SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) return { country_use: f.country_use }
  return {
    guest_name: f.guest_name.trim(),
    guest_doc_type: f.guest_doc_type,
    guest_doc_number: f.guest_doc_number.trim(),
    passport_country: f.passport_country,
    residence_country: f.residence_country,
    entry_date: f.entry_date,
    check_in: f.check_in,
    check_out: f.check_out,
  }
}
