/**
 * Tamaño del logo en TODOS los comprobantes (factura/boleta/NV), separado por formato:
 * ticket (rollo térmico, PDF y ESC/POS directo) y A4 tienen proporciones muy distintas.
 * Ajuste a nivel tenant (servidor, vía companyService.updateConfig), igual en todas las cajas.
 */
import { getCompanyConfigCache } from '@/lib/companyConfig/store'

export type LogoPrintSize = 'pequeno' | 'mediano' | 'grande'
export type LogoPrintFormat = 'ticket' | 'a4'

export const DEFAULT_LOGO_PRINT_SIZE: LogoPrintSize = 'mediano'

export const LOGO_PRINT_SIZE_OPTIONS: { value: LogoPrintSize; label: string; hint: string }[] = [
  { value: 'pequeno', label: 'Pequeño', hint: 'Discreto, ocupa poco papel.' },
  { value: 'mediano', label: 'Mediano', hint: 'Tamaño recomendado.' },
  { value: 'grande', label: 'Grande', hint: 'Máxima visibilidad en el comprobante.' },
]

/**
 * Factor aplicado al tamaño base del logo, por formato. Los tamaños base de los renderers
 * (ticket 32×12 mm en rollo de 80, A4 36×22 mm) son la medida «1».
 *
 * Los usuarios reportaron que los tres tamaños se veían chicos («grande» parecía mediano,
 * «mediano» parecía pequeño y «pequeño» un micrologo), así que la escala sube: el nuevo
 * «pequeño» equivale al antiguo «mediano». El ticket puede crecer más porque el rollo tiene
 * ancho para el logo completo; en A4 el logo comparte la cabecera con los datos de la empresa
 * y el recuadro del documento, así que la escala es más contenida.
 */
const SCALE: Record<LogoPrintFormat, Record<LogoPrintSize, number>> = {
  ticket: { pequeno: 1, mediano: 1.5, grande: 2 },
  a4: { pequeno: 1, mediano: 1.4, grande: 1.8 },
}

export function normalizeLogoPrintSize(raw: unknown): LogoPrintSize {
  return raw === 'pequeno' || raw === 'grande' ? raw : DEFAULT_LOGO_PRINT_SIZE
}

/**
 * Tamaño configurado a nivel tenant para el formato dado, leído del caché local de config.
 * Solo para contextos sin un `PrintData` a mano (ESC/POS directo, movimientos de caja). Los
 * comprobantes de venta (ticket/A4) deben preferir `data.company.logo_size_ticket`/`_a4`
 * (vía `normalizeLogoPrintSize`), que reflejan el snapshot ya resuelto por el backend.
 */
export function readLogoPrintSize(format: LogoPrintFormat): LogoPrintSize {
  const cfg = getCompanyConfigCache()
  return normalizeLogoPrintSize(format === 'ticket' ? cfg?.logo_size_ticket : cfg?.logo_size_a4)
}

/**
 * Escala una medida base del logo según el tamaño ya resuelto y el formato (ticket por
 * defecto). Quien dibuje el logo debe topar el ancho al imprimible del papel.
 */
export function scaleLogoDimension(base: number, size: LogoPrintSize, format: LogoPrintFormat = 'ticket'): number {
  return base * SCALE[format][size]
}
