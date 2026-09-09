import { jsPDF } from 'jspdf'
import { getCompanyConfigCache, getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { scaleLogoDimension } from '@/services/printers/logoPrintSize'
import {
  normalizeTicketPaperWidth,
  ticketMarginMm,
  ticketPageWidthMm,
  ticketTopPaddingMm,
  type TicketPaperWidthMm,
} from '@/utils/receiptTicketPaper'
import { categoryLabel } from '@/utils/cashMovementCategories'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { downloadJsPdf } from '@/utils/downloadBlob'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'

/** Alto de "hoja de rollo" holgado; se recorta al contenido real al final (igual que
 *  receiptPdf.ts) para no dejar un PDF con medio metro de página en blanco. */
const TICKET_PAGE_HEIGHT = 300

/** Forma mínima que necesita este generador — deliberadamente más chica que `CashMovement`
 *  (services/cashbank.service.ts) para que también la satisfaga, sin adaptar campos, una fila
 *  del reporte histórico multi-sesión (`MovementReportRow`) mapeada por quien llama: el
 *  histórico de Ingresos/Egresos (CashMovementTypeView.tsx) usa esta misma función tanto para
 *  movimientos de MI caja abierta como para movimientos ya cerrados. */
export interface CashMovementReceiptInput {
  id: number
  type: 'income' | 'expense'
  category: string
  reference?: string
  payment_method?: string
  notes?: string
  amount: number
  created_at: string
}

/** Datos de contexto que NO viven en el movimiento (pertenecen a la sesión/usuario) — quien
 *  llama a este generador ya los tiene a mano, así que se pasan explícitos en vez de volver a
 *  pedirlos aquí. */
export interface CashMovementReceiptContext {
  sessionId: number
  cashierName?: string
  branchName?: string
}

function money(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

/**
 * PDF ticket (comprobante interno, NO fiscal) de un movimiento MANUAL de caja — ingreso o
 * egreso registrado a mano, o un egreso ligado a una compra (que no tiene su propio ticket
 * SUNAT como sí lo tienen las ventas — ver `localReceiptPdf.ts` para esas). Deliberadamente
 * simple: no reemplaza la representación impresa de un comprobante electrónico.
 */
export async function generateCashMovementReceiptPdf(
  movement: CashMovementReceiptInput,
  ctx: CashMovementReceiptContext,
  paperWidthMm?: TicketPaperWidthMm,
): Promise<jsPDF> {
  const paperMm = normalizeTicketPaperWidth(paperWidthMm)
  const pageW = ticketPageWidthMm(paperMm)
  const margin = ticketMarginMm(paperMm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageW, TICKET_PAGE_HEIGHT],
    compress: false,
  })

  const innerW = pageW - 2 * margin
  const lineH = 4.5
  let y = margin + ticketTopPaddingMm(paperMm)

  const center = (text: string, size: number, bold = false) => {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, innerW)
    for (const line of lines) {
      doc.text(line, pageW / 2, y, { align: 'center' })
      y += lineH
    }
  }

  const wrapped = (text: string, size = 8) => {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, innerW)
    for (const line of lines) {
      doc.text(line, margin, y)
      y += lineH
    }
  }

  const row = (label: string, value: string, size = 8.5) => {
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(size)
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    const labelW = doc.getTextWidth(`${label} `)
    const valueLines = doc.splitTextToSize(value, innerW - labelW)
    doc.text(valueLines[0] ?? '', margin + labelW, y)
    y += lineH
    for (let i = 1; i < valueLines.length; i++) {
      doc.text(valueLines[i], margin, y)
      y += lineH
    }
  }

  const dashRow = () => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += lineH * 0.9
  }

  const space = (h = 2) => {
    y += h
  }

  // Encabezado empresa (misma fuente de datos que los comprobantes de venta: config cacheada
  // al iniciar sesión — sin llamadas a red aquí).
  const cfg = getCompanyConfigCache()
  const companyLogo = getCompanyLogoForPrint()
  if (companyLogo) {
    try {
      const logo = await resolveReceiptLogoForPdf(companyLogo)
      if (logo) {
        const maxW = Math.min(scaleLogoDimension(paperMm === 58 ? 26 : 30), innerW)
        const maxH = scaleLogoDimension(paperMm === 58 ? 9 : 11)
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, maxW, maxH)
        doc.addImage(logo.dataUrl, logo.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
        y += h + 3
      }
    } catch {
      // continuar sin logo
    }
  }

  const tradeName = String(cfg?.trade_name ?? '').trim()
  const businessName = String(cfg?.business_name ?? '').trim()
  if (tradeName) {
    center(tradeName, 12, true)
    if (businessName && businessName.localeCompare(tradeName, undefined, { sensitivity: 'accent' }) !== 0) {
      center(businessName, 8)
    }
  } else if (businessName) {
    center(businessName, 11, true)
  }
  if (cfg?.ruc) center(`RUC ${cfg.ruc}`, 8)
  if (cfg?.address) center(cfg.address, 7.5)
  space(2)

  const isIncome = movement.type === 'income'
  center(isIncome ? 'COMPROBANTE DE INGRESO DE CAJA' : 'COMPROBANTE DE EGRESO DE CAJA', 9.5, true)
  center('Documento interno — no es comprobante de pago SUNAT', 7)
  space(2)
  dashRow()
  space(1)

  row('Fecha:', new Date(movement.created_at).toLocaleString())
  row('Sesión de caja:', `#${ctx.sessionId}`)
  if (ctx.branchName) row('Sucursal:', ctx.branchName)
  if (ctx.cashierName) row('Cajero:', ctx.cashierName)
  row('Categoría:', categoryLabel(movement.category) || movement.category || '—')
  row('Referencia:', movement.reference || 'Sin referencia')
  row('Método de pago:', formatPaymentMethodLabel(movement.payment_method))
  if (movement.notes) {
    space(1)
    wrapped(`Notas: ${movement.notes}`, 8)
  }

  space(2)
  dashRow()
  space(1.5)
  center(isIncome ? 'MONTO INGRESADO' : 'MONTO RETIRADO', 8)
  center(money(Number(movement.amount)), 15, true)
  space(2)
  dashRow()
  space(2)
  center(`${TUKIFAC_APP_NAME} - Sistema POS`, 7)

  // Recorta el alto de rollo "de sobra" al contenido real dibujado (mismo truco que
  // receiptPdf.ts: mover el borde INFERIOR del mediaBox, nunca el superior).
  const finalHeight = Math.max(y + margin, margin * 4)
  const mediaBox = doc.getPageInfo(1).pageContext.mediaBox
  mediaBox.bottomLeftY = mediaBox.topRightY - finalHeight * doc.internal.scaleFactor

  return doc
}

