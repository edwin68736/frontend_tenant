import type { jsPDF } from 'jspdf'
import type { PrintData } from '@/types/printData'
import { renderClassicA4 } from './classic'
import { renderModernA4 } from './modern'

/**
 * Registro de diseños del PDF A4 de comprobantes. Un diseño es solo presentación: recibe el mismo
 * PrintData y dibuja la hoja. Para agregar uno nuevo: crear su archivo, registrarlo aquí y nada más.
 * Los `slug` se guardan en BD (a futuro): no se renombran nunca.
 */
export type A4Design = {
  slug: string
  label: string
  description: string
  render: (doc: jsPDF, data: PrintData) => Promise<void>
}

export const DEFAULT_A4_DESIGN = 'modern'

export const A4_DESIGNS: A4Design[] = [
  {
    slug: 'modern',
    label: 'Moderno',
    description: 'Tipografía sans-serif, datos del cliente y del comprobante en recuadros, totales en celdas.',
    render: renderModernA4,
  },
  {
    slug: 'classic',
    label: 'Clásico',
    description: 'Tipografía serif, banner gris con el tipo de comprobante, datos del cliente sin recuadros.',
    render: renderClassicA4,
  },
]

/** Devuelve el diseño del slug, o el diseño por defecto si es desconocido o está vacío. */
export function getA4Design(slug?: string | null): A4Design {
  const key = String(slug ?? '').trim().toLowerCase()
  return A4_DESIGNS.find((d) => d.slug === key) ?? A4_DESIGNS.find((d) => d.slug === DEFAULT_A4_DESIGN)!
}
