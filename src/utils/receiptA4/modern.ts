import { normalizeLogoPrintSize, scaleLogoDimension } from '@/services/printers/logoPrintSize'
import { getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { jsPDF } from 'jspdf'
import type { PrintData } from '@/types/printData'
import { getTipoDocIdentidadShortLabel, isElectronicSunatCode } from '@/constants/sunat'
import { prepaymentDeductionDescription } from '@/utils/fiscalPrepayment'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import { receiptItemDisplayDescription, receiptItemDisplayTotal, receiptItemDisplayUnit, receiptItemDisplayUnitPrice } from '@/utils/receiptBonificacion'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import { getCreditNoteReference } from '@/utils/receiptCreditNoteRef'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { formatBankAccountLines, formatWalletAccountLine } from '@/utils/receiptBankAccounts'
import { getNotaVentaPrintLayout, type NotaVentaPrintLayoutSettings } from '@/services/printers/notaVentaPrintLayout'
import { PAGE_W, PAGE_H, MARGIN, CONTENT_W, LINE_H, FONT, FONT_SM, FONT_XS, FONT_TITLE, GRAY, CLIENT_LABEL_W, SUNAT_QR_SIZE, formatDocNumber, formatPlainAmount, formatDisplayDate, a4DocTypeTitle, itemLineDiscount, resolveDueDate, customerPayments, primaryPaymentLabel, moneySymbol, qrDataUrl, type A4Ctx, drawTransportDetailBox, drawLineWithPageBreak, drawLegendAndNotes, drawFooter, setFont, useA4FontFamily , currencyLabel, issuerContactLines } from './common'

/** Tipografía del diseño Moderno: sans-serif, pedida por el cliente el 14-oct-2026. */
export const MODERN_FONT_FAMILY = 'helvetica'

/** Recuadro R.U.C. / tipo / número de la cabecera. */
const FONT_DOCBOX = 12

/** Recuadros de datos del cliente / comprobante. */
const FIELD_FONT = 7.8

const FIELD_LINE_H = 3.9

const FIELD_PAD = 2

/**
 * Cabecera: logo a la izquierda, datos del emisor CENTRADOS en el espacio del medio y recuadro
 * R.U.C. / tipo de comprobante / número a la derecha (diseño pedido por el cliente, 14-oct-2026:
 * más ordenado y legible que la versión anterior con barra gris y datos alineados a la izquierda).
 */
export async function drawHeader(
  ctx: A4Ctx,
  data: PrintData,
  nvLayout: NotaVentaPrintLayoutSettings | null,
) {
  const { doc } = ctx
  const top = MARGIN
  // Tamaño base = «mediano»; el ajuste local lo escala a pequeño o grande.
  const logoSizeA4 = normalizeLogoPrintSize(data.company.logo_size_a4)
  const logoMaxW = scaleLogoDimension(36, logoSizeA4, 'a4')
  const logoMaxH = scaleLogoDimension(22, logoSizeA4, 'a4')
  const boxW = 64
  const boxX = PAGE_W - MARGIN - boxW
  const showLogo = !nvLayout || nvLayout.showLogo

  // Logo: el de la sucursal emisora si tiene uno propio (ya resuelto por el backend en
  // data.company.logo_url), si no el global de la empresa cargado al iniciar sesión.
  // Se resuelve aquí pero se dibuja al final del bloque: para centrarlo verticalmente hay
  // que conocer primero el alto real de la cabecera (datos de empresa vs. recuadro).
  const companyLogo = getCompanyLogoForPrint(data.company?.logo_url)
  let pendingLogo: { logo: Awaited<ReturnType<typeof resolveReceiptLogoForPdf>>; w: number; h: number } | null =
    null
  if (showLogo && companyLogo) {
    try {
      const logo = await resolveReceiptLogoForPdf(companyLogo)
      if (logo) {
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, logoMaxW, logoMaxH)
        pendingLogo = { logo, w, h }
      }
    } catch {
      /* sin logo */
    }
  }
  // Sin logo, los datos del emisor se centran en todo el ancho libre a la izquierda del recuadro.
  const infoX = MARGIN + (pendingLogo?.logo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4
  const infoCX = infoX + infoW / 2

  const tradeName = String(data.company.trade_name ?? '').trim()
  const businessName = String(data.company.business_name ?? '').trim()
  const isBoleta = String(data.sunat_code ?? '').trim() === '03'
  // Solo nota de venta: si se ocultó la razón social y hay nombre comercial, se usa este
  // en el encabezado en vez de la razón social. Sin nombre comercial, se muestra igual.
  const hideBusinessNameOnSaleNote =
    Boolean(nvLayout) && data.company.show_business_name_on_sale_note === false && Boolean(tradeName)
  // Boleta: nombre comercial destacado (igual que en ticket) con razón social debajo si
  // difiere. Factura: solo razón social — es el documento formal para la contabilidad del
  // cliente, no debe mostrar una marca comercial que no coincide con su registro SUNAT.
  const highlightTradeNameOnBoleta = isBoleta && Boolean(tradeName)
  const companyName = (
    highlightTradeNameOnBoleta || hideBusinessNameOnSaleNote ? tradeName : businessName || tradeName || '—'
  ).toUpperCase()
  const showBusinessNameSecondary =
    highlightTradeNameOnBoleta &&
    Boolean(businessName) &&
    businessName.localeCompare(tradeName, undefined, { sensitivity: 'accent' }) !== 0

  let cy = top + 4
  // El nombre es un título: centrado y nunca justificado (separaba las palabras de la razón social).
  setFont(doc, FONT_TITLE + 0.5, 'bold')
  for (const line of doc.splitTextToSize(companyName, infoW) as string[]) {
    doc.text(line, infoCX, cy, { align: 'center' })
    cy += LINE_H + 0.4
  }
  const pushInfoLine = (text: string, size = FONT_SM, style: 'normal' | 'bold' = 'normal') => {
    setFont(doc, size, style)
    for (const line of doc.splitTextToSize(text, infoW) as string[]) {
      doc.text(line, infoCX, cy, { align: 'center' })
      cy += LINE_H - 0.5
    }
  }
  if (showBusinessNameSecondary) pushInfoLine(businessName.toUpperCase())
  pushInfoLine(`RUC ${data.company.ruc}`, FONT_SM + 0.5)
  const addr = getPrintIssuerAddress(data)
  if (addr) pushInfoLine(addr)
  const showContact = !nvLayout || nvLayout.showEmailAndPhone
  // Solo si hay dato: antes salía "Central telefónica:" vacío.
  if (showContact) for (const line of issuerContactLines(data)) pushInfoLine(line)
  const notes = trimCompanyAdditionalNotes(data.company.additional_notes)
  if (notes) {
    cy += 0.5
    for (const part of notes.split(/\n/)) {
      const t = part.trim()
      if (t) pushInfoLine(t.toUpperCase(), FONT_XS)
    }
  }

  // Recuadro R.U.C. / tipo / número: tres líneas grandes en negrita, sin barra gris.
  let boxH = 0
  const showDocBox = !nvLayout || nvLayout.showDocTypeAndNumber
  if (showDocBox) {
    setFont(doc, FONT_DOCBOX, 'bold')
    const titleLines = doc.splitTextToSize(a4DocTypeTitle(data).toUpperCase(), boxW - 6) as string[]
    const lineGap = 6.2
    boxH = 7 + lineGap * (titleLines.length + 2) + 1
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.rect(boxX, top, boxW, boxH)
    const cx = boxX + boxW / 2
    let by = top + 9
    doc.text(`R.U.C. ${data.company.ruc}`, cx, by, { align: 'center' })
    by += lineGap
    for (const tl of titleLines) {
      doc.text(tl, cx, by, { align: 'center' })
      by += lineGap
    }
    by += 1.5
    doc.text(formatDocNumber(data), cx, by, { align: 'center' })
  }

  // Logo centrado en su columna: horizontal respecto al ancho reservado y vertical
  // respecto al alto real de la cabecera (lo más alto entre datos de empresa y recuadro).
  if (pendingLogo?.logo) {
    const sectionH = Math.max(cy - top, boxH)
    const logoX = MARGIN + Math.max(0, (logoMaxW - pendingLogo.w) / 2)
    const logoY = top + Math.max(0, (sectionH - pendingLogo.h) / 2)
    doc.addImage(
      pendingLogo.logo.dataUrl,
      pendingLogo.logo.format,
      logoX,
      logoY,
      pendingLogo.w,
      pendingLogo.h,
      undefined,
      'NONE',
    )
  }

  // El logo grande puede ser más alto que los datos de empresa y el recuadro: el contenido
  // que sigue debe empezar debajo del que sea más alto, o se solapa con el logo.
  const logoBottom = pendingLogo?.logo ? top + pendingLogo.h : top
  ctx.y = Math.max(cy, top + boxH, logoBottom) + 5
}

type FieldRow = { label: string; value: string }

/** Alto que ocupa un recuadro de campos "Etiqueta : valor" (el valor envuelve). */
function measureFieldBox(doc: jsPDF, rows: FieldRow[], w: number, labelW: number): number {
  setFont(doc, FIELD_FONT, 'normal')
  const valueW = w - FIELD_PAD * 2 - labelW - 3
  const lines = rows.reduce((n, r) => n + Math.max(1, doc.splitTextToSize(r.value || '—', valueW).length), 0)
  return FIELD_PAD * 2 + lines * FIELD_LINE_H + 1
}

/** Recuadro con filas "Etiqueta : valor" alineadas (estilo de la propuesta). */
function drawFieldBox(doc: jsPDF, x: number, y: number, w: number, h: number, rows: FieldRow[], labelW: number) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)
  const valueX = x + FIELD_PAD + labelW + 3
  const valueW = w - FIELD_PAD * 2 - labelW - 3
  let ly = y + FIELD_PAD + FIELD_LINE_H - 0.6
  for (const r of rows) {
    setFont(doc, FIELD_FONT, 'bold')
    doc.text(r.label, x + FIELD_PAD, ly)
    setFont(doc, FIELD_FONT, 'normal')
    doc.text(':', x + FIELD_PAD + labelW, ly)
    const lines = doc.splitTextToSize(r.value || '—', valueW) as string[]
    lines.forEach((ln, i) => doc.text(ln, valueX, ly + i * FIELD_LINE_H))
    ly += Math.max(1, lines.length) * FIELD_LINE_H
  }
}

