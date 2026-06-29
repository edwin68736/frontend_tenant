import type { SeriesRow } from '@/services/company.service'

export type FiscalDocSunatCode = '20' | '40'

export const FISCAL_DOC_SERIES_SETTINGS_PATH = '/company/series'

export function filterSeriesBySunatCode(series: SeriesRow[], code: FiscalDocSunatCode): SeriesRow[] {
  return series.filter((s) => s.sunat_code === code && s.active !== false)
}

export function filterSeriesByCategory(series: SeriesRow[], category: 'retencion' | 'percepcion'): SeriesRow[] {
  return series.filter((s) => s.category === category && s.active !== false)
}

export function fiscalSeriesMissingMessage(code: FiscalDocSunatCode): string {
  return code === '40'
    ? 'Configure una serie de percepción (P###) en Empresa → Series.'
    : 'Configure una serie de retención (R###) en Empresa → Series.'
}

export function hasFiscalSeriesForCode(series: SeriesRow[], code: FiscalDocSunatCode): boolean {
  return filterSeriesBySunatCode(series, code).length > 0
}
