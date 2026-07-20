/** Tamaño del logo en comprobantes (ESC/POS y PDF). Ajuste local del dispositivo. */
export type LogoPrintSize = 'pequeno' | 'mediano' | 'grande'

const STORAGE_KEY = 'tukifac_logo_print_size_v1'

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

export function readLogoPrintSize(): LogoPrintSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'pequeno' || raw === 'mediano' || raw === 'grande') return raw
  } catch {
    /* noop */
  }
  return DEFAULT_LOGO_PRINT_SIZE
}

export function saveLogoPrintSize(size: LogoPrintSize) {
  try {
    localStorage.setItem(STORAGE_KEY, size)
  } catch {
    /* quota */
  }
}

/** Escala una medida base del logo según el ajuste guardado. */
export function scaleLogoDimension(base: number): number {
  return base * SCALE[readLogoPrintSize()]
}
