import { getAfectacionGroup } from '@/utils/taxCalc'
import type { PrintAffectTotal } from '@/types/printData'

/** Catálogo SUNAT N°07 — etiquetas de referencia. */
export const SUNAT_IGV_AFFECTATION_LABELS: Record<string, string> = {
  '10': 'Gravado – Op. Onerosa',
  '11': 'Gravado – Retiro por premio',
  '12': 'Gravado – Retiro por donación',
  '13': 'Gravado – Retiro',
  '14': 'Gravado – Retiro por publicidad',
  '15': 'Gravado – Bonificaciones',
  '16': 'Gravado – Retiro por trabajadores',
  '17': 'Gravado – IVAP',
  '20': 'Exonerado',
  '30': 'Inafecto',
  '40': 'Exportación',
}

/** Opciones del formulario de producto (catálogo + bonificaciones gravadas). */
export const PRODUCT_IGV_AFFECTATION_OPTIONS = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '15', label: '15 - Gravado – Bonificaciones' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
] 

/** POS / ventas: producto manual sin exportación. */
export const POS_MANUAL_IGV_OPTIONS = [
  { value: '10', label: '10 - Gravado IGV' },
  { value: '15', label: '15 - Gravado – Bonificaciones' },
  { value: '20', label: '20 - Exonerado' },
  { value: '30', label: '30 - Inafecto' },
] 

export function isGravadoIgv(code: string): boolean {
  return getAfectacionGroup(code) === 'gravado'
}

/** Catálogo N°07 código 15: bonificación gravada — no se cobra al cliente. */
export function isBonificacionGravada(code: string): boolean {
  return String(code || '').trim() === '15'
}

/** Gravado en operaciones no onerosas (cat. N°07: 11–16). Legacy: free=true, total línea=0 en PDF. */
export function isGravadoOperacionNoOnerosa(code: string): boolean {
  switch (String(code || '').trim()) {
    case '11':
    case '12':
    case '13':
    case '14':
    case '15':
    case '16':
      return true
    default:
      return false
  }
}

export function igvAffectationLabel(code: string): string {
  const c = String(code || '10').trim()
  return SUNAT_IGV_AFFECTATION_LABELS[c] ?? c
}

/** Suma filas de totals_by_affectation por grupo SUNAT (p. ej. 10 y 15 → gravado). */
export function sumAffectationByGroup(
  aff: Record<string, PrintAffectTotal | undefined> | undefined,
  group: 'gravado' | 'exonerado' | 'inafecto' | 'exportacion',
): PrintAffectTotal | null {
  if (!aff) return null
  let subtotal = 0
  let tax_amount = 0
  let total = 0
  let found = false
  for (const [code, row] of Object.entries(aff)) {
    if (!row || getAfectacionGroup(code) !== group) continue
    found = true
    subtotal += row.subtotal ?? 0
    tax_amount += row.tax_amount ?? 0
    total += row.total ?? 0
  }
  if (!found) return null
  return {
    code: group,
    description: group,
    subtotal,
    tax_amount,
    total,
  }
}
