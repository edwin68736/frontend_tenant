/** Fallback alineado con backend `pkg/tax.DefaultConfig()` cuando el tenant no tiene tasa. */
export const DEFAULT_TAX_RATE_PERCENT = 18

/** Tasas IGV permitidas (normativa peruana vigente en el sistema). */
export const IGV_RATE_OPTIONS = [
  { value: 18, label: '18% — IGV general' },
  { value: 10.5, label: '10.5% — Ley N° 31659 (restaurantes, hoteles y agencias)' },
] as const

export type IgvRateOption = (typeof IGV_RATE_OPTIONS)[number]['value']

/** Normaliza la tasa guardada al select (solo 18 o 10.5). */
export function normalizeIgvRateForSelect(rate: number | null | undefined): IgvRateOption {
  if (rate === 10.5) return 10.5
  return 18
}

/** Única fuente de verdad en frontend: tasa del tenant o fallback global. */
export function resolveTaxRatePercent(rate: number | null | undefined): number {
  if (rate === 10.5) return 10.5
  if (rate != null && Number.isFinite(rate) && rate > 0) return rate
  return DEFAULT_TAX_RATE_PERCENT
}

export function buildTaxConfigFromSunat(sunat?: {
  tax_rate?: number
  igv_regime?: string
  tax_benefit_zone?: boolean
}) {
  return {
    taxRate: resolveTaxRatePercent(sunat?.tax_rate),
    igvRegime: sunat?.igv_regime ?? 'standard',
    taxBenefitZone: sunat?.tax_benefit_zone ?? false,
  }
}
