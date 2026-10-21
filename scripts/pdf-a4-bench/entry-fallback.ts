// Si el diseño elegido lanza una excepción, el PDF sale con el diseño por defecto (y no falla).
import { generateReceiptPdf } from '@/utils/receiptPdf'
import { A4_DESIGNS } from '@/utils/receiptA4'
import { FIXTURES } from './fixtures'

const g = globalThis as Record<string, unknown>
if (!g.localStorage) {
  const m = new Map<string, string>()
  g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() }
}
const out = (d: Awaited<ReturnType<typeof generateReceiptPdf>>) => new Uint8Array(d.output('arraybuffer'))

export async function generate(): Promise<[string, Uint8Array][]> {
  const res: [string, Uint8Array][] = []
  const data = FIXTURES.factura_8_items
  const modern = structuredClone(data)
  modern.company.pdf_a4_design = 'modern'
  res.push(['modern', out(await generateReceiptPdf(modern, 'a4'))])

  const classic = A4_DESIGNS.find((d) => d.slug === 'classic')!
  const original = classic.render
  classic.render = async (doc) => {
    doc.text('dibujo a medias que debe descartarse', 10, 10)
    throw new Error('fallo simulado')
  }
  const broken = structuredClone(data)
  broken.company.pdf_a4_design = 'classic'
  res.push(['classic_roto', out(await generateReceiptPdf(broken, 'a4'))])
  classic.render = original

  const unknown = structuredClone(data)
  unknown.company.pdf_a4_design = 'no_existe'
  res.push(['desconocido', out(await generateReceiptPdf(unknown, 'a4'))])
  return res
}
