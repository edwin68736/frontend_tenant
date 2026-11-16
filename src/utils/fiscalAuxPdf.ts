import { jsPDF } from 'jspdf'
import { loadBranchPrintIdentity } from '@/lib/branchIdentity/store'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { downloadJsPdf } from '@/utils/downloadBlob'
import api from '@/services/api'

/**
 * PDF del comprobante de retención (CRE) y de percepción (CPE), armado en el navegador con lo que se envió a SUNAT
 * (payload congelado en el registro). No usa la plantilla de venta: un CRE/CPE no tiene ítems ni cliente, sino un proveedor
 * (o sujeto percibido) y los comprobantes relacionados con su importe retenido/percibido y neto.
 */
export type FiscalAuxKind = 'retention' | 'perception'

interface AuxParty { tipoDoc?: string; numDoc?: string; rznSocial?: string; address?: { direccion?: string } | null }
interface AuxPay { moneda?: string; importe?: number; fecha?: string }
export interface FiscalAuxDetail {
  tipoDoc: string; numDoc: string; fechaEmision: string; impTotal: number; moneda: string
  pagos?: AuxPay[]; cobros?: AuxPay[]
  fechaRetencion?: string; impRetenido?: number; impPagar?: number
  fechaPercepcion?: string; impPercibido?: number; impCobrar?: number
  tipoCambio?: { factor?: number } | null
}
export interface FiscalAuxPayload {
  serie?: string; correlativo?: string; fechaEmision: string
  company: { ruc?: string; razonSocial?: string; nombreComercial?: string; address?: { direccion?: string } | null }
  proveedor: AuxParty
  regimen?: string; tasa?: number
  impRetenido?: number; impPagado?: number
  impPercibido?: number; impCobrado?: number
  observacion?: string
  details: FiscalAuxDetail[]
}
export interface FiscalAuxPrintData {
  kind: FiscalAuxKind; series: string; correlative: string; status: string; payload: FiscalAuxPayload | null
}

const PAGE_W = 210
const MARGIN = 12
const CW = PAGE_W - 2 * MARGIN
const GRAY: [number, number, number] = [214, 214, 214]

const money = (n: number | undefined) => Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sym = (c?: string) => (c === 'USD' ? 'US$' : 'S/')
const fmtDate = (d?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (d ?? '—')
}
const DOC_TYPES: Record<string, string> = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito', '08': 'Nota de débito', '12': 'Ticket' }
const ID_TYPES: Record<string, string> = { '6': 'RUC', '1': 'DNI', '4': 'C.E.', '7': 'Pasaporte', '0': 'Doc.' }
const STATUS: Record<string, string> = { accepted: 'Aceptado', error: 'Error de envío', rejected: 'Rechazado', pending: 'Pendiente' }

export function fiscalAuxFileName(d: FiscalAuxPrintData): string {
  return `${d.kind === 'retention' ? 'retencion' : 'percepcion'}-${d.series}-${d.correlative}.pdf`
}

export async function fetchFiscalAuxPrintData(kind: FiscalAuxKind, id: number): Promise<FiscalAuxPrintData> {
  const path = kind === 'retention' ? 'retentions' : 'perceptions'
  const r = await api.get(`/api/billing/${path}/${id}/print`)
  return r.data
}