/**
 * Datos del cliente (recuadro izquierdo) y del comprobante (recuadro derecho), lado a lado y del
 * mismo alto. Referencias de nota de crédito/débito, observaciones y anticipos van en un tercer
 * recuadro de ancho completo debajo, solo si existen.
 */
function drawCustomerBlock(
  ctx: A4Ctx,
  data: PrintData,
  nvLayout: NotaVentaPrintLayoutSettings | null,
) {
  const { doc } = ctx
  const gap = 2
  const showClient = !nvLayout || nvLayout.showClientData

  const clientRows: FieldRow[] = []
  if (showClient) {
    if (data.client) {
      const isRuc = String(data.client.doc_type ?? '').trim() === '6'
      clientRows.push({ label: isRuc ? 'Razón Social' : 'Cliente', value: data.client.business_name })
      clientRows.push({
        label: getTipoDocIdentidadShortLabel(data.client.doc_type).toUpperCase() || 'Doc.',
        value: data.client.doc_number || '—',
      })
      clientRows.push({ label: 'Dirección', value: data.client.address?.trim() || '—' })
    } else {
      clientRows.push({ label: 'Cliente', value: 'CLIENTES VARIOS' })
    }
  }

  const docRows: FieldRow[] = [{ label: 'Fecha Emisión', value: formatDisplayDate(data.issue_date) }]
  if (data.issue_time?.trim()) docRows.push({ label: 'Hora Emisión', value: data.issue_time.trim().slice(0, 8) })
  if (showClient) docRows.push({ label: 'Fecha de Vcto', value: resolveDueDate(data) })
  docRows.push({ label: 'Moneda', value: currencyLabel(data.currency) })
  if (data.currency === 'USD' && data.exchange_rate) {
    docRows.push({ label: 'Tipo de cambio', value: String(data.exchange_rate) })
  }
  if (data.fiscal?.purchase_order_number) docRows.push({ label: 'O/C', value: data.fiscal.purchase_order_number })
  for (const g of data.fiscal?.guias ?? []) {
    docRows.push({
      label: g.kind === 'guia_transportista' ? 'Guía Transp.' : 'Guía de Remisión',
      value: g.number,
    })
  }

  const top = ctx.y
  if (clientRows.length > 0) {
    const leftW = CONTENT_W * 0.56
    const rightW = CONTENT_W - leftW - gap
    const h = Math.max(
      measureFieldBox(doc, clientRows, leftW, 22),
      measureFieldBox(doc, docRows, rightW, 27),
    )
    drawFieldBox(doc, MARGIN, top, leftW, h, clientRows, 22)
    drawFieldBox(doc, MARGIN + leftW + gap, top, rightW, h, docRows, 27)
    ctx.y = top + h + 3
  } else {
    // Nota de venta sin datos del cliente: solo el recuadro del comprobante, a lo ancho.
    const h = measureFieldBox(doc, docRows, CONTENT_W, 27)
    drawFieldBox(doc, MARGIN, top, CONTENT_W, h, docRows, 27)
    ctx.y = top + h + 3
  }

  // Nota de crédito/débito: SUNAT exige el tipo de nota y el comprobante que modifica.
  const extraRows: FieldRow[] = []
  const creditNoteRef = getCreditNoteReference(data)
  if (creditNoteRef) {
    if (creditNoteRef.noteTypeLabel) extraRows.push({ label: 'Tipo de nota', value: creditNoteRef.noteTypeLabel })
    extraRows.push({ label: 'Doc. que modifica', value: `${creditNoteRef.docTypeLabel} ${creditNoteRef.docNumber}` })
    if (creditNoteRef.reason) extraRows.push({ label: 'Motivo', value: creditNoteRef.reason })
  }
  if (data.fiscal?.fiscal_observations) extraRows.push({ label: 'Observaciones', value: data.fiscal.fiscal_observations })
  for (const p of data.fiscal?.prepayment_deductions ?? []) {
    extraRows.push({ label: 'Anticipo', value: p.document_number })
  }
  if (extraRows.length > 0) {
    const h = measureFieldBox(doc, extraRows, CONTENT_W, 30)
    drawFieldBox(doc, MARGIN, ctx.y, CONTENT_W, h, extraRows, 30)
    ctx.y += h + 3
  }
  ctx.y += 1
}


