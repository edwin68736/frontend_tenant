import { normalizeTextForTicketPrint } from '@/utils/normalizeTextForTicketPrint'

export function trimCompanyAdditionalNotes(notes?: string | null): string | null {
  const t = String(notes ?? '').trim()
  return t || null
}

/** Líneas para ticket: respeta saltos de línea del textarea y ancho en columnas. */
export function wrapCompanyAdditionalNotes(
  notes: string,
  cols: number,
  wrapLine: (text: string, width: number) => string[],
): string[] {
  const norm = normalizeTextForTicketPrint(notes)
  const out: string[] = []
  for (const part of norm.split(/\n/)) {
    const p = part.trim()
    if (!p) continue
    for (const line of wrapLine(p, cols)) {
      if (line.trim()) out.push(line)
    }
  }
  return out
}
