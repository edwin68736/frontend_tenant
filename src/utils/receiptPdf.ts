import { jsPDF, GState } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
import { downloadBlob } from '@/utils/downloadBlob'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { isElectronicSunatCode } from '@/constants/sunat'
import {
  prepaymentDeductionDescription,
  receiptDocTypeTitle,
} from '@/utils/fiscalPrepayment'
import { buildReceiptTotalLines, formatReceiptTotalAmount, resolvePrintChangeAmount } from '@/utils/receiptTotals'
import {
  receiptItemDisplayDescription,
  receiptItemDisplayTotal,
  receiptItemDisplayUnitPrice,
} from '@/utils/receiptBonificacion'
import { ticketColumnLayoutMm } from '@/utils/receiptTicketLayout'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import {
  normalizeTicketPaperWidth,
  ticketMarginMm,
  ticketPageWidthMm,
  ticketTopPaddingMm,
} from '@/utils/receiptTicketPaper'
import { bankAccountTextLines, renderTicketPaymentAndSunatQrRow } from '@/utils/receiptTicketFooter'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'
import { renderReceiptA4 } from '@/utils/receiptPdfA4'
import { getNotaVentaPrintLayout } from '@/services/printers/notaVentaPrintLayout'

const FONT_SIZE = 10
const FONT_SIZE_SM = 8
/** Nombre comercial en ticket: un poco más grande que razón social. */
const FONT_SIZE_COMMERCIAL = 13
/** Cuerpo ticket: 10pt para impresión nítida desde visor PDF del navegador. */
const FONT_SIZE_TICKET_BODY = 10
const FONT_SIZE_TITLE = 13
const MARGIN = 15
/** Alto de página ticket (mm); rollo largo para ítems con descripción multilínea */
const TICKET_PAGE_HEIGHT = 520
const A4_WIDTH = 210
const A4_HEIGHT = 297

function formatDocNumber(data: PrintData): string {
  const n = String(data.number ?? '').trim()
  if (n.includes('-')) return n
  const s = String(data.series ?? '').trim()
  if (s && n) return `${s}-${n}`
  return n || s
}

function isNonElectronicDoc(code?: string): boolean {
  const c = String(code ?? '').trim()
  return c === '00' || c === 'QT'
}