type ItemTableCol = { key: string; label: string; w: number; align?: 'left' | 'right' | 'center' }

/**
 * Tabla de ítems con salto de página real: cada fila chequea si entra en lo que queda de la
 * página y si no, cierra el recuadro de esa página, salta, y repite la cabecera de columnas en la
 * nueva. Columnas en el orden de la propuesta (CÓDIGO, CANT., U.M., DESCRIPCIÓN, P.UNIT, TOTAL);
 * DTO. solo aparece si algún ítem tiene descuento — una columna de ceros no aporta nada.
 */
function drawItemsTable(ctx: A4Ctx, data: PrintData): number {
  const { doc } = ctx
  const tableX = MARGIN
  // Relleno visual mínimo cuando hay pocos ítems (no empujar el bloque de totales a la hoja 2).
  const minBodyRows = 3
  const rowH = LINE_H + 0.4
  const maxRowBottom = PAGE_H - MARGIN

  const hasDiscount = data.items.some((it) => itemLineDiscount(it) > 0.004)
  const cols: ItemTableCol[] = [
    { key: 'code', label: 'CÓDIGO', w: 24, align: 'left' },
    { key: 'qty', label: 'CANT.', w: 15, align: 'center' },
    { key: 'unit', label: 'U.M.', w: 12, align: 'center' },
    { key: 'desc', label: 'DESCRIPCIÓN', w: 0, align: 'left' },
    { key: 'pu', label: 'P.UNIT', w: 20, align: 'right' },
    ...(hasDiscount ? [{ key: 'dto', label: 'DTO.', w: 16, align: 'right' as const }] : []),
    { key: 'total', label: 'TOTAL', w: 22, align: 'right' },
  ]
  const fixed = cols.reduce((s, c) => s + c.w, 0)
  const descCol = cols.find((c) => c.key === 'desc')!
  descCol.w = CONTENT_W - fixed

  const colX: Record<string, number> = {}
  let cx = tableX
  for (const c of cols) {
    colX[c.key] = cx
    cx += c.w
  }
  const colW = (key: string) => cols.find((c) => c.key === key)?.w ?? 0

  const headerH = rowH + 1.2
  const drawVerticalGrid = (y0: number, y1: number) => {
    doc.line(tableX, y0, tableX, y1)
    for (let i = 1; i < cols.length; i++) doc.line(colX[cols[i].key], y0, colX[cols[i].key], y1)
    doc.line(tableX + CONTENT_W, y0, tableX + CONTENT_W, y1)
  }

  /** Dibuja la cabecera de columnas en `top` y devuelve el Y donde arranca el cuerpo. */
  const drawHeader = (top: number): number => {
    doc.setFillColor(...GRAY)
    doc.rect(tableX, top, CONTENT_W, headerH, 'F')
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.rect(tableX, top, CONTENT_W, headerH)
    setFont(doc, FONT_SM, 'bold')
    const hy = top + headerH - 1.9
    cols.forEach((c, i) => {
      // Cabeceras centradas en su columna (como la propuesta), sin importar la alineación del dato.
      doc.text(c.label, colX[c.key] + c.w / 2, hy, { align: 'center', maxWidth: c.w - 1.5 })
      if (i > 0) doc.line(colX[c.key], top, colX[c.key], top + headerH)
    })
    return top + headerH
  }

  let tableTop = ctx.y
  let bodyStart = drawHeader(tableTop)
  let rowY = bodyStart + 0.8

  const ensureSpace = (h: number) => {
    if (rowY + h <= maxRowBottom) return
    drawVerticalGrid(tableTop, rowY)
    doc.line(tableX, rowY, tableX + CONTENT_W, rowY)
    doc.addPage()
    tableTop = MARGIN
    bodyStart = drawHeader(tableTop)
    rowY = bodyStart + 0.8
  }

  const cellText = (key: string, text: string, y: number) => {
    const c = cols.find((col) => col.key === key)
    if (!c) return
    const x = c.align === 'right' ? colX[key] + c.w - 1.5 : c.align === 'center' ? colX[key] + c.w / 2 : colX[key] + 1.5
    doc.text(text, x, y, { align: c.align ?? 'left', maxWidth: c.w - 2 })
  }

  const renderRow = (r: { code: string; qty: string; unit: string; desc: string; pu: string; dto: string; total: string }) => {
    setFont(doc, FONT_SM, 'normal')
    const descLines = doc.splitTextToSize(r.desc, colW('desc') - 3) as string[]
    const codeLines = doc.splitTextToSize(r.code, colW('code') - 2.5) as string[]
    const h = rowH * Math.max(1, descLines.length, Math.min(codeLines.length, 3))
    ensureSpace(h)
    setFont(doc, FONT_SM, 'normal')
    const firstY = rowY + rowH - 1.2
    codeLines.slice(0, 3).forEach((ln, i) => doc.text(ln, colX.code + 1.2, firstY + i * rowH))
    cellText('qty', r.qty, firstY)
    cellText('unit', r.unit, firstY)
    descLines.forEach((ln, i) => doc.text(ln, colX.desc + 1.5, firstY + i * rowH))
    cellText('pu', r.pu, firstY)
    cellText('dto', r.dto, firstY)
    cellText('total', r.total, firstY)
    rowY += h
  }

  for (const it of data.items) {
    let desc = receiptItemDisplayDescription(it)
    if (data.fiscal?.has_prepayment_emit) desc = `${desc}\n*** Pago Anticipado ***`
    renderRow({
      code: it.code || '—',
      qty: String(it.quantity),
      unit: (receiptItemDisplayUnit(it) || 'NIU').slice(0, 8),
      desc,
      pu: receiptItemDisplayUnitPrice(it, formatPlainAmount),
      dto: formatPlainAmount(itemLineDiscount(it)),
      total: receiptItemDisplayTotal(it, formatPlainAmount),
    })
  }

  const prepDeductions = data.fiscal?.prepayment_deductions ?? []
  for (const p of prepDeductions) {
    const neg = formatPlainAmount(-Math.abs(p.total))
    renderRow({
      code: '—',
      qty: '1',
      unit: 'NIU',
      desc: prepaymentDeductionDescription(p.related_doc_type, p.document_number),
      pu: neg,
      dto: '0.00',
      total: neg,
    })
  }

  // Filas vacías de relleno hasta el mínimo visual — solo si el contenido real no llegó ahí.
  const emptyRows = Math.max(0, minBodyRows - data.items.length - prepDeductions.length)
  for (let i = 0; i < emptyRows; i++) {
    ensureSpace(rowH)
    rowY += rowH
  }
  rowY += 0.8

  doc.setLineWidth(0.3)
  drawVerticalGrid(tableTop, rowY)
  doc.line(tableX, rowY, tableX + CONTENT_W, rowY)

  ctx.y = rowY + 3
  return rowY
}

