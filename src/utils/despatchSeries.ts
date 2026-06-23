export type GuiaSunatCode = '09' | '31'

export type GuiaSeriesRow = {
  id: number
  series: string
  sunat_code?: string
  category?: string
  active?: boolean
  branch_id?: number
}

export const GUIA_SERIES_SETTINGS_PATH = '/company/series'

/** Series activas del tipo SUNAT indicado (09 o 31). Sin fallback a otros tipos. */
export function filterGuiaSeriesBySunatCode(series: GuiaSeriesRow[], code: GuiaSunatCode): GuiaSeriesRow[] {
  return series.filter((s) => s.sunat_code === code && s.active !== false)
}

/** Todas las series de guía (09 y 31) activas. */
export function filterAllGuiaSeries(series: GuiaSeriesRow[]): GuiaSeriesRow[] {
  return series.filter((s) => (s.sunat_code === '09' || s.sunat_code === '31') && s.active !== false)
}

export function guiaSeriesMissingMessage(code: GuiaSunatCode): string {
  return code === '31'
    ? 'Debe configurar una serie para Guía de Remisión Transportista (31).'
    : 'Debe configurar una serie para Guía de Remisión Remitente (09).'
}

export function hasGuiaSeriesForCode(series: GuiaSeriesRow[], code: GuiaSunatCode): boolean {
  return filterGuiaSeriesBySunatCode(series, code).length > 0
}
