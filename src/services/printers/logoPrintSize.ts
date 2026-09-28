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
  { value: 'pequeno', label: 'Pequeño', hint: 'Ocupa menos papel.' },
  { value: 'mediano', label: 'Mediano', hint: 'Tamaño recomendado.' },
  { value: 'grande', label: 'Grande', hint: 'Más visible en el comprobante.' },
]

/**
 * Factor aplicado al tamaño base del logo. «mediano» es 1 a propósito: los tamaños base de
 * los renderers son el mediano, así que quien no toque el ajuste imprime igual que siempre.
 */
const SCALE: Record<LogoPrintSize, number> = {
  pequeno: 0.7,
  mediano: 1,
  grande: 1.35,
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

/** Escala una medida base del logo según el tamaño ya resuelto. */
export function scaleLogoDimension(base: number, size: LogoPrintSize): number {
  return base * SCALE[size]
}
