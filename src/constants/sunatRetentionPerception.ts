/** Catálogo 23 — Regímenes de retención (CRE tipo 20). */
export const SUNAT_REGIMEN_RETENCION = [
  { code: '01', label: 'Tasa 3%', tasa: 3 },
] as const

/** Catálogo 22 — Regímenes de percepción (CPE tipo 40). */
export const SUNAT_REGIMEN_PERCEPCION = [
  { code: '01', label: 'Percepción venta interna (2%)', tasa: 2 },
  { code: '02', label: 'Adquisición combustible (1%)', tasa: 1 },
  { code: '03', label: 'Agente percepción tasa especial (0.5%)', tasa: 0.5 },
] as const

/** Tipos de documento relacionado en detalle CRE/CPE (Cat. 01, subset habitual). */
export const SUNAT_DOC_RELACIONADO = [
  { code: '01', label: 'Factura' },
  { code: '03', label: 'Boleta' },
  { code: '07', label: 'Nota de crédito' },
  { code: '08', label: 'Nota de débito' },
  { code: '12', label: 'Ticket' },
] as const

export function tasaForRegimen(
  regimen: string,
  catalog: readonly { code: string; tasa: number }[],
): number {
  return catalog.find((r) => r.code === regimen)?.tasa ?? 0
}
