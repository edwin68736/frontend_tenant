import type { SeriesDocumentType, SeriesRow } from '@/services/company.service'

/** Etiqueta UI unificada (no confundir con códigos oficiales SUNAT en comprobantes electrónicos). */
export const DOCUMENT_CODE_LABEL = 'Código documental'

export const SERIES_FORM_COPY = {
  documentCodeLabel: DOCUMENT_CODE_LABEL,
  documentTypeLabel: 'Tipo de documento',
  seriesLabel: 'Serie',
  correlativeLabel: 'Correlativo actual',
  activeLabel: 'Serie activa',
  noSunatBanner:
    'Sin facturación electrónica: puede crear series de nota de venta, cotización e inventario (no se envían a SUNAT).',
  lockedFallback:
    'Esta serie ya está en uso. Solo puede cambiar el estado activo; serie, tipo y correlativo están bloqueados.',
  ncSeriesHint:
    'Nota de crédito: use FC## para anular facturas (ej. FC01) y BC## para anular boletas (ej. BC01).',
  inventorySeriesHint:
    'Defina una serie de ingreso y otra de egreso por sucursal (ej. ING001 en Principal, ING002 en Sucursal 2). El código no puede repetirse dentro de la misma sucursal.',
  cotizacionSeriesHint:
    'Una serie por sucursal (ej. COT001). Las cotizaciones no se envían a SUNAT; solo numeran documentos comerciales internos.',
  prefixHint: 'Prefijo sugerido',
} as const

export type SeriesFormState = {
  branch_id: number
  doc_type_id: string
  series: string
  current_number: number
  active: boolean
}

export const emptySeriesForm = (branchId = 0, docTypeId = 'nota_venta'): SeriesFormState => ({
  branch_id: branchId,
  doc_type_id: docTypeId,
  series: '',
  current_number: 1,
  active: true,
})

export function normalizeDocKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
}

export function resolveSeriesDocumentTypeId(
  catalog: SeriesDocumentType[],
  row: Pick<SeriesRow, 'doc_type' | 'sunat_code' | 'category'>,
): string | null {
  const key = normalizeDocKey(row.doc_type)
  const byDoc = catalog.find((t) => normalizeDocKey(t.doc_type) === key || normalizeDocKey(t.label) === key)
  if (byDoc) return byDoc.id
  const docCode = (row.sunat_code ?? '').trim()
  const byMeta = catalog.find((t) => t.document_code === docCode && t.category === (row.category ?? 'venta'))
  return byMeta?.id ?? null
}

export function isValidNotaCreditoSeries(code: string): boolean {
  return /^(FC|BC)\d{2}$/i.test(code.trim())
}

export function normalizeSeriesRows(list: SeriesRow[], branches: { id: number; name: string }[]): SeriesRow[] {
  return (list ?? []).map((s) => ({
    ...s,
    current_number: s.current_number ?? s.correlative ?? 0,
    branch_name: s.branch_name ?? branches.find((b) => b.id === s.branch_id)?.name,
    category: s.category ?? 'venta',
    locked: s.locked === true,
    can_delete: s.can_delete !== false && s.locked !== true,
  }))
}

export function buildSeriesFilterCategories(
  categoryLabels: Record<string, string>,
  series: SeriesRow[],
): string[] {
  const keys = new Set<string>()
  Object.keys(categoryLabels).forEach((k) => keys.add(k))
  series.forEach((s) => {
    if (s.category) keys.add(s.category)
  })
  return ['', ...Array.from(keys).sort()]
}

export function categoryLabel(categoryLabels: Record<string, string>, category: string): string {
  return categoryLabels[category] ?? category
}

/** Series editables sin facturación electrónica (documentos que no se envían a SUNAT). */
export function isInternalDocumentOnlySeries(row: Pick<SeriesRow, 'sunat_code' | 'category'>): boolean {
  const code = (row.sunat_code ?? '').trim()
  const category = (row.category ?? '').trim().toLowerCase()
  return code === '00' || code === 'QT' || category === 'cotizacion'
}

export function formatDocumentCode(row: Pick<SeriesRow, 'sunat_code'>): string {
  return (row.sunat_code ?? '—').trim() || '—'
}

export function groupSeriesByBranch(series: SeriesRow[], branches: { id: number; name: string }[]) {
  return branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    items: series.filter((s) => s.branch_id === b.id),
  }))
}