function movementReceiptFileName(movement: CashMovementReceiptInput): string {
  const kind = movement.type === 'income' ? 'ingreso' : 'egreso'
  return `${kind}-caja-${movement.id}.pdf`
}

export async function downloadCashMovementReceiptPdf(
  movement: CashMovementReceiptInput,
  ctx: CashMovementReceiptContext,
  paperWidthMm?: TicketPaperWidthMm,
): Promise<void> {
  const doc = await generateCashMovementReceiptPdf(movement, ctx, paperWidthMm)
  await downloadJsPdf(doc, movementReceiptFileName(movement))
}

/** Muestra el ticket en el visor de PDF global de la app (mismo visor que usan los
 *  comprobantes de venta — ver pdfViewerStore.ts). */
export async function openCashMovementReceiptPdfViewer(
  movement: CashMovementReceiptInput,
  ctx: CashMovementReceiptContext,
  paperWidthMm?: TicketPaperWidthMm,
): Promise<void> {
  const doc = await generateCashMovementReceiptPdf(movement, ctx, paperWidthMm)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const fileName = movementReceiptFileName(movement)
  openPdfViewer({
    url,
    title: movement.type === 'income' ? 'Comprobante de ingreso' : 'Comprobante de egreso',
    fileName,
    onClose: () => URL.revokeObjectURL(url),
  })
}