export async function generateFiscalAuxPdf(data: FiscalAuxPrintData): Promise<jsPDF> {
  const p = data.payload
  if (!p) throw new Error('El comprobante no tiene datos guardados para imprimir')
  const isRet = data.kind === 'retention'
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(0, 0, 0)
  }
  // Cabecera: logo | emisor | recuadro
  const top = MARGIN
  const boxW = 62
  const boxX = PAGE_W - MARGIN - boxW
  let logoW = 0
  try {
    const ident = await loadBranchPrintIdentity({ id: undefined, name: '' })
    const asset = ident.logo ? await resolveReceiptLogoForPdf(ident.logo) : null
    if (asset) {
      const { w, h } = fitReceiptLogoMm(asset.naturalW, asset.naturalH, 36, 22)
      doc.addImage(asset.dataUrl, asset.format, MARGIN, top, w, h)
      logoW = 40
    }
  } catch { /* sin logo */ }
  const infoX = MARGIN + logoW
  const infoW = boxX - infoX - 4
  let cy = top + 3
  font(11.5, 'bold')
  for (const l of doc.splitTextToSize((p.company.razonSocial || '—').toUpperCase(), infoW) as string[]) { doc.text(l, infoX, cy); cy += 4.6 }
  font(8)
  const nc = (p.company.nombreComercial || '').trim()
  if (nc && nc.toUpperCase() !== (p.company.razonSocial || '').toUpperCase()) { doc.text(nc.toUpperCase(), infoX, cy); cy += 4.2 }
  const addr = p.company.address?.direccion
  if (addr) for (const l of doc.splitTextToSize(addr, infoW) as string[]) { doc.text(l, infoX, cy); cy += 4.2 }

  const boxH = 30
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.25)
  doc.roundedRect(boxX, top, boxW, boxH, 2, 2)
  font(9, 'bold')
  doc.text(`RUC:  ${p.company.ruc || '—'}`, boxX + boxW / 2, top + 5.5, { align: 'center' })
  doc.setFillColor(...GRAY); doc.rect(boxX, top + 9, boxW, 11, 'F')
  font(10, 'bold')
  doc.text('COMPROBANTE DE', boxX + boxW / 2, top + 13.5, { align: 'center' })
  doc.text(isRet ? 'RETENCIÓN ELECTRÓNICO' : 'PERCEPCIÓN ELECTRÓNICO', boxX + boxW / 2, top + 18.5, { align: 'center' })
  font(12, 'bold')
  doc.text(`${data.series}-${data.correlative}`, boxX + boxW / 2, top + 26.5, { align: 'center' })

  let y = Math.max(cy, top + boxH) + 6
  // Proveedor / datos
  const colW = CW / 2 - 2
  const rightX = MARGIN + colW + 4
  const blockH = 30
  doc.setDrawColor(200, 200, 200)
  doc.roundedRect(MARGIN, y, colW, blockH, 1.5, 1.5)
  doc.roundedRect(rightX, y, colW, blockH, 1.5, 1.5)
  font(8, 'bold')
  doc.text(isRet ? 'PROVEEDOR (RETENIDO)' : 'CLIENTE (PERCIBIDO)', MARGIN + 2, y + 4.5)
  doc.text('DATOS DEL COMPROBANTE', rightX + 2, y + 4.5)
  font(8)
  let sy = y + 9
  const left = (l: string, v: string) => {
    const lines = doc.splitTextToSize(`${l} ${v}`, colW - 4).slice(0, 2) as string[]
    doc.text(lines, MARGIN + 2, sy); sy += lines.length * 4
  }
  left('Razón social:', p.proveedor.rznSocial || '—')
  left(`${ID_TYPES[p.proveedor.tipoDoc ?? ''] ?? 'Documento'}:`, p.proveedor.numDoc || '—')
  if (p.proveedor.address?.direccion) left('Dirección:', p.proveedor.address.direccion)
  sy = y + 9
  const right: [string, string][] = [
    ['Fecha de emisión:', fmtDate(p.fechaEmision)],
    ['Régimen:', `${p.regimen ?? ''}${p.tasa != null ? ` · Tasa ${p.tasa}%` : ''}`],
    ['Moneda:', 'Soles (PEN)'],
    ['Estado SUNAT:', STATUS[data.status] ?? data.status],
  ]
  for (const [l, v] of right) {
    font(8, 'bold'); doc.text(l, rightX + 2, sy)
    font(8); doc.text(v, rightX + 34, sy); sy += 4.2
  }
  y += blockH + 6

  // Tabla de comprobantes relacionados
  const cols = { tipo: MARGIN + 1.5, num: MARGIN + 24, fecha: MARGIN + 62, total: MARGIN + 100, fret: MARGIN + 104, ret: MARGIN + 142, neto: MARGIN + CW - 1.5 }
  const head = () => {
    doc.setFillColor(...GRAY); doc.rect(MARGIN, y, CW, 6.5, 'F')
    font(7.5, 'bold')
    doc.text('TIPO', cols.tipo, y + 4.5)
    doc.text('N° DOCUMENTO', cols.num, y + 4.5)
    doc.text('F. EMISIÓN', cols.fecha, y + 4.5)
    doc.text('IMPORTE', cols.total, y + 4.5, { align: 'right' })
    doc.text(isRet ? 'F. RETENCIÓN' : 'F. PERCEPCIÓN', cols.fret, y + 4.5)
    doc.text(isRet ? 'RETENIDO' : 'PERCIBIDO', cols.ret + 14, y + 4.5, { align: 'right' })
    doc.text(isRet ? 'NETO PAGADO' : 'TOTAL COBRADO', cols.neto, y + 4.5, { align: 'right' })
    y += 10
  }
  head()
  for (const d of p.details) {
    if (y > 255) { doc.addPage(); y = MARGIN; head() }
    font(8)
    const s = sym(d.moneda)
    doc.text(DOC_TYPES[d.tipoDoc] ?? d.tipoDoc, cols.tipo, y)
    doc.text(d.numDoc, cols.num, y)
    doc.text(fmtDate(d.fechaEmision), cols.fecha, y)
    doc.text(`${s} ${money(d.impTotal)}`, cols.total, y, { align: 'right' })
    doc.text(fmtDate(isRet ? d.fechaRetencion : d.fechaPercepcion), cols.fret, y)
    doc.text(money(isRet ? d.impRetenido : d.impPercibido), cols.ret + 14, y, { align: 'right' })
    doc.text(money(isRet ? d.impPagar : d.impCobrar), cols.neto, y, { align: 'right' })
    const pays = (isRet ? d.pagos : d.cobros) ?? []
    y += 4.2
    if (d.tipoCambio?.factor) { font(7); doc.text(`Tipo de cambio: ${d.tipoCambio.factor}`, cols.num, y); y += 3.6 }
    for (const pg of pays) {
      font(7)
      doc.text(`${isRet ? 'Pago' : 'Cobro'} ${fmtDate(pg.fecha)}: ${sym(pg.moneda)} ${money(pg.importe)}`, cols.num, y)
      y += 3.6
    }
    y += 1.5
    doc.setDrawColor(230, 230, 230); doc.line(MARGIN, y - 1.2, MARGIN + CW, y - 1.2)
  }

  // Totales
  y += 4
  const tw = 78
  const tx = MARGIN + CW - tw
  doc.setDrawColor(0, 0, 0); doc.roundedRect(tx, y, tw, 15, 1.5, 1.5)
  font(9, 'bold')
  doc.text(isRet ? 'Total retenido:' : 'Total percibido:', tx + 3, y + 6)
  doc.text(`S/ ${money(isRet ? p.impRetenido : p.impPercibido)}`, tx + tw - 3, y + 6, { align: 'right' })
  doc.text(isRet ? 'Total pagado (neto):' : 'Total cobrado:', tx + 3, y + 12)
  doc.text(`S/ ${money(isRet ? p.impPagado : p.impCobrado)}`, tx + tw - 3, y + 12, { align: 'right' })
  if (p.observacion) { font(8); doc.text(doc.splitTextToSize(`Observación: ${p.observacion}`, CW - tw - 6) as string[], MARGIN, y + 6) }
  font(7)
  doc.setTextColor(110, 110, 110)
  doc.text('Representación impresa del comprobante electrónico. Consulte su validez en el portal de SUNAT.', MARGIN, 287)
  return doc
}

export async function downloadFiscalAuxPdf(data: FiscalAuxPrintData): Promise<void> {
  await downloadJsPdf(await generateFiscalAuxPdf(data), fiscalAuxFileName(data))
}

/** URL de objeto para el visor del panel (el llamador la libera). */
export async function createFiscalAuxPdfObjectUrl(data: FiscalAuxPrintData): Promise<{ url: string; fileName: string }> {
  const doc = await generateFiscalAuxPdf(data)
  return { url: URL.createObjectURL(doc.output('blob')), fileName: fiscalAuxFileName(data) }
}