/* ───────────── Bloque posterior a la tabla (diseño 14-oct-2026) ─────────────
 *
 * Un recuadro de tres columnas, todo a la misma altura:
 *   izquierda: vendedor + datos de la detracción (bien/servicio, %, monto, medio de pago, cuenta BN)
 *   centro:    "SON: …", leyenda de detracción y el QR SUNAT con su hash
 *   derecha:   totales, cada uno en su celda (OP. GRAVADA … TOTAL A PAGAR, NETO A COBRAR)
 * y debajo, a lo ancho: cuentas bancarias y la CONDICIÓN DE PAGO (pagos del cliente — sin la
 * porción de detracción — o las cuotas si es a crédito, sin columna de estado).
 */

const POST_FONT = FONT_XS + 0.5

const POST_LINE_H = 3.6

const POST_PAD = 2

const TOTAL_ROW_H = 5.6

const LEFT_COL_W = 52

const RIGHT_COL_W = 66

type InfoRow = { label: string; value: string }

type TotalRow = { label: string; amount: string; bold?: boolean }

function postLeftRows(data: PrintData): InfoRow[] {
  const rows: InfoRow[] = []
  if (data.seller_name?.trim()) rows.push({ label: 'Vendedor', value: data.seller_name.trim() })
  const f = data.fiscal
  if (f?.has_detraccion) {
    if (f.detraccion_good_code) {
      rows.push({
        label: 'B/S sujeto a detracción',
        value: f.detraccion_good_label ? `${f.detraccion_good_code} - ${f.detraccion_good_label}` : f.detraccion_good_code,
      })
    }
    if (f.detraccion_rate_percent != null) {
      rows.push({ label: 'Porcentaje detracción', value: `${f.detraccion_rate_percent.toFixed(2)}%` })
    }
    if (f.detraccion_amount != null) {
      // A pedido del negocio, este monto se redondea al entero más cercano (10.56 → 11, 10.54 →
      // 10) — a diferencia del resto de importes del comprobante, que siempre llevan 2 decimales.
      rows.push({ label: 'Monto detracción', value: `${moneySymbol(data.currency)} ${Math.round(f.detraccion_amount)}` })
    }
    if (f.detraccion_payment_method_code || f.detraccion_payment_method_label) {
      // Solo la descripción del catálogo 59 ("Depósito en cuenta"), no el código.
      rows.push({
        label: 'Método de pago',
        value: f.detraccion_payment_method_label || f.detraccion_payment_method_code || '',
      })
    }
    if (f.detraccion_bank_account) rows.push({ label: 'N. Cta. detracciones', value: f.detraccion_bank_account })
    if (f.detraccion_pay_constancy_number) rows.push({ label: 'N° Constancia', value: f.detraccion_pay_constancy_number })
  }
  return rows
}

