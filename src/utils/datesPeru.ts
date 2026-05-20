/**
 * Utilidades de fecha/hora en zona horaria Perú (America/Lima, UTC-5).
 * Todas las fechas que se envían al backend desde el panel tenant deben usar estas funciones
 * para mantener consistencia con SUNAT y el facturador (Lycet).
 */
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { format, addDays } from 'date-fns'

const ZONE_PERU = 'America/Lima'

/**
 * Devuelve la fecha de hoy en Perú en formato YYYY-MM-DD (para issue_date, due_date, etc.).
 */
export function getTodayPeru(): string {
  return formatInTimeZone(new Date(), ZONE_PERU, 'yyyy-MM-dd')
}

/**
 * Devuelve una fecha en Perú sumando días a hoy (p. ej. vencimiento +8 días).
 */
export function getTodayPlusDaysPeru(days: number): string {
  const now = new Date()
  const inPeru = toZonedTime(now, ZONE_PERU)
  const result = addDays(inPeru, days)
  return formatInTimeZone(result, ZONE_PERU, 'yyyy-MM-dd')
}

/**
 * Formatea un Date a ISO 8601 con zona horaria Perú (ej. "2026-03-12T10:30:00-05:00").
 * Para enviar fechaEmision, fecVencimiento con hora, fec_traslado, etc.
 */
export function toISOStringPeru(date: Date = new Date()): string {
  return formatInTimeZone(date, ZONE_PERU, "yyyy-MM-dd'T'HH:mm:ssXXX")
}

/**
 * Formatea solo la parte de fecha en Perú (YYYY-MM-DD).
 * Si recibe una cadena YYYY-MM-DD (sin hora), la trata como fecha en Perú sin cambiar día.
 */
export function formatDatePeru(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, ZONE_PERU, 'yyyy-MM-dd')
}

/**
 * Formatea para mostrar en la UI (ej. "12/03/2026") en hora Perú.
 * Para cadenas YYYY-MM-DD usa mediodía Perú para evitar cambio de día.
 */
export function formatDisplayDatePeru(date: Date | string): string {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + 'T12:00:00-05:00')
    : typeof date === 'string'
      ? new Date(date)
      : date
  return formatInTimeZone(d, ZONE_PERU, 'dd/MM/yyyy')
}

/**
 * Formatea para input datetime-local (yyyy-MM-ddTHH:mm) en hora Perú.
 */
export function toDateTimeLocalPeru(date: Date = new Date()): string {
  return formatInTimeZone(date, ZONE_PERU, "yyyy-MM-dd'T'HH:mm")
}

/**
 * Parsea un valor de input datetime-local (que el usuario ve en Perú) a ISO con offset -05:00.
 */
export function fromDateTimeLocalToISOPeru(dateTimeLocal: string): string {
  if (!dateTimeLocal) return ''
  const [datePart, timePart] = dateTimeLocal.split('T')
  if (!datePart || !timePart) return ''
  return `${datePart}T${timePart}:00-05:00`
}
