import { writeXlsx, type CellValue } from 'hucre'
import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { downloadBlob } from '@/utils/downloadBlob'
import type { AccountingTable } from '@/services/accounting.service'

/** Convierte la tabla del backend a Excel: líneas de encabezado, fila de títulos (salvo no_header), datos y pie. */
export async function downloadAccountingTable(t: AccountingTable, fileName?: string): Promise<void> {
  const rows: CellValue[][] = []
  const pre = t.preamble ?? []
  for (const line of pre) rows.push([line])
  if (pre.length > 0) rows.push([])
  if (!t.no_header) rows.push([...(t.columns ?? [])])
  for (const r of t.rows ?? []) rows.push(r as CellValue[])
  for (const f of t.footer ?? []) rows.push(f as CellValue[])
  const bytes = await writeXlsx({ sheets: [{ name: (t.sheet || 'Hoja1').slice(0, 31), rows }] })
  await downloadXlsxBytes(bytes, fileName ?? t.file_name)
}

/** Descarga un .txt (p. ej. Siscont de ancho fijo) conservando los saltos de línea CRLF. */
export async function downloadAccountingText(text: string, fileName: string): Promise<void> {
  await downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName)
}

/** Excel sencillo a partir de columnas y filas ya armadas en el navegador (resumen, libro mayor, SIRE). */
export async function downloadSimpleSheet(
  sheet: string,
  fileName: string,
  preamble: string[],
  columns: string[],
  rows: CellValue[][],
  footer: CellValue[][] = [],
): Promise<void> {
  await downloadAccountingTable(
    { file_name: fileName, sheet, preamble, columns, rows: rows as AccountingTable['rows'], footer: footer as AccountingTable['footer'] },
    fileName,
  )
}

export const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function errMessage(e: unknown, fallback = 'No se pudo completar la operación'): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : fallback)
}