function postTotalRows(data: PrintData): TotalRow[] {
  const sym = moneySymbol(data.currency)
  const rows: TotalRow[] = buildReceiptTotalLines(data).map((row) => ({
    label: `${row.label.toUpperCase().replace(/:$/, '')} ${sym}`,
    amount: row.negative ? `- ${Math.abs(row.amount).toFixed(2)}` : Math.abs(row.amount).toFixed(2),
    bold: row.bold,
  }))
  const f = data.fiscal
  if (f?.retention_applied) {
    rows.push({ label: `RET. IGV (3%) ${sym}`, amount: formatPlainAmount(f.igv_retention_amount ?? 0) })
    rows.push({ label: `NETO A COBRAR ${sym}`, amount: formatPlainAmount(f.net_collectible ?? data.total), bold: true })
  }
  if (f?.has_detraccion) {
    rows.push({ label: `NETO A COBRAR ${sym}`, amount: formatPlainAmount(f.detraccion_net_payable ?? data.total), bold: true })
  }
  if (f?.has_prepayment_emit) {
    rows.push({ label: 'ANTICIPO', amount: f.prepayment_label ?? 'COMPROBANTE DE ANTICIPO', bold: true })
  }
  return rows
}

function measureInfoRows(doc: jsPDF, rows: InfoRow[], w: number): number {
  let n = 0
  for (const r of rows) {
    setFont(doc, POST_FONT, 'bold')
    const labelW = doc.getTextWidth(`${r.label}: `)
    setFont(doc, POST_FONT, 'normal')
    // Etiqueta y valor en la misma línea si entra; si no, el valor baja debajo de la etiqueta.
    const inline = doc.getTextWidth(r.value) <= w - labelW
    n += inline ? 1 : 1 + (doc.splitTextToSize(r.value, w) as string[]).length
  }
  return n * POST_LINE_H
}

