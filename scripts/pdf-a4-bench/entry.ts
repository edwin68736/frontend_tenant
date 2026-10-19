import { generateReceiptPdf } from '@/utils/receiptPdf'
import { FIXTURES } from './fixtures'

// Entorno mínimo para que el código del navegador corra en Node.
const g = globalThis as Record<string, unknown>
if (!g.localStorage) {
  const m = new Map<string, string>()
  g.localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

/** designs: lista de slugs, o [null] = diseño por defecto (sin fijar el campo). */
export async function generate(designs: (string | null)[]): Promise<[string, Uint8Array][]> {
  const res: [string, Uint8Array][] = []
  for (const d of designs) {
    for (const [name, data] of Object.entries(FIXTURES)) {
      const pd = structuredClone(data)
      if (d) (pd.company as { pdf_a4_design?: string }).pdf_a4_design = d
      const doc = await generateReceiptPdf(pd, 'a4')
      res.push([d ? `${d}__${name}` : name, new Uint8Array(doc.output('arraybuffer'))])
    }
  }
  return res
}