async function qrDataUrlForPrint(sizeMm: number, payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: rasterPxForMm(sizeMm),
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

function formatMoney(n: number, currency = 'PEN'): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym} ${n.toFixed(2)}`
}

function renderFiscalHeaderLines(
  data: PrintData,
  emitLine: (text: string, size?: number) => void,
) {
  const f = data.fiscal
  if (!f) return
  if (f.purchase_order_number) {
    emitLine(`O/C: ${f.purchase_order_number}`, FONT_SIZE_SM)
  }
  if (f.guias?.length) {
    for (const g of f.guias) {
      const label = g.kind === 'guia_transportista' ? 'Guía transp.' : 'Guía rem.'
      emitLine(`${label}: ${g.number}`, FONT_SIZE_SM)
    }
  }
  if (f.fiscal_observations) {
    emitLine(`Obs.: ${f.fiscal_observations}`, FONT_SIZE_SM)
  }
  if (f.prepayment_deductions?.length) {
    for (const p of f.prepayment_deductions) {
      emitLine(prepaymentDeductionDescription(p.related_doc_type, p.document_number), FONT_SIZE_SM)
    }
  }
  if (data.seller_name) {
    emitLine(`Vendedor: ${data.seller_name}`, FONT_SIZE_SM)
  }
}

function renderFiscalTotals(
  data: PrintData,
  emitAmountRow: (label: string, amount: string, opts?: { bold?: boolean }) => void,
) {
  const f = data.fiscal
  if (!f) return
  if (f.retention_applied) {
    emitAmountRow('RET. IGV (3%):', formatMoney(f.igv_retention_amount ?? 0, data.currency))
    emitAmountRow('NETO A COBRAR:', formatMoney(f.net_collectible ?? data.total, data.currency), {
      bold: true,
    })
  }
  if (f.has_detraccion) {
    const pct = f.detraccion_rate_percent ?? 0
    emitAmountRow(`DETRACCIÓN (${pct}%):`, formatMoney(f.detraccion_amount ?? 0, 'PEN'))
    if (f.detraccion_bank_account) {
      emitAmountRow('CTA. BN:', f.detraccion_bank_account)
    }
    emitAmountRow('NETO A COBRAR:', formatMoney(f.detraccion_net_payable ?? data.total, data.currency), {
      bold: true,
    })
  }
  if (f.has_prepayment_emit) {
    emitAmountRow('ANTICIPO:', f.prepayment_label ?? 'COMPROBANTE DE ANTICIPO', { bold: true })
  }
}

function renderFiscalFooter(
  data: PrintData,
  addWrapped: (text: string, size?: number) => void,
  addSpace: (h?: number) => void,
) {
  const f = data.fiscal
  if (!f?.show_terms_conditions || !f.terms_text?.trim()) return
  addSpace(2)
  addWrapped('Términos y condiciones:', FONT_SIZE_SM)
  addWrapped(f.terms_text.trim(), FONT_SIZE_SM)
}

export type ReceiptPdfOptions = {
  paperWidthMm?: 58 | 80
  /** Marca de agua diagonal "Previsualizacion" (solo vista previa, no comprobante guardado). */
  preview?: boolean
}

function applyPreviewWatermark(doc: jsPDF, pageW: number, contentHeightMm?: number) {
  const pageCount = doc.getNumberOfPages()
  const isTicket = pageW <= 80
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    const pageH = doc.internal.pageSize.getHeight()
    const centerY =
      contentHeightMm != null && contentHeightMm > 0
        ? Math.min(contentHeightMm / 2, pageH / 2)
        : pageH / 2
    doc.saveGraphicsState()
    doc.setGState(new GState({ opacity: 0.22 }))
    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isTicket ? 18 : 48)
    doc.text('Previsualizacion', pageW / 2, centerY, {
      align: 'center',
      baseline: 'middle',
      angle: 45,
    })
    doc.restoreGraphicsState()
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
  }
}

export async function generateReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<jsPDF> {
  const isTicket = format === 'ticket'
  const paperMm = normalizeTicketPaperWidth(options?.paperWidthMm)
  const nvLayout = getNotaVentaPrintLayout(data.sunat_code)
  const showPayAndBank = !nvLayout || nvLayout.showBankAccountsAndPaymentCondition
  const pageW = isTicket ? ticketPageWidthMm(paperMm) : A4_WIDTH
  const margin = isTicket ? ticketMarginMm(paperMm) : MARGIN
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isTicket ? [pageW, TICKET_PAGE_HEIGHT] : 'a4',
    compress: false,
  })

  let y = margin + (isTicket ? ticketTopPaddingMm(paperMm) : 0)
  const lineH = 5
  const colW = (pageW - 2 * margin) / 2

  const addLine = (text: string, opts?: { size?: number; align?: 'left' | 'center' | 'right' }) => {
    const size = opts?.size ?? FONT_SIZE
    doc.setFontSize(size)
    const align = opts?.align ?? 'left'
    if (align === 'center') {
      doc.text(text, pageW / 2, y, { align: 'center' })
    } else if (align === 'right') {
      doc.text(text, pageW - margin, y, { align: 'right' })
    } else {
      doc.text(text, margin, y)
    }
    y += lineH
  }

  const addSpace = (h = 3) => {
    y += h
  }

  if (isTicket) {
    // === FORMATO TICKET (80mm) ===
    const innerW = pageW - 2 * margin
    const ticketLineH = 4.5
    /** Helvetica 10pt + negro puro: mejor nitidez al imprimir ticket desde PDF. */
    const ticketDetailFontPt = FONT_SIZE_TICKET_BODY
    const lay = ticketColumnLayoutMm({
      pageW,
      margin,
      gapMm: paperMm === 58 ? 0.35 : 0.5,
      wMoneyMm: paperMm === 58 ? 14 : 15,
    })

    const setTicketDetailFont = (bold = false) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(ticketDetailFontPt)
    }

    const addTicketWrapped = (text: string, size = FONT_SIZE_TICKET_BODY) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, margin, y)
        y += ticketLineH
      }
    }

    const addTicketLineCenter = (text: string, size?: number) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size ?? FONT_SIZE)
      doc.text(text, pageW / 2, y, { align: 'center' })
      y += ticketLineH + (size && size >= FONT_SIZE_TITLE ? 0.8 : 0)
    }

    /** Texto centrado con salto de línea (razón social larga, etc.) */
    const addTicketWrappedCenter = (text: string, size: number, bold = false) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }

    // Logo (alta resolución para impresión)
    addSpace(3)
    const showLogo = !nvLayout || nvLayout.showLogo
    if (showLogo && data.company.logo_url) {
      try {
        const logo = await resolveReceiptLogoForPdf(data.company.logo_url)
        if (logo) {
          const maxW = Math.min(paperMm === 58 ? 28 : 32, innerW)
          const maxH = paperMm === 58 ? 10 : 12
          const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, maxW, maxH)
          doc.addImage(logo.dataUrl, logo.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
          y += h + 5
        }
      } catch {
        // continuar sin logo
      }
    }

    // Encabezado empresa: nombre comercial destacado, razón social debajo
    const tradeName = String(data.company.trade_name ?? '').trim()
    const businessName = String(data.company.business_name ?? '').trim()
    const showBusinessName =
      Boolean(businessName) &&
      businessName.localeCompare(tradeName, undefined, { sensitivity: 'accent' }) !== 0
    if (tradeName) {
      addTicketWrappedCenter(tradeName, FONT_SIZE_COMMERCIAL, true)
      if (showBusinessName) addTicketWrappedCenter(businessName, FONT_SIZE)
    } else if (businessName) {
      addTicketWrappedCenter(businessName, FONT_SIZE_TITLE)
    }
    addTicketLineCenter(`RUC ${data.company.ruc}`, FONT_SIZE_TICKET_BODY)
    const issuerAddressTicket = getPrintIssuerAddress(data)
    if (issuerAddressTicket) {
      doc.setFontSize(FONT_SIZE_SM)
      const addrLines = doc.splitTextToSize(issuerAddressTicket, innerW)
      for (const line of addrLines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }
    const showContact = !nvLayout || nvLayout.showEmailAndPhone
    if (showContact && data.company.phone) addTicketWrapped(`Telf: ${data.company.phone}`, FONT_SIZE_SM)
    if (showContact && data.company.email) addTicketWrapped(`Email: ${data.company.email}`, FONT_SIZE_SM)
    const extraNotes = trimCompanyAdditionalNotes(data.company.additional_notes)
    if (extraNotes) {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FONT_SIZE_SM)
      const noteLines = doc.splitTextToSize(extraNotes, innerW)
      for (const line of noteLines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }
    if (data.company.website) addTicketWrapped(`Web: ${data.company.website}`, FONT_SIZE_SM)
    addSpace(2)

    // Título comprobante
    if (!nvLayout || nvLayout.showDocTypeAndNumber) {
      addTicketLineCenter(`R.U.C. ${data.company.ruc}`, FONT_SIZE_SM)
      addTicketLineCenter(receiptDocTypeTitle(data.sunat_code, data.fiscal), FONT_SIZE)
      doc.setFontSize(FONT_SIZE_TITLE)
      doc.text(formatDocNumber(data), pageW / 2, y, { align: 'center' })
      y += ticketLineH + 2
      addSpace(2)
    }

    // Datos cabecera
    addTicketWrapped(`Fecha Emisión: ${data.issue_date}`, FONT_SIZE_SM)
    if (data.issue_time) addTicketWrapped(`Hora Emisión: ${data.issue_time}`, FONT_SIZE_SM)
    if (data.valid_until) addTicketWrapped(`Válida hasta: ${data.valid_until}`, FONT_SIZE_SM)
    const showClient = !nvLayout || nvLayout.showClientData
    if (showClient && data.client) {
      addTicketWrapped(
        `Cliente: ${data.client.business_name}`,
        FONT_SIZE_SM,
      )
      addTicketWrapped(
        `Doc.: ${data.client.doc_number || (data.client.doc_type === '6' ? 'RUC' : data.client.doc_type)}`,
        FONT_SIZE_SM,
      )
      if (data.client.address) {
        addTicketWrapped(`Dirección: ${data.client.address}`, FONT_SIZE_SM)
      }
    }
    addTicketWrapped(`Tipo Moneda: ${data.currency === 'USD' ? 'DÓLARES' : 'SOLES'}`, FONT_SIZE_SM)
    renderFiscalHeaderLines(data, (text, size) => addTicketWrapped(text, size ?? FONT_SIZE_SM))
    addSpace(2)

    // Detalle: Helvetica 8pt + negro puro (misma legibilidad que cabecera al imprimir)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')

    const emitTicketDashRow = () => {
      setTicketDetailFont(false)
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.35)
      doc.line(margin, y, pageW - margin, y)
      y += ticketLineH * 0.9
    }

    const emitTicketHeaderRow = () => {
      setTicketDetailFont(true)
      doc.text('CANT', lay.xQty, y, { maxWidth: lay.wQty })
      doc.text('UNID', lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text('DESC.', lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text('P.UNIT', lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text('TOTAL', lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH
    }

    const emitTicketAmountRow = (label: string, amount: string, opts?: { bold?: boolean }) => {
      setTicketDetailFont(Boolean(opts?.bold))
      const labelMaxW = Math.max(10, lay.xEndPUnit - margin - lay.gap - 1)
      const labelLines = doc.splitTextToSize(label, labelMaxW)
      for (let i = 0; i < labelLines.length; i++) {
        doc.text(labelLines[i], margin, y, { maxWidth: labelMaxW })
        if (i === labelLines.length - 1) {
          doc.text(amount, lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
        }
        y += ticketLineH
      }
    }

    emitTicketHeaderRow()
    emitTicketDashRow()

    if (data.fiscal?.has_prepayment_emit) {
      setTicketDetailFont(true)
      doc.text('*** PAGO ANTICIPADO ***', margin, y, { maxWidth: lay.xEndTotal - margin })
      y += ticketLineH
      emitTicketDashRow()
    }

    for (const it of data.items) {
      const baseDesc = receiptItemDisplayDescription(it)
      const desc = data.fiscal?.has_prepayment_emit ? `${baseDesc} *** Pago Anticipado ***` : baseDesc
      const pu = receiptItemDisplayUnitPrice(it, (n) => formatMoney(n, data.currency))
      const tot = receiptItemDisplayTotal(it, (n) => formatMoney(n, data.currency))
      const descLines = doc.splitTextToSize(desc, lay.wDescFirst)
      const firstDesc = descLines[0] ?? '—'

      setTicketDetailFont(false)
      doc.text(String(it.quantity), lay.xQty, y, { maxWidth: lay.wQty })
      doc.text((it.unit || '').slice(0, 10), lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text(firstDesc, lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text(pu, lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text(tot, lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH

      for (let i = 1; i < descLines.length; i++) {
        setTicketDetailFont(false)
        doc.text(descLines[i], lay.xDesc, y, { maxWidth: lay.wDescCont })
        y += ticketLineH
      }
      y += 0.5
    }

    for (const p of data.fiscal?.prepayment_deductions ?? []) {
      setTicketDetailFont(false)
      const label = prepaymentDeductionDescription(p.related_doc_type, p.document_number)
      const labelLines = doc.splitTextToSize(label, lay.wDescFirst)
      doc.text('1', lay.xQty, y, { maxWidth: lay.wQty })
      doc.text('NIU', lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text(labelLines[0] ?? label, lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text(formatMoney(-Math.abs(p.total), data.currency), lay.xEndPUnit, y, {
        align: 'right',
        maxWidth: lay.wMoney,
      })
      doc.text(formatMoney(-Math.abs(p.total), data.currency), lay.xEndTotal, y, {
        align: 'right',
        maxWidth: lay.wMoney,
      })
      y += ticketLineH
      for (let i = 1; i < labelLines.length; i++) {
        doc.text(labelLines[i], lay.xDesc, y, { maxWidth: lay.wDescCont })
        y += ticketLineH
      }
    }

    emitTicketDashRow()

    for (const row of buildReceiptTotalLines(data)) {
      emitTicketAmountRow(
        row.label,
        formatReceiptTotalAmount(row.amount, data.currency, { negative: row.negative }),
        { bold: row.bold },
      )
    }
    renderFiscalTotals(data, emitTicketAmountRow)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    addSpace(2)

    // Leyenda (monto en letras)
    if (data.legend_text) {
      addTicketWrapped(`Son: ${data.legend_text}`, FONT_SIZE_SM)
      addSpace(2)
    }

    const bankLines = bankAccountTextLines(data)
    if (showPayAndBank && bankLines.length > 0) {
      addSpace(1)
      for (const line of bankLines) {
        addTicketWrapped(line, FONT_SIZE_SM)
      }
      addSpace(2)
    }

    if (paymentWalletVisible(data, 'ticket')) {
      y = await renderPaymentWalletBlock(doc, data, 'ticket', y, pageW, margin)
      addSpace(2)
    }

    const showSunatQr = isElectronicSunatCode(data.sunat_code) && Boolean(data.qr_data)
    if (showPayAndBank || showSunatQr) {
      y = await renderTicketPaymentAndSunatQrRow(doc, data, {
        showSunatQr,
        y,
        pageW,
        margin,
        innerW,
        lineH: ticketLineH,
      })
      addSpace(4)
    }

    if (!showSunatQr) {
      if (!isNonElectronicDoc(data.sunat_code)) {
        doc.setFontSize(FONT_SIZE_TICKET_BODY)
        const footLines = doc.splitTextToSize(
          'Representación impresa del comprobante electrónico',
          innerW,
        )
        for (const fl of footLines) {
          doc.text(fl, pageW / 2, y, { align: 'center' })
          y += ticketLineH
        }
      } else if (data.sunat_code === 'QT') {
        addTicketWrapped('Documento comercial — no válido como comprobante de pago SUNAT', FONT_SIZE_TICKET_BODY)
      }
    }

    // Términos y condiciones al final del ticket (preview y comprobante emitido).
    renderFiscalFooter(data, addTicketWrapped, addSpace)

    addSpace(2)
    addTicketLineCenter(`${TUKIFAC_APP_NAME} - Sistema POS`, FONT_SIZE_SM)

    if (options?.preview) {
      applyPreviewWatermark(doc, pageW, y + margin)
    }
    return doc
  }

  // === FORMATO A4 ===
  await renderReceiptA4(doc, data)

  if (options?.preview) {
    applyPreviewWatermark(doc, pageW, A4_HEIGHT)
  }

  return doc
}

export async function printDataToPdfBlob(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<Blob> {
  const doc = await generateReceiptPdf(data, format, options)
  return doc.output('blob')
}

export function receiptPdfFileName(data: PrintData, format: 'a4' | 'ticket'): string {
  const prefix = data.sunat_code === 'QT' ? 'cotizacion' : 'comprobante'
  const safe = formatDocNumber(data).replace(/[^\w.-]+/g, '_')
  return `${prefix}-${safe}-${format}.pdf`
}

export async function downloadReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const blob = await printDataToPdfBlob(data, format, options)
  await downloadBlob(blob, receiptPdfFileName(data, format))
}

export async function openReceiptPdfInNewTab(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const blob = await printDataToPdfBlob(data, format, options)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Espera a que el usuario cierre el diálogo de impresión del navegador (imprimir o cancelar). */
function waitForBrowserPrintDialog(printWindow: Window): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    let printDialogOpened = false
    let noDialogTimer: number | undefined
    let focusTimer: number | undefined
    let maxTimer: number | undefined

    const cleanupListeners = () => {
      window.removeEventListener('afterprint', onAfterPrint)
      printWindow.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      if (noDialogTimer) clearTimeout(noDialogTimer)
      if (focusTimer) clearTimeout(focusTimer)
      if (maxTimer) clearTimeout(maxTimer)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanupListeners()
      resolve()
    }

    const onAfterPrint = () => finish()

    const onBlur = () => {
      printDialogOpened = true
      if (noDialogTimer) clearTimeout(noDialogTimer)
    }

    const onFocus = () => {
      if (!printDialogOpened) return
      if (focusTimer) clearTimeout(focusTimer)
      focusTimer = window.setTimeout(finish, 450)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && printDialogOpened) {
        if (focusTimer) clearTimeout(focusTimer)
        focusTimer = window.setTimeout(finish, 450)
      }
    }

    window.addEventListener('afterprint', onAfterPrint)
    printWindow.addEventListener('afterprint', onAfterPrint)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    noDialogTimer = window.setTimeout(() => {
      if (!printDialogOpened) finish()
    }, 3_000)

    maxTimer = window.setTimeout(finish, 90_000)
  })
}

/** Abre el diálogo de impresión del navegador (mejor nitidez que imprimir desde iframe embebido). */
export async function printReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const blob = await printDataToPdfBlob(data, format, options)
  const url = URL.createObjectURL(blob)

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url

    let settled = false
    const cleanupFrame = () => {
      window.setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(url)
      }, 2_000)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanupFrame()
      resolve()
    }

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      cleanupFrame()
      reject(err)
    }

    iframe.onload = () => {
      void (async () => {
        try {
          const win = iframe.contentWindow
          if (!win) {
            fail(new Error('No se pudo abrir el visor de impresión'))
            return
          }
          win.focus()
          win.print()
          await waitForBrowserPrintDialog(win)
          finish()
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)))
        }
      })()
    }

    iframe.onerror = () => {
      fail(new Error('No se pudo cargar el PDF para imprimir'))
    }

    document.body.appendChild(iframe)
  })
}