function drawInfoRows(doc: jsPDF, rows: InfoRow[], x: number, y: number, w: number): number {
  let ly = y
  for (const r of rows) {
    setFont(doc, POST_FONT, 'bold')
    const label = `${r.label}: `
    const labelW = doc.getTextWidth(label)
    doc.text(label, x, ly)
    setFont(doc, POST_FONT, 'normal')
    if (doc.getTextWidth(r.value) <= w - labelW) {
      doc.text(r.value, x + labelW, ly)
      ly += POST_LINE_H
    } else {
      ly += POST_LINE_H
      for (const ln of doc.splitTextToSize(r.value, w) as string[]) {
        doc.text(ln, x, ly)
        ly += POST_LINE_H
      }
    }
  }
  return ly
}

function middleTexts(doc: jsPDF, data: PrintData, w: number): { son: string[]; legend: string[] } {
  setFont(doc, FONT_SM, 'bold')
  const son = data.legend_text?.trim()
    ? (doc.splitTextToSize(`SON: ${data.legend_text.trim().toUpperCase()}`, w) as string[])
    : []
  setFont(doc, POST_FONT, 'bold')
  const legendRaw = data.fiscal?.has_detraccion
    ? data.fiscal.detraccion_legend_text?.trim() || 'Operación sujeta al Sistema de Pago de Obligaciones Tributarias'
    : ''
  const legend = legendRaw ? (doc.splitTextToSize(legendRaw, w) as string[]) : []
  return { son, legend }
}

/** Alto del recuadro de tres columnas (para decidir el salto de página antes de dibujarlo). */
function measurePostBox(doc: jsPDF, data: PrintData, showQr: boolean): number {
  const leftRows = postLeftRows(data)
  const leftW = leftRows.length ? LEFT_COL_W : 0
  const midW = CONTENT_W - leftW - RIGHT_COL_W
  const leftH = leftRows.length ? POST_PAD * 2 + measureInfoRows(doc, leftRows, leftW - POST_PAD * 2) : 0
  const { son, legend } = middleTexts(doc, data, midW - POST_PAD * 2)
  // Mismo recorrido que drawPostBox: primera línea base, SON, leyenda, QR (+1 de aire) y hash.
  let midH = POST_PAD + LINE_H - 1.2 + son.length * LINE_H + legend.length * POST_LINE_H + POST_PAD
  if (showQr && data.qr_data) {
    midH += 1 + SUNAT_QR_SIZE + 1
    if (data.sunat_hash?.trim()) midH += 4.5
  }
  const rightH = postTotalRows(data).length * TOTAL_ROW_H
  return Math.max(leftH, midH, rightH, 3 * TOTAL_ROW_H)
}

