import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import { downloadJsPdf } from '@/utils/downloadBlob'

export interface BarcodeLabelProduct {
  code: string
  name: string
}

const PAGE_W = 210
const PAGE_H = 297
const COLS = 3
const ROWS = 8
const GAP = 2
const MARGIN_X = 10
const LABEL_W = (PAGE_W - 2 * MARGIN_X - (COLS - 1) * GAP) / COLS
const LABEL_H = 32
const GRID_H = ROWS * LABEL_H + (ROWS - 1) * GAP
const MARGIN_Y = Math.max(8, (PAGE_H - GRID_H) / 2)

/** Code128 soporta código alfanumérico (guiones, letras) — a diferencia de EAN13, que exige
 * exactamente 13 dígitos numéricos y no sirve para códigos como "TC-1468" o "MANUAL". */
function renderBarcodeDataUrl(code: string): string | null {
  const canvas = document.createElement('canvas')
  try {
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 2,
      height: 45,
      displayValue: true,
      fontSize: 16,
      margin: 4,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Genera un PDF A4 con una grilla de etiquetas (código de barras + nombre) de los productos
 * dados, para imprimir y pegar en el producto físico. Grilla genérica de 3x8 (24 por hoja) — no
 * está pensada para una hoja de stickers comercial específica, se imprime y se recorta.
 */
export async function exportProductBarcodesToPdf(products: BarcodeLabelProduct[]): Promise<{ skipped: string[] }> {
  const withCode = products.filter((p) => p.code?.trim())
  const skipped = products.filter((p) => !p.code?.trim()).map((p) => p.name)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const perPage = COLS * ROWS

  if (withCode.length === 0) {
    doc.setFontSize(12)
    doc.text('Ningún producto seleccionado tiene código para generar su código de barras.', MARGIN_X, MARGIN_Y)
  }

  withCode.forEach((p, idx) => {
    const posInPage = idx % perPage
    if (idx > 0 && posInPage === 0) doc.addPage('a4', 'portrait')
    const col = posInPage % COLS
    const row = Math.floor(posInPage / COLS)
    const x = MARGIN_X + col * (LABEL_W + GAP)
    const y = MARGIN_Y + row * (LABEL_H + GAP)

    doc.setDrawColor(210)
    doc.rect(x, y, LABEL_W, LABEL_H)

    doc.setFontSize(7)
    doc.setFont(undefined as unknown as string, 'bold')
    const nameLine = doc.splitTextToSize(p.name, LABEL_W - 4)[0] ?? ''
    doc.text(nameLine, x + LABEL_W / 2, y + 4, { align: 'center' })

    const barcodeUrl = renderBarcodeDataUrl(p.code.trim())
    if (barcodeUrl) {
      doc.addImage(barcodeUrl, 'PNG', x + 3, y + 6, LABEL_W - 6, LABEL_H - 10)
    } else {
      doc.setFontSize(8)
      doc.setFont(undefined as unknown as string, 'normal')
      doc.text(p.code, x + LABEL_W / 2, y + LABEL_H / 2, { align: 'center' })
    }
  })

  await downloadJsPdf(doc, `codigos-barras-${Date.now()}.pdf`)
  return { skipped }
}
