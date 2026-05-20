import * as XLSX from 'xlsx'

export interface ExportColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: string
  format?: (val: unknown, row: T) => string | number
  /** Si true, Excel recibe el valor numérico en bruto (útil para columnas monetarias). */
  excelNumber?: boolean
}

export function exportTableToExcel<T extends object>(
  sheetName: string,
  columns: ExportColumn<T>[],
  data: T[],
  filename?: string
): void {
  const headers = columns.map(c => c.label)
  const rows = data.map(row =>
    columns.map(col => {
      const raw = row[col.key as keyof T]
      if (col.excelNumber) {
        const n = Number(raw)
        return Number.isFinite(n) ? n : ''
      }
      if (col.format) return col.format(raw, row)
      return raw != null ? String(raw) : ''
    })
  )
  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename ?? `${sheetName.replace(/\s+/g, '-')}.xlsx`)
}