async function drawPostBox(ctx: A4Ctx, data: PrintData, showQr: boolean): Promise<number> {
  const { doc } = ctx
  const top = ctx.y
  const h = measurePostBox(doc, data, showQr)
  const leftRows = postLeftRows(data)
  const leftW = leftRows.length ? LEFT_COL_W : 0
  const midW = CONTENT_W - leftW - RIGHT_COL_W
  const midX = MARGIN + leftW
  const rightX = MARGIN + leftW + midW

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.rect(MARGIN, top, CONTENT_W, h)
  if (leftW) doc.line(midX, top, midX, top + h)
  doc.line(rightX, top, rightX, top + h)

  // Izquierda: vendedor + detracción.
  if (leftRows.length) {
    drawInfoRows(doc, leftRows, MARGIN + POST_PAD, top + POST_PAD + POST_LINE_H - 0.8, leftW - POST_PAD * 2)
  }

  // Centro: SON, leyenda de detracción y QR SUNAT.
  const { son, legend } = middleTexts(doc, data, midW - POST_PAD * 2)
  let my = top + POST_PAD + LINE_H - 1.2
  setFont(doc, FONT_SM, 'bold')
  for (const ln of son) {
    doc.text(ln, midX + POST_PAD, my)
    my += LINE_H
  }
  setFont(doc, POST_FONT, 'bold')
  for (const ln of legend) {
    doc.text(ln, midX + POST_PAD, my)
    my += POST_LINE_H
  }
  if (showQr && data.qr_data) {
    try {
      const qrUrl = await qrDataUrl(data.qr_data, SUNAT_QR_SIZE)
      const qrY = my + 1
      doc.addImage(qrUrl, 'PNG', midX + (midW - SUNAT_QR_SIZE) / 2, qrY, SUNAT_QR_SIZE, SUNAT_QR_SIZE, undefined, 'NONE')
      if (data.sunat_hash?.trim()) {
        setFont(doc, FONT_XS - 0.5, 'normal')
        doc.text(`Código Hash: ${data.sunat_hash.trim()}`, midX + midW / 2, qrY + SUNAT_QR_SIZE + 3.2, {
          align: 'center',
          maxWidth: midW - POST_PAD * 2,
        })
      }
    } catch {
      /* sin QR */
    }
  }

  // Derecha: totales en celdas (etiqueta | importe).
  const totals = postTotalRows(data)
  const amountColW = 22
  const labelRight = rightX + RIGHT_COL_W - amountColW - 1.5
  let ty = top
  totals.forEach((row, i) => {
    setFont(doc, FONT_SM, 'bold')
    doc.text(row.label, labelRight, ty + TOTAL_ROW_H - 1.8, { align: 'right', maxWidth: RIGHT_COL_W - amountColW - 3 })
    setFont(doc, FONT_SM, row.bold ? 'bold' : 'normal')
    doc.text(row.amount, rightX + RIGHT_COL_W - 1.5, ty + TOTAL_ROW_H - 1.8, { align: 'right' })
    ty += TOTAL_ROW_H
    if (i < totals.length - 1 || ty < top + h - 0.1) doc.line(rightX, ty, rightX + RIGHT_COL_W, ty)
  })
  doc.line(rightX + RIGHT_COL_W - amountColW, top, rightX + RIGHT_COL_W - amountColW, top + Math.max(ty - top, 0))

  return top + h
}

/** Línea con salto de página si no entra (mismo criterio que drawLineWithPageBreak). */
function textLine(ctx: A4Ctx, y: number, text: string, x = MARGIN): number {
  let cy = y
  if (cy + LINE_H > PAGE_H - MARGIN) {
    ctx.doc.addPage()
    cy = MARGIN + LINE_H
  }
  ctx.doc.text(text, x, cy)
  return cy + LINE_H - 0.3
}

function drawBankAccounts(ctx: A4Ctx, data: PrintData, startY: number, maxW: number): number {
  const { doc } = ctx
  const lines: string[] = []
  for (const b of data.bank_accounts ?? []) lines.push(...formatBankAccountLines(b))
  const wallet = data.payment_wallet
  if (wallet?.provider && wallet.phone && !paymentWalletVisible(data, 'a4')) {
    const wLine = formatWalletAccountLine(wallet.provider, wallet.phone)
    if (wLine) lines.push(wLine)
  }
  if (lines.length === 0) return startY
  let y = startY
  setFont(doc, FONT_SM, 'bold')
  y = textLine(ctx, y, 'CUENTAS BANCARIAS:')
  setFont(doc, FONT_SM, 'normal')
  for (const line of lines) {
    for (const wl of doc.splitTextToSize(line, maxW) as string[]) y = textLine(ctx, y, wl)
  }
  return y + 1.5
}

/**
 * CONDICIÓN DE PAGO: Contado → los pagos del cliente (sin la detracción, que no la paga al
 * emisor sino al Banco de la Nación) y el vuelto; Crédito → las cuotas, una por línea, sin
 * estado de pago (es un comprobante, no un estado de cuenta).
 */
