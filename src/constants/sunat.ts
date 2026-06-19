/**
 * Catálogos SUNAT para facturación electrónica (Anexo 8).
 * Filtros y validaciones deben usar códigos, no nombres.
 */

/** Catálogo 01 — Tipo de comprobante. 00 = no enviable a SUNAT (ej. Nota de venta). */
export const SUNAT_TIPO_COMPROBANTE: Record<string, string> = {
  '00': 'N. Venta',
  '01': 'Factura',
  '02': 'Recibo por Honorarios',
  '03': 'Boleta',
  '04': 'Liquidación de Compra',
  '07': 'Nota de Crédito',
  '08': 'Nota de Débito',
  '09': 'Guía de Remisión',
  '20': 'Comprobante de Retención',
  'QT': 'COTIZACIÓN',
}

/** Catálogo 51 — Tipo de operación (tipoOperacion en payload). */
export const SUNAT_TIPO_OPERACION: Record<string, string> = {
  '0101': 'Venta interna',
  '0200': 'Exportación de bienes',
  '0201': 'Exportación de servicios',
  '0401': 'Ventas no domiciliados',
  '1001': 'Operación sujeta a detracción',
  '2001': 'Operación sujeta a percepción',
}

/** Código por defecto para venta interna (Factura y Boleta). */
export const SUNAT_TIPO_OPERACION_VENTA_INTERNA = '0101'

/** Operación sujeta a detracción (solo factura 01). */
export const SUNAT_TIPO_OPERACION_DETRACCION = '1001'

/** Opciones habilitadas en Nuevo Comprobante. 1001 solo con factura (01). */
export const SALES_OPERATION_TYPE_OPTIONS: { code: string; label: string }[] = [
  { code: SUNAT_TIPO_OPERACION_VENTA_INTERNA, label: 'Venta interna' },
  { code: SUNAT_TIPO_OPERACION_DETRACCION, label: 'Operación sujeta a detracción' },
]

/** Orden en POS: 00 (N. Venta), 03 (Boleta), 01 (Factura). */
export const POS_SUNAT_CODE_ORDER = ['00', '03', '01']

/** Monto máximo en soles para venta con cliente doc. tipo 0 (sin RUC) según SUNAT (boleta/nota de venta). */
export const SUNAT_MAX_MONTO_CLIENTE_SIN_RUC = 700

/** Longitud del RUC en Perú (dígitos). */
export const SUNAT_RUC_LENGTH = 11

/** Catálogo 59 — Medios de pago SUNAT (solo referencia; el sistema envía siempre forma de pago Contado). */
export const SUNAT_MEDIO_PAGO: Record<string, string> = {
  '001': 'Depósito en cuenta',
  '002': 'Giro',
  '003': 'Transferencia de fondos',
  '005': 'Tarjeta de débito',
  '006': 'Tarjeta de crédito',
  '008': 'Efectivo (sin obligación medio de pago)',
  '009': 'Efectivo',
  '999': 'Otros medios de pago',
}

/** Métodos de pago internos del tenant (control de caja, reportes). Etiquetas para UI. */
export const INTERNAL_PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

/** Obtiene la etiqueta de un método de pago interno. */
export function getInternalPaymentMethodLabel(method: string): string {
  return INTERNAL_PAYMENT_METHOD_LABELS[method?.toLowerCase() ?? ''] ?? method ?? ''
}

/** Etiqueta para método de pago: prioriza interno, luego SUNAT (legacy). */
export function getMedioPagoLabel(code: string): string {
  const c = code?.trim() ?? ''
  return getInternalPaymentMethodLabel(c) || SUNAT_MEDIO_PAGO[c] || c
}

/** Catálogo 06 — Tipo de documento de identidad del cliente (client.tipoDoc). */
export const SUNAT_TIPO_DOC_IDENTIDAD: Record<string, string> = {
  '0': 'DOC.TRIB.NO.DOM.SIN.RUC',
  '1': 'Documento Nacional de Identidad',
  '4': 'Carnet de extranjería',
  '6': 'Registro Unico de Contributentes',
  '7': 'Pasaporte',
}

/** Lista para selects (documento del cliente): código, label completo y shortLabel para UI. */
export const SUNAT_TIPO_DOC_IDENTIDAD_LIST: { code: string; label: string; shortLabel: string }[] = [
  { code: '0', label: 'DOC.TRIB.NO.DOM.SIN.RUC', shortLabel: 'Sin RUC' },
  { code: '1', label: 'Documento Nacional de Identidad', shortLabel: 'DNI' },
  { code: '4', label: 'Carnet de extranjería', shortLabel: 'Carnet extranjería' },
  { code: '6', label: 'Registro Unico de Contributentes', shortLabel: 'RUC' },
  { code: '7', label: 'Pasaporte', shortLabel: 'Pasaporte' },
]

export function getTipoComprobanteLabel(code: string): string {
  return SUNAT_TIPO_COMPROBANTE[code] ?? code
}

export function isElectronicSunatCode(code?: string | null): boolean {
  const c = String(code ?? '').trim()
  return c === '01' || c === '03'
}

export function getTipoDocIdentidadLabel(code: string): string {
  if (!code) return ''
  const c = String(code).trim()
  if (SUNAT_TIPO_DOC_IDENTIDAD[c]) return SUNAT_TIPO_DOC_IDENTIDAD[c]
  // Compatibilidad con códigos legacy en BD
  if (c === '11') return 'Carnet de extranjería'
  return code
}

/** Etiqueta corta para tablas y listados (DNI, RUC, Pasaporte, etc.). */
export function getTipoDocIdentidadShortLabel(code: string): string {
  const c = toTipoDocIdentidadCode(code)
  const item = SUNAT_TIPO_DOC_IDENTIDAD_LIST.find(d => d.code === c)
  if (item) return item.shortLabel
  if (c === '11') return 'Carnet extranjería'
  return c
}

/**
 * Formato compacto: "DNI: 12345678", "RUC: 20123456789".
 * Código 0 (sin RUC / no domiciliado): solo el número, sin prefijo.
 */
export function formatTipoDocIdentidadDisplay(code: string, docNumber?: string): string {
  const c = toTipoDocIdentidadCode(code)
  const num = (docNumber ?? '').trim()
  if (c === '0') return num
  const short = getTipoDocIdentidadShortLabel(c)
  if (!num) return short
  return `${short}: ${num}`
}

/** Normaliza valor legacy (RUC, DNI, etc.) a código SUNAT para el select. */
export function toTipoDocIdentidadCode(value: string): string {
  if (!value) return '6'
  const u = value.toUpperCase().trim()
  if (u === 'RUC') return '6'
  if (u === 'DNI') return '1'
  if (u === 'CE' || u === 'CARNET EXTRAJERIA' || u === 'CARNET DE EXTRANJERÍA') return '4'
  if (u === 'PASAPORTE') return '7'
  if (u === 'OTROS' || u === 'OTRO' || u === 'DOC.TRIB.NO.DOM.SIN.RUC') return '0'
  if (value === '11') return '4' // legacy: carnet extranjería 11 → 4
  if (SUNAT_TIPO_DOC_IDENTIDAD[value]) return value
  return value
}
