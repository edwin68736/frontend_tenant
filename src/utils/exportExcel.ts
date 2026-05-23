import { writeXlsx, type CellValue } from 'hucre'

export interface ExportColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: string
  format?: (val: unknown, row: T) => string | number
  /** Si true, Excel recibe el valor numérico en bruto (útil para columnas monetarias). */
  excelNumber?: boolean
}

function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportTableToExcel<T extends object>(
  sheetName: string,
  columns: ExportColumn<T>[],
  data: T[],
  filename?: string
): Promise<void> {
  const headers: CellValue[] = columns.map(c => c.label)
  const body: CellValue[][] = data.map(row =>
    columns.map(col => {
      const raw = row[col.key as keyof T]
      if (col.excelNumber) {
        const n = Number(raw)
        return Number.isFinite(n) ? n : ''
      }
      if (col.format) return col.format(raw, row) as CellValue
      return raw != null ? String(raw) : ''
    })
  )
  const rows: CellValue[][] = [headers, ...body]
  const bytes = await writeXlsx({
    sheets: [{ name: sheetName.slice(0, 31), rows }],
  })
  downloadXlsx(bytes, filename ?? `${sheetName.replace(/\s+/g, '-')}.xlsx`)
}