function drawPaymentCondition(ctx: A4Ctx, data: PrintData, startY: number, maxW: number, showPayments: boolean): number {
  const { doc } = ctx
  const sym = moneySymbol(data.currency)
  const installments = data.credit_installments ?? []
  let y = startY

  if (String(data.sunat_code ?? '').trim() === 'QT') {
    const refs = data.reference_payments ?? []
    if (refs.length === 0) return y
    setFont(doc, FONT_SM, 'bold')
    y = textLine(ctx, y, 'MÉTODO DE PAGO (REFERENCIA):')
    setFont(doc, FONT_SM, 'normal')
    for (const p of refs) {
      const detail = p.reference?.trim() ? ` (${p.reference.trim()})` : ''
      const amount = p.amount > 0.009 ? `: ${sym} ${formatPlainAmount(p.amount)}` : ''
      y = textLine(ctx, y, `• ${salePaymentMethodLabelEs(p.method)}${amount}${detail}`)
    }
    return y + 1.5
  }

  if (!showPayments && installments.length === 0) return y
  const cond = installments.length > 0 ? 'Crédito' : String(data.payment_condition ?? '').trim() || 'Contado'
  setFont(doc, FONT_SM, 'bold')
  y = textLine(ctx, y, `CONDICIÓN DE PAGO: ${cond}`)
  setFont(doc, FONT_SM, 'normal')
  if (installments.length > 0) {
    for (const inst of installments) {
      const line = `• Cuota #${inst.installment_no} / Fecha: ${formatDisplayDate(inst.due_date)} / Monto: ${moneySymbol(inst.currency || data.currency)} ${formatPlainAmount(inst.amount)}`
      for (const wl of doc.splitTextToSize(line, maxW) as string[]) y = textLine(ctx, y, wl)
    }
  } else if (showPayments) {
    const payments = customerPayments(data)
    if (payments.length > 0) {
      for (const p of payments) y = textLine(ctx, y, `• ${salePaymentMethodLabelEs(p.method)}: ${sym} ${formatPlainAmount(p.amount)}`)
    } else {
      y = textLine(ctx, y, `• ${primaryPaymentLabel(data)}`)
    }
    if (data.change_amount && data.change_amount > 0) {
      y = textLine(ctx, y, `• Vuelto: ${sym} ${formatPlainAmount(data.change_amount)}`)
    }
  }
  return y + 1.5
}

export async function renderModernA4(doc: jsPDF, data: PrintData): Promise<void> {
  useA4FontFamily(doc, MODERN_FONT_FAMILY)
  const ctx: A4Ctx = { doc, y: MARGIN }
  const nvLayout = getNotaVentaPrintLayout(data.sunat_code)
  const showPaymentCondition = !nvLayout || nvLayout.showPaymentCondition
  const isElectronic = isElectronicSunatCode(data.sunat_code)

  await drawHeader(ctx, data, nvLayout)
  drawCustomerBlock(ctx, data, nvLayout)
  // Sección "DETALLE - SERVICIOS DE TRANSPORTE DE CARGA": desactivada a pedido (no es necesaria en
  // el PDF). Se conserva drawTransportDetailBox() para reactivarla descomentando esta línea.
  // drawTransportDetailBox(ctx, data, ctx.y)
  drawItemsTable(ctx, data)

  // El recuadro de totales/QR no tiene salto de página propio: si no entra entero en lo que
  // queda de la hoja, arranca en una nueva (nunca cortar el QR a la mitad).
  if (ctx.y + measurePostBox(doc, data, isElectronic) > PAGE_H - MARGIN) {
    doc.addPage()
    ctx.y = MARGIN
  }
  let y = (await drawPostBox(ctx, data, isElectronic)) + 5
  const boxPage = doc.getNumberOfPages()

  // QR de billetera (Yape/Plin) a la derecha, debajo del recuadro; el texto de la izquierda
  // (cuentas, condición de pago) se angosta para no cruzarse con él.
  const walletVisible = paymentWalletVisible(data, 'a4')
  const textMaxW = walletVisible ? CONTENT_W - 55 : CONTENT_W
  let walletBottom = y
  if (walletVisible) {
    walletBottom = await renderPaymentWalletBlock(doc, data, 'a4', y - 1, PAGE_W, MARGIN, 'right')
  }

  y = drawBankAccounts(ctx, data, y + 2, textMaxW)
  y = drawPaymentCondition(ctx, data, y + 1, textMaxW, showPaymentCondition)
  // Términos y condiciones/observaciones (texto largo configurable): salto de página línea por
  // línea si hace falta. El "SON:" ya va dentro del recuadro.
  y = drawLegendAndNotes(ctx, data, y + 1, true)
  const pageBroke = doc.getNumberOfPages() > boxPage

  const footerMinY = pageBroke ? y : Math.max(y, walletBottom)
  await drawFooter(ctx, data, footerMinY, { bottomAnchor: !pageBroke })
}
