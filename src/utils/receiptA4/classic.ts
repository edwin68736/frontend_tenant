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
import { issuerContactLines, issueMetaText, customerPayments, PAGE_W, PAGE_H, MARGIN, CONTENT_W, LINE_H, FONT, FONT_SM, FONT_XS, FONT_LG, FONT_TITLE, GRAY, BOX_RADIUS, SUNAT_QR_SIZE, FOOTER_BOTTOM_MARGIN, CLIENT_LABEL_W, formatDocNumber, formatPlainAmount, formatDisplayDate, a4DocTypeTitle, itemLineDiscount, resolveDueDate, primaryPaymentLabel, moneySymbol, qrDataUrl, drawDottedRect, drawLineWithPageBreak, drawLegendAndNotes, drawFooter, setFont, useA4FontFamily, type A4Ctx, type TableCol } from './common'

/** Tipografía del diseño Clásico: serif, la del PDF A4 anterior al rediseño del 14-oct-2026. */
export const CLASSIC_FONT_FAMILY = 'times'

/**
 * Dibuja una línea de la cabecera de empresa. Si `justify` es true, reparte el
 * espacio sobrante entre las palabras para alinear a ambos márgenes (justificado).
 * Solo debe justificarse cada línea salvo la última de un párrafo.
 *
 * Si justificar obligaría a abrir huecos grandes (línea con pocas palabras, ej. una razón
 * social "INVERSIONES J & L" que parte en dos líneas), se deja alineada a la izquierda: con
 * huecos de varios espacios las palabras se ven sueltas en vez de formar una frase.
 */
function drawCompanyInfoLine(
  doc: jsPDF,
  line: string,
  x: number,
  y: number,
  width: number,
  justify: boolean,
) {
  const words = line.split(/\s+/).filter(Boolean)
  if (!justify || words.length <= 1) {
    doc.text(line, x, y, { maxWidth: width })
    return
  }
  const wordsW = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0)
  const gap = (width - wordsW) / (words.length - 1)
  const maxGap = doc.getTextWidth(' ') * 2.5
  if (!(gap > 0) || gap > maxGap) {
    doc.text(line, x, y, { maxWidth: width })
    return
  }
  let cx = x
  for (const w of words) {
    doc.text(w, cx, y)
    cx += doc.getTextWidth(w) + gap
  }
}

function drawA4Field(
  ctx: A4Ctx,
  label: string,
  value: string,
  x: number,
  opts?: { labelW?: number; valueMaxW?: number },
) {
  const { doc, y } = ctx
  const labelW = opts?.labelW ?? CLIENT_LABEL_W
  setFont(doc, FONT, 'bold')
  doc.text(`${label} :`, x, y)
  setFont(doc, FONT, 'normal')
  const valueX = x + labelW
  const maxW = opts?.valueMaxW ?? CONTENT_W - labelW
  const lines = doc.splitTextToSize(value || '—', maxW)
  doc.text(lines[0] ?? '—', valueX, y)
  for (let i = 1; i < lines.length; i++) {
    ctx.y += LINE_H
    doc.text(lines[i], valueX, ctx.y)
  }
}

async function drawHeader(
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
  const boxW = 62
  const boxX = PAGE_W - MARGIN - boxW
  const showLogo = !nvLayout || nvLayout.showLogo
  const infoX = MARGIN + (showLogo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

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

  setFont(doc, FONT_TITLE, 'bold')
  let cy = top + 3
  {
    const nameLines: string[] = doc.splitTextToSize(companyName, infoW)
    nameLines.forEach(line => {
      // El nombre es un título: nunca justificado (separaba las palabras de la razón social).
      drawCompanyInfoLine(doc, line, infoX, cy, infoW, false)
      cy += LINE_H + 0.2
    })
  }
  if (showBusinessNameSecondary) {
    setFont(doc, FONT_SM, 'normal')
    const secLines: string[] = doc.splitTextToSize(businessName.toUpperCase(), infoW)
    secLines.forEach(line => {
      drawCompanyInfoLine(doc, line, infoX, cy, infoW, false)
      cy += LINE_H - 0.2
    })
  }

  setFont(doc, FONT_SM, 'normal')
  const pushInfoLine = (text: string, uppercase = false) => {
    const raw = uppercase ? text.toUpperCase() : text
    const lines: string[] = doc.splitTextToSize(raw, infoW)
    lines.forEach((wl, i) => {
      drawCompanyInfoLine(doc, wl, infoX, cy, infoW, i < lines.length - 1)
      cy += LINE_H - 0.15
    })
  }

  pushInfoLine(`RUC ${data.company.ruc}`)
  const addr = getPrintIssuerAddress(data)
  if (addr) pushInfoLine(addr)
  const showContact = !nvLayout || nvLayout.showEmailAndPhone
  // Solo si hay dato: antes salía «Central telefónica:» / «Email:» vacíos.
  if (showContact) for (const line of issuerContactLines(data)) pushInfoLine(line)

  const notes = trimCompanyAdditionalNotes(data.company.additional_notes)
  if (notes) {
    cy += 0.5
    setFont(doc, FONT_XS, 'normal')
    for (const part of notes.split(/\n/)) {
      const t = part.trim()
      if (t) pushInfoLine(t, true)
    }
  }

  const boxH = 36
  const showDocBox = !nvLayout || nvLayout.showDocTypeAndNumber
  if (showDocBox) {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.25)
    doc.roundedRect(boxX, top, boxW, boxH, BOX_RADIUS, BOX_RADIUS)

    setFont(doc, FONT, 'bold')
    doc.text(`RUC:  ${data.company.ruc}`, boxX + boxW / 2, top + 5.5, { align: 'center' })

    const barY = top + 9
    const barH = 9
    doc.setFillColor(...GRAY)
    doc.rect(boxX, barY, boxW, barH, 'F')
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.line(boxX, barY, boxX + boxW, barY)
    doc.line(boxX, barY + barH, boxX + boxW, barY + barH)
    setFont(doc, FONT, 'bold')
    doc.text(a4DocTypeTitle(data), boxX + boxW / 2, barY + 6, { align: 'center' })

    setFont(doc, FONT_LG, 'bold')
    doc.text(formatDocNumber(data), boxX + boxW / 2, top + 30, { align: 'center' })
  }

  // Logo centrado en su columna: horizontal respecto al ancho reservado y vertical
  // respecto al alto real de la cabecera (lo más alto entre datos de empresa y recuadro).
  if (pendingLogo?.logo) {
    const sectionH = Math.max(cy - top, showDocBox ? boxH : 0)
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
  ctx.y = Math.max(cy, showDocBox ? top + boxH : top, logoBottom) + 8
}

function drawCustomerBlock(
  ctx: A4Ctx,
  data: PrintData,
  nvLayout: NotaVentaPrintLayoutSettings | null,
) {
  const { doc } = ctx
  const leftX = MARGIN
  const due = resolveDueDate(data)

  drawA4Field(ctx, 'FECHA DE EMISIÓN', formatDisplayDate(data.issue_date), leftX)
  // Hora, moneda y tipo de cambio: a la derecha de la misma fila (el Clásico original no los mostraba).
  setFont(doc, FONT, 'normal')
  doc.text(issueMetaText(data), PAGE_W - MARGIN, ctx.y, { align: 'right' })
  ctx.y += LINE_H

  const showClient = !nvLayout || nvLayout.showClientData
  if (showClient) {
    if (data.client) {
      drawA4Field(ctx, 'CLIENTE', data.client.business_name, leftX)
      ctx.y += LINE_H
      const docLabel = getTipoDocIdentidadShortLabel(data.client.doc_type).toUpperCase()
      drawA4Field(ctx, docLabel, data.client.doc_number || '—', leftX, { valueMaxW: CONTENT_W * 0.45 })
      setFont(doc, FONT, 'normal')
      // Alinear al borde derecho del contenido (mismo ancho que caja RUC y tabla).
      doc.text(`Fecha Vencimiento: ${due}`, PAGE_W - MARGIN, ctx.y, { align: 'right' })
      ctx.y += LINE_H
      drawA4Field(ctx, 'DIRECCIÓN', data.client.address?.trim() || '—', leftX)
      ctx.y += LINE_H
    } else {
      drawA4Field(ctx, 'CLIENTE', 'CLIENTE VARIOS', leftX)
      ctx.y += LINE_H
    }
  }

  // Nota de crédito/débito: SUNAT exige el tipo de nota y el comprobante que modifica.
  const creditNoteRef = getCreditNoteReference(data)
  if (creditNoteRef) {
    if (creditNoteRef.noteTypeLabel) {
      drawA4Field(ctx, 'TIPO DE NOTA', creditNoteRef.noteTypeLabel, leftX)
      ctx.y += LINE_H
    }
    drawA4Field(ctx, 'TIPO DOC. REF.', creditNoteRef.docTypeLabel, leftX)
    ctx.y += LINE_H
    drawA4Field(ctx, 'DOCUMENTO REF.', creditNoteRef.docNumber, leftX)
    ctx.y += LINE_H
    if (creditNoteRef.reason) {
      drawA4Field(ctx, 'MOTIVO', creditNoteRef.reason, leftX)
      ctx.y += LINE_H
    }
  }

  if (data.fiscal?.purchase_order_number) {
    drawA4Field(ctx, 'O/C', data.fiscal.purchase_order_number, leftX)
    ctx.y += LINE_H
  }
  if (data.fiscal?.guias?.length) {
    for (const g of data.fiscal.guias) {
      const label = g.kind === 'guia_transportista' ? 'GUÍA TRANSP.' : 'GUÍA REM.'
      drawA4Field(ctx, label, g.number, leftX)
      ctx.y += LINE_H
    }
  }
  if (data.fiscal?.fiscal_observations) {
    drawA4Field(ctx, 'OBS.', data.fiscal.fiscal_observations, leftX)
    ctx.y += LINE_H
  }
  if (data.fiscal?.prepayment_deductions?.length) {
    for (const p of data.fiscal.prepayment_deductions) {
      drawA4Field(ctx, 'ANTICIPO', p.document_number, leftX)
      ctx.y += LINE_H
    }
  }

  ctx.y += 4
}

/**
 * Tabla de ítems con salto de página real: antes asumía que todo entraba en `minBodyRows`
 * (14) filas fijas — con más ítems, seguía dibujando filas de todos modos pero el marco y
 * el `ctx.y` de salida quedaban calculados para esas 14 filas nomás, así que el total, el
 * "SON:" y el pie terminaban dibujados encima de las filas de más en vez de debajo. Ahora
 * cada fila chequea si entra en lo que queda de la página (mismo margen que
 * drawLineWithPageBreak) y si no, cierra el recuadro de esa página, salta, y repite la
 * cabecera de columnas en la nueva — igual que ya se hacía con textos largos (términos,
 * observaciones), solo que acá nunca se había aplicado a la tabla.
 */
function drawItemsTable(ctx: A4Ctx, data: PrintData): number {
  const { doc } = ctx
  const tableX = MARGIN
  // Relleno visual mínimo cuando hay pocos ítems — antes era fijo en 14 filas sin importar
  // cuántos ítems reales tuviera el comprobante: con 1 ítem, eso solo de relleno ocupaba
  // ~65mm y era justo lo que empujaba a página 2 el bloque de totales/detracción/cuentas
  // bancarias (bug reportado: comprobante con 1 ítem no debería partirse en 2 páginas). El
  // salto de página real (ensureSpace, más abajo) sigue intacto para cuando SÍ hay muchos
  // ítems — esto solo reduce el relleno cosmético cuando sobran filas vacías.
  const minBodyRows = 3
  const rowH = LINE_H + 0.6
  const maxRowBottom = PAGE_H - MARGIN

  const cols: TableCol[] = [
    { label: 'CANT.', w: 11, align: 'center' },
    { label: 'UNIDAD', w: 15, align: 'center' },
    { label: 'CÓDIGO', w: 27, align: 'left' },
    { label: 'DESCRIPCIÓN', w: 72, align: 'left' },
    { label: 'P.UNIT', w: 19, align: 'right' },
    { label: 'DTO.', w: 15, align: 'right' },
    { label: 'TOTAL', w: 21, align: 'right' },
  ]
  const colSum = cols.reduce((s, c) => s + c.w, 0)
  if (Math.abs(colSum - CONTENT_W) > 0.5) {
    cols[3].w += CONTENT_W - colSum
  }

  const colX: number[] = []
  let cx = tableX
  for (const c of cols) {
    colX.push(cx)
    cx += c.w
  }

  const headerH = rowH + 0.8
  const drawVerticalGrid = (y0: number, y1: number) => {
    doc.line(tableX, y0, tableX, y1)
    for (let i = 1; i < cols.length; i++) doc.line(colX[i], y0, colX[i], y1)
    doc.line(tableX + CONTENT_W, y0, tableX + CONTENT_W, y1)
  }

  /** Dibuja la cabecera de columnas en `top` y devuelve el Y donde arranca el cuerpo. */
  const drawHeader = (top: number): number => {
    doc.setFillColor(...GRAY)
    doc.rect(tableX, top, CONTENT_W, headerH, 'F')
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.rect(tableX, top, CONTENT_W, headerH)
    setFont(doc, FONT_SM, 'bold')
    const hy = top + rowH
    cols.forEach((c, i) => {
      const tx =
        c.align === 'right' ? colX[i] + c.w - 1.5 : c.align === 'center' ? colX[i] + c.w / 2 : colX[i] + 1.5
      doc.text(c.label, tx, hy, { align: c.align ?? 'left', maxWidth: c.w - 2 })
      if (i > 0) doc.line(colX[i], top, colX[i], top + headerH)
    })
    doc.line(tableX + CONTENT_W, top, tableX + CONTENT_W, top + headerH)
    doc.line(tableX, top + headerH, tableX + CONTENT_W, top + headerH)
    return top + headerH
  }

  let tableTop = ctx.y
  let bodyStart = drawHeader(tableTop)
  let rowY = bodyStart

  /** Si `h` no entra en lo que queda de la página, cierra el recuadro actual, salta de
   * página y arranca una tabla nueva ahí (con su propia cabecera de columnas). */
  const ensureSpace = (h: number) => {
    if (rowY + h <= maxRowBottom) return
    drawVerticalGrid(tableTop, rowY)
    doc.line(tableX, rowY, tableX + CONTENT_W, rowY)
    doc.addPage()
    tableTop = MARGIN
    bodyStart = drawHeader(tableTop)
    rowY = bodyStart
  }

  const renderItemRow = (it: PrintData['items'][0]) => {
    let desc = receiptItemDisplayDescription(it)
    if (data.fiscal?.has_prepayment_emit) {
      desc = `${desc}\n*** Pago Anticipado ***`
    }
    const descLines = doc.splitTextToSize(desc, cols[3].w - 3)
    const h = rowH * Math.max(1, descLines.length)
    ensureSpace(h)
    setFont(doc, FONT_SM, 'normal')
    const midY = rowY + rowH - 0.5
    doc.text(String(it.quantity), colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text((receiptItemDisplayUnit(it) || 'NIU').slice(0, 8), colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text((it.code || '—').slice(0, 14), colX[2] + 1.5, midY, { maxWidth: cols[2].w - 2 })
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], colX[3] + 1.5, rowY + rowH - 0.5 + i * rowH, { maxWidth: cols[3].w - 3 })
    }
    const pu = receiptItemDisplayUnitPrice(it, formatPlainAmount)
    const tot = receiptItemDisplayTotal(it, formatPlainAmount)
    doc.text(pu, colX[4] + cols[4].w - 1.5, midY, { align: 'right' })
    doc.text(formatPlainAmount(itemLineDiscount(it)), colX[5] + cols[5].w - 1.5, midY, { align: 'right' })
    doc.text(tot, colX[6] + cols[6].w - 1.5, midY, { align: 'right' })
    rowY += h
  }

  for (const it of data.items) renderItemRow(it)

  const prepDeductions = data.fiscal?.prepayment_deductions ?? []
  for (const p of prepDeductions) {
    const desc = prepaymentDeductionDescription(p.related_doc_type, p.document_number)
    const descLines = doc.splitTextToSize(desc, cols[3].w - 3)
    const h = rowH * Math.max(1, descLines.length)
    ensureSpace(h)
    setFont(doc, FONT_SM, 'normal')
    const midY = rowY + rowH - 0.5
    doc.text('1', colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text('NIU', colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text('—', colX[2] + 1.5, midY)
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], colX[3] + 1.5, rowY + rowH - 0.5 + i * rowH, { maxWidth: cols[3].w - 3 })
    }
    const neg = formatPlainAmount(-Math.abs(p.total))
    doc.text(neg, colX[4] + cols[4].w - 1.5, midY, { align: 'right' })
    doc.text('0.00', colX[5] + cols[5].w - 1.5, midY, { align: 'right' })
    doc.text(neg, colX[6] + cols[6].w - 1.5, midY, { align: 'right' })
    rowY += h
  }

  // Filas vacías de relleno hasta el mínimo visual (14) — solo tiene sentido si el
  // contenido real todavía no llegó a esa altura; con más ítems no se agrega nada.
  const filledRows = data.items.length + prepDeductions.length
  const emptyRows = Math.max(0, minBodyRows - filledRows)
  for (let i = 0; i < emptyRows; i++) {
    ensureSpace(rowH)
    rowY += rowH
  }

  drawVerticalGrid(tableTop, rowY)
  doc.line(tableX, rowY, tableX + CONTENT_W, rowY)

  ctx.y = rowY + 5
  return rowY
}

/** Alto estimado del bloque que sigue a la tabla de ítems (totales, "SON:", condición de pago
 *  + QR SUNAT, cuotas, cuentas bancarias, vendedor) — a diferencia de drawLegendAndNotes/
 *  drawFooter, ninguna de las funciones de este bloque tiene salto de página propio, así que
 *  si la tabla de ítems termina cerca del fondo de la hoja (comprobante con muchos ítems) el
 *  QR SUNAT queda cortado a la mitad y el resto (cuentas bancarias, vendedor) termina
 *  dibujado fuera de la página, invisible — bug real reportado con comprobantes largos.
 *
 *  El bloque se dibuja en DOS COLUMNAS en paralelo, no una lista serial: a la derecha van
 *  los totales (+ el QR SUNAT debajo, si es electrónico); a la izquierda van "SON:",
 *  condición/método de pago, el recuadro de detracción, cuotas, cuentas bancarias y
 *  vendedor. Sumar el alto de todos esos elementos como si fueran uno debajo del otro (como
 *  se hacía antes) contaba dos veces el alto real: un comprobante con detracción + cuotas +
 *  cuentas bancarias en la izquierda y el QR en la derecha "necesitaba" en la estimación casi
 *  el doble de lo que en verdad ocupaba, saltando a una página 2 con la hoja 1 casi vacía
 *  (bug reportado con F001-86: factura de 1 solo ítem con detracción). El alto real que hace
 *  falta es el máximo de las dos columnas, no la suma. Sobreestimar cada columna por
 *  separado sigue siendo preferible a quedarse corto: en el peor caso salta una hoja de más,
 *  nunca corta contenido. */
function estimateA4PostTableBlockHeight(data: PrintData, showPaymentCondition: boolean): number {
  const f = data.fiscal
  const isElectronic = isElectronicSunatCode(data.sunat_code)

  // Columna derecha: totales (+ retención/detracción/anticipo) y, si es electrónico, el QR
  // SUNAT justo debajo (drawElectronicPaymentAndQrRow lo engancha después de esta columna).
  let rightH = buildReceiptTotalLines(data).length * (LINE_H + 0.4) + 2
  if (f?.retention_applied) rightH += 2 * (LINE_H + 0.4)
  // Solo NETO A COBRAR queda en la columna de totales (drawRow, LINE_H+0.4). El % y el monto
  // de detracción se dibujan en el recuadro "Información Adicional" — ver más abajo.
  if (f?.has_detraccion) rightH += 1 * (LINE_H + 0.4)
  if (f?.has_prepayment_emit) rightH += LINE_H + 0.4
  if (showPaymentCondition && isElectronic) {
    // El QR es el elemento más alto de esta columna y el que peor se ve cortado a la mitad.
    rightH += 3 + SUNAT_QR_SIZE + (data.sunat_hash?.trim() ? 2 * (LINE_H - 0.3) + 2.5 : 0)
  }

  // Columna izquierda: "SON:", condición/método de pago, recuadro de detracción, cuotas,
  // cuentas bancarias y vendedor — todos en paralelo a la columna derecha, uno debajo del
  // otro entre ellos sí (ese orden sí es serial).
  let leftH = 0
  if (data.legend_text?.trim()) leftH += 2 * LINE_H + 1

  if (showPaymentCondition) {
    if (isElectronic) {
      // drawElectronicPaymentAndQrRow: boxH = pad*2 + payLines.length*(LINE_H+0.2) + 1,
      // más el hueco de 5 con el que sigue el resto de la columna izquierda. +1 línea si hay
      // vuelto (ver drawElectronicPaymentAndQrRow).
      const hasChange = !!data.change_amount && data.change_amount > 0
      const payLines = 2 + Math.max(1, customerPayments(data).length) + (hasChange ? 1 : 0)
      leftH += 2 * 3 + payLines * (LINE_H + 0.2) + 1 + 5
    } else {
      // drawPaymentMethodBox: caja de una sola línea si hay un solo método y sin vuelto (el caso
      // más común); si no, lista con 1 línea de encabezado + 1 por pago + 1 si hay vuelto — mismo
      // cálculo que boxH ahí en cada rama.
      const hasChange = !!data.change_amount && data.change_amount > 0
      if (customerPayments(data).length <= 1 && !hasChange) {
        leftH += LINE_H + 2 * 2.5 + 5
      } else {
        const nvLines = 1 + Math.max(1, customerPayments(data).length) + (hasChange ? 1 : 0)
        leftH += 2 * 2.5 + nvLines * (LINE_H + 0.2) - 0.2 + 5
      }
    }
  }

  // Recuadro "Información Adicional" de detracción (columna izquierda, debajo de condición
  // de pago). La leyenda (texto fijo corto) y la cuenta BN (numérica) nunca envuelven en los
  // 93mm de ancho de columna; solo el bien/servicio y el medio de pago pueden ser largos y
  // ocupar 2 líneas — sobreestimar los 4 igual a 2 líneas hacía saltar a página 2
  // comprobantes que en realidad sí entraban en 1 sola hoja.
  if (f?.has_detraccion) {
    let infoLines = 0
    if (f.detraccion_legend_text) infoLines += 1
    if (f.detraccion_good_code) infoLines += 2
    if (f.detraccion_rate_percent != null) infoLines += 1
    if (f.detraccion_amount != null) infoLines += 1
    if (f.detraccion_pay_constancy_number) infoLines += 1
    if (f.detraccion_payment_method_code) infoLines += 2
    if (f.detraccion_bank_account) infoLines += 1
    leftH += infoLines * (LINE_H - 0.6) + 12
  }

  const installments = data.credit_installments ?? []
  if (installments.length > 0) {
    leftH += LINE_H + 1 + (LINE_H + 0.6) * (1 + installments.length) + 4
  }

  const bankLines =
    (data.bank_accounts ?? []).reduce((n, b) => n + formatBankAccountLines(b).length, 0) +
    (data.payment_wallet?.provider && data.payment_wallet?.phone ? 1 : 0)
  if (bankLines > 0) leftH += LINE_H + 1 + bankLines * LINE_H + 2

  if (data.seller_name?.trim()) leftH += 2 * LINE_H + 3

  return Math.max(leftH, rightH) + 4
}

function drawTotalsRight(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  let y = startY
  const sym = moneySymbol(data.currency)
  const labelX = PAGE_W - MARGIN - 58
  const amountX = PAGE_W - MARGIN

  const drawRow = (label: string, amount: string, bold = false) => {
    setFont(doc, FONT, bold ? 'bold' : 'normal')
    doc.text(label, labelX, y, { maxWidth: 42 })
    doc.text(amount, amountX, y, { align: 'right' })
    y += LINE_H + 0.4
  }

  for (const row of buildReceiptTotalLines(data)) {
    const lbl = row.label.toUpperCase().replace(/:$/, '')
    const amountOnly = row.negative
      ? `- ${Math.abs(row.amount).toFixed(2)}`
      : Math.abs(row.amount).toFixed(2)
    drawRow(`${lbl}: ${sym}`, amountOnly, row.bold)
  }

  const f = data.fiscal
  if (f?.retention_applied) {
    drawRow('RET. IGV (3%):', formatPlainAmount(f.igv_retention_amount ?? 0))
    drawRow(`NETO A COBRAR: ${sym}`, formatPlainAmount(f.net_collectible ?? data.total), true)
  }
  if (f?.has_detraccion) {
    // El % y el monto de la detracción van en el recuadro "Información Adicional" (columna
    // izquierda, drawDetraccionInfoBox) — igual que el PDF del sistema anterior, donde
    // "P. DETRACCIÓN"/"MONTO DETRACCIÓN" viven junto a la cuenta y el bien/servicio, no
    // apretados en esta columna angosta de 58mm. Acá solo queda el neto a cobrar.
    drawRow(`NETO A COBRAR: ${sym}`, formatPlainAmount(f.detraccion_net_payable ?? data.total), true)
  }
  if (f?.has_prepayment_emit) {
    drawRow('ANTICIPO:', f.prepayment_label ?? 'COMPROBANTE DE ANTICIPO', true)
  }

  return y + 2
}

function drawAmountInWords(ctx: A4Ctx, data: PrintData, startY: number): number {
  if (!data.legend_text?.trim()) return startY
  const { doc } = ctx
  setFont(doc, FONT, 'bold')
  const text = `SON: ${data.legend_text.trim().toUpperCase()}`
  const lines = doc.splitTextToSize(text, CONTENT_W * 0.55)
  let y = startY
  for (const line of lines) {
    doc.text(line, MARGIN, y, { maxWidth: CONTENT_W * 0.55 })
    y += LINE_H
  }
  return y + 1
}

type ElectronicRowResult = {
  /** Y para continuar el contenido de la columna izquierda (cuentas bancarias, etc.). */
  leftY: number
  /** Fondo del QR SUNAT (para enganchar debajo el QR de billetera Yape/Plin), o null si no hubo QR. */
  qrBottomY: number | null
  /** Página donde quedó dibujado el QR SUNAT. */
  qrPage: number
}

async function drawElectronicPaymentAndQrRow(
  ctx: A4Ctx,
  data: PrintData,
  startYs: { boxStartY: number; qrStartY: number },
): Promise<ElectronicRowResult> {
  const { doc } = ctx
  const { boxStartY, qrStartY } = startYs
  const leftW = CONTENT_W * 0.5
  const leftX = MARGIN
  const pad = 3

  const sym = moneySymbol(data.currency)
  type PayLine = { text: string; bold?: boolean; bullet?: boolean }
  const payLines: PayLine[] = []
  const cond = String(data.payment_condition ?? '').trim() || (customerPayments(data).length > 0 ? 'Contado' : 'Contado')
  payLines.push({ text: `CONDICIÓN DE PAGO: ${cond}`, bold: true })
  payLines.push({ text: 'PAGOS:', bold: true })
  if (customerPayments(data).length > 0) {
    for (const p of customerPayments(data)) {
      payLines.push({ text: `${salePaymentMethodLabelEs(p.method)}: ${sym} ${formatPlainAmount(p.amount)}`, bullet: true })
    }
  } else {
    payLines.push({ text: primaryPaymentLabel(data), bullet: true })
  }
  // Vuelto: cuánto se entregó de más y se devolvió — va junto a los pagos, no en la columna de
  // totales (esa solo debe mostrar el total neto de la venta).
  if (data.change_amount && data.change_amount > 0) {
    payLines.push({ text: `VUELTO: ${sym} ${formatPlainAmount(data.change_amount)}`, bullet: true })
  }

  const boxH = pad * 2 + payLines.length * (LINE_H + 0.2) + 1
  doc.setLineWidth(0.25)
  doc.setDrawColor(0, 0, 0)
  doc.roundedRect(leftX, boxStartY, leftW, boxH, BOX_RADIUS, BOX_RADIUS)

  let ly = boxStartY + pad + LINE_H - 0.3
  for (const line of payLines) {
    setFont(doc, FONT, line.bold ? 'bold' : 'normal')
    if (line.bullet) {
      doc.text('•', leftX + pad, ly)
      doc.text(line.text, leftX + pad + 3.5, ly, { maxWidth: leftW - pad * 2 - 4 })
    } else {
      doc.text(line.text, leftX + pad, ly, { maxWidth: leftW - pad * 2 })
    }
    ly += LINE_H + 0.2
  }

  const qrSize = SUNAT_QR_SIZE
  const qrX = PAGE_W - MARGIN - qrSize
  let qrBottomY: number | null = null
  const qrPage = doc.getNumberOfPages()

  if (data.qr_data) {
    try {
      const qrUrl = await qrDataUrl(data.qr_data, qrSize)
      doc.addImage(qrUrl, 'PNG', qrX, qrStartY, qrSize, qrSize, undefined, 'NONE')
      qrBottomY = qrStartY + qrSize

      if (data.sunat_hash?.trim()) {
        setFont(doc, FONT_XS, 'normal')
        const hashLines = doc.splitTextToSize(`Código Hash: ${data.sunat_hash.trim()}`, qrSize + 6)
        let hy = qrStartY + qrSize + 2.5
        for (const hl of hashLines) {
          doc.text(hl, qrX + qrSize / 2, hy, { align: 'center', maxWidth: qrSize + 6 })
          hy += LINE_H - 0.3
        }
        qrBottomY = hy - (LINE_H - 0.3)
      }
    } catch {
      /* sin QR */
    }
  }

  // El contenido que sigue (cuentas bancarias, vendedor, términos) va en la columna
  // izquierda igual que la caja de pago, y no se cruza en X con el QR (columna derecha):
  // depende solo de dónde termina la caja, no de la altura del QR (42mm) — antes esperaba
  // el QR completo aunque la caja fuera mucho más corta, dejando un hueco grande sin usar.
  return { leftY: boxStartY + boxH + 5, qrBottomY, qrPage }
}

/**
 * Cotización: recuadro con el método de pago de REFERENCIA (cómo piensa pagar el cliente). No es
 * un cobro; si no se indicó ninguno, no se dibuja nada.
 */
function drawQuotationPaymentRefBox(ctx: A4Ctx, data: PrintData, startY: number): number {
  const refs = data.reference_payments ?? []
  if (refs.length === 0) return startY
  const { doc } = ctx
  const padX = 3
  const padY = 2.5
  const sym = moneySymbol(data.currency)
  type Line = { text: string; bold?: boolean }
  const lines: Line[] = [{ text: 'MÉTODO DE PAGO (REFERENCIA):', bold: true }]
  for (const p of refs) {
    const detail = p.reference?.trim() ? ` (${p.reference.trim()})` : ''
    lines.push({
      text:
        p.amount > 0.009
          ? `${salePaymentMethodLabelEs(p.method)}: ${sym} ${formatPlainAmount(p.amount)}${detail}`
          : `${salePaymentMethodLabelEs(p.method)}${detail}`,
    })
  }
  let maxW = 0
  for (const l of lines) {
    setFont(doc, FONT, l.bold ? 'bold' : 'normal')
    maxW = Math.max(maxW, doc.getTextWidth(l.text))
  }
  const boxW = maxW + padX * 2
  const boxH = padY * 2 + lines.length * (LINE_H + 0.2) - 0.2
  const boxY = startY - LINE_H + 1
  drawDottedRect(doc, MARGIN, boxY, boxW, boxH)
  let ly = boxY + padY + LINE_H - 0.3
  for (const l of lines) {
    setFont(doc, FONT, l.bold ? 'bold' : 'normal')
    doc.text(l.text, MARGIN + padX, ly)
    ly += LINE_H + 0.2
  }
  return boxY + boxH + 5
}

function drawPaymentMethodBox(ctx: A4Ctx, data: PrintData, startY: number): number {
  if (String(data.sunat_code ?? '').trim() === 'QT') return drawQuotationPaymentRefBox(ctx, data, startY)
  const { doc } = ctx
  const padX = 3
  const padY = 2.5
  const boxX = MARGIN
  const hasChange = !!data.change_amount && data.change_amount > 0

  // Caso simple (el más frecuente): un solo método y sin vuelto — una sola línea, como antes.
  if (customerPayments(data).length <= 1 && !hasChange) {
    const y = startY
    const method = primaryPaymentLabel(data)
    setFont(doc, FONT, 'bold')
    const labelPart = 'MÉTODO DE PAGO:'
    const labelW = doc.getTextWidth(`${labelPart} `)
    setFont(doc, FONT, 'normal')
    const methodW = doc.getTextWidth(` ${method}`)
    const boxW = labelW + methodW + padX * 2
    const boxH = LINE_H + padY * 2
    const boxY = y - LINE_H + 1

    drawDottedRect(doc, boxX, boxY, boxW, boxH)
    setFont(doc, FONT, 'bold')
    doc.text(labelPart, boxX + padX, y)
    setFont(doc, FONT, 'normal')
    doc.text(` ${method}`, boxX + padX + labelW, y)

    return boxY + boxH + 5
  }

  // Pago mixto y/o con vuelto: una línea por método con su monto, más el vuelto si corresponde
  // — igual criterio que la caja "PAGOS:" de comprobantes electrónicos
  // (drawElectronicPaymentAndQrRow), para que ambos formatos muestren siempre cuánto se pagó
  // por cada método, no solo el nombre.
  const sym = moneySymbol(data.currency)
  type Line = { text: string; bold?: boolean }
  const lines: Line[] = [{ text: 'MÉTODO DE PAGO:', bold: true }]
  if (customerPayments(data).length > 0) {
    for (const p of customerPayments(data)) {
      lines.push({ text: `${salePaymentMethodLabelEs(p.method)}: ${sym} ${formatPlainAmount(p.amount)}` })
    }
  } else {
    lines.push({ text: primaryPaymentLabel(data) })
  }
  if (hasChange) {
    lines.push({ text: `VUELTO: ${sym} ${formatPlainAmount(data.change_amount as number)}` })
  }

  let maxW = 0
  for (const l of lines) {
    setFont(doc, FONT, l.bold ? 'bold' : 'normal')
    maxW = Math.max(maxW, doc.getTextWidth(l.text))
  }
  const boxW = maxW + padX * 2
  const boxH = padY * 2 + lines.length * (LINE_H + 0.2) - 0.2
  const boxY = startY - LINE_H + 1

  drawDottedRect(doc, boxX, boxY, boxW, boxH)
  let ly = boxY + padY + LINE_H - 0.3
  for (const l of lines) {
    setFont(doc, FONT, l.bold ? 'bold' : 'normal')
    doc.text(l.text, boxX + padX, ly)
    ly += LINE_H + 0.2
  }

  return boxY + boxH + 5
}

/**
 * Recuadro "Información Adicional" de detracción — mismo lugar (columna izquierda, debajo
 * de condición/método de pago) y las mismas etiquetas (LEYENDA / TIPO DE DETRACCIÓN / MEDIO
 * DE PAGO / N° CTA. BANCO NAC.) que el PDF del facturador. Antes esta información iba
 * apretada como texto de 7pt en la columna angosta de totales (58mm) — bug reportado: se
 * veía menos organizada que el PDF del facturador, y además incompleta (ver commit de
 * backend_principal que agrega detraccion_legend_text/detraccion_payment_method_label).
 */
function drawDetraccionInfoBox(ctx: A4Ctx, data: PrintData, startY: number): number {
  const f = data.fiscal
  if (!f?.has_detraccion) return startY
  const { doc } = ctx
  const boxW = CONTENT_W * 0.5
  const boxX = MARGIN
  const pad = 2.5
  const labelW = 38

  type Row = { label: string; value: string }
  const rows: Row[] = []
  if (f.detraccion_legend_text) rows.push({ label: 'LEYENDA:', value: f.detraccion_legend_text })
  if (f.detraccion_good_code) {
    rows.push({
      label: 'TIPO DE DETRACCIÓN:',
      value: f.detraccion_good_label
        ? `${f.detraccion_good_code} - ${f.detraccion_good_label}`
        : f.detraccion_good_code,
    })
  }
  // P. DETRACCIÓN y MONTO DETRACCIÓN: igual que el sistema anterior (recuadro "OPERACIÓN
  // SUJETA A DETRACCIÓN"), en vez de ir junto a los totales en la columna derecha — ver
  // drawTotalsRight, que ya no dibuja estas dos líneas.
  if (f.detraccion_rate_percent != null) {
    rows.push({ label: 'P. DETRACCIÓN:', value: `${f.detraccion_rate_percent.toFixed(2)}%` })
  }
  if (f.detraccion_amount != null) {
    // A pedido del negocio, este monto se redondea al entero más cercano (10.56 → 11, 10.54 →
    // 10) — a diferencia del resto de importes del comprobante, que siempre llevan 2 decimales.
    rows.push({
      label: 'MONTO DETRACCIÓN:',
      value: `${moneySymbol(data.currency)} ${Math.round(f.detraccion_amount)}`,
    })
  }
  if (f.detraccion_pay_constancy_number) {
    rows.push({ label: 'N° CONSTANCIA:', value: f.detraccion_pay_constancy_number })
  }
  if (f.detraccion_payment_method_code) {
    rows.push({
      label: 'MEDIO DE PAGO:',
      value: f.detraccion_payment_method_label
        ? `${f.detraccion_payment_method_code} - ${f.detraccion_payment_method_label}`
        : f.detraccion_payment_method_code,
    })
  }
  if (f.detraccion_bank_account) {
    rows.push({ label: 'N° CTA. BANCO NAC.:', value: f.detraccion_bank_account })
  }
  if (!rows.length) return startY

  const valueW = boxW - pad * 2 - labelW
  setFont(doc, FONT_XS, 'normal')
  const rowLineCounts = rows.map((r) => Math.max(1, doc.splitTextToSize(r.value, valueW).length))
  const rowH = LINE_H - 0.6
  const titleH = LINE_H - 0.4
  const boxH = pad * 2 + titleH + rowLineCounts.reduce((sum, n) => sum + n * rowH, 0)

  const boxY = startY
  doc.setLineWidth(0.25)
  doc.setDrawColor(0, 0, 0)
  doc.roundedRect(boxX, boxY, boxW, boxH, BOX_RADIUS, BOX_RADIUS)

  let y = boxY + pad + LINE_H - 1.4
  setFont(doc, FONT_SM, 'bold')
  doc.text('Información Adicional', boxX + pad, y)
  y += titleH

  rows.forEach((r, i) => {
    setFont(doc, FONT_XS, 'bold')
    doc.text(r.label, boxX + pad, y)
    setFont(doc, FONT_XS, 'normal')
    const lines = doc.splitTextToSize(r.value, valueW)
    lines.forEach((line: string, li: number) => {
      doc.text(line, boxX + pad + labelW, y + li * rowH)
    })
    y += rowLineCounts[i] * rowH
  })

  return boxY + boxH + 3
}

/**
 * Cuotas de una venta a crédito, justo debajo de la condición/método de pago (misma columna
 * izquierda, no se cruza con el QR SUNAT que va a la derecha). Se muestra siempre que haya
 * cuotas, independiente de `showPaymentCondition` (Nota de Venta): es información propia de
 * la venta, no una preferencia de qué tan detallado se ve el método de pago.
 */
function drawCreditInstallmentsTable(ctx: A4Ctx, data: PrintData, startY: number): number {
  const rows = data.credit_installments ?? []
  if (rows.length === 0) return startY
  const { doc } = ctx
  const tableX = MARGIN

  const cols: TableCol[] = [
    { label: 'N°', w: 12, align: 'center' },
    { label: 'VENCIMIENTO', w: 32, align: 'center' },
    { label: 'MONTO', w: 30, align: 'right' },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const colX: number[] = []
  let cx = tableX
  for (const c of cols) {
    colX.push(cx)
    cx += c.w
  }
  const rowH = LINE_H + 0.6

  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('CUOTAS:', tableX, y)
  y += LINE_H + 1

  const tableTop = y
  const headerH = rowH + 0.6
  doc.setFillColor(...GRAY)
  doc.rect(tableX, tableTop, tableW, headerH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.rect(tableX, tableTop, tableW, headerH)

  setFont(doc, FONT_XS, 'bold')
  const hy = tableTop + rowH
  cols.forEach((c, i) => {
    const tx = c.align === 'right' ? colX[i] + c.w - 1.5 : c.align === 'center' ? colX[i] + c.w / 2 : colX[i] + 1.5
    doc.text(c.label, tx, hy, { align: c.align ?? 'left', maxWidth: c.w - 2 })
    if (i > 0) doc.line(colX[i], tableTop, colX[i], tableTop + headerH)
  })
  doc.line(tableX + tableW, tableTop, tableX + tableW, tableTop + headerH)

  let rowY = tableTop + headerH
  setFont(doc, FONT_XS, 'normal')
  for (const inst of rows) {
    const midY = rowY + rowH - 0.5
    doc.text(String(inst.installment_no), colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text(formatDisplayDate(inst.due_date), colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text(
      `${moneySymbol(inst.currency || data.currency)} ${formatPlainAmount(inst.amount)}`,
      colX[2] + cols[2].w - 1.5,
      midY,
      { align: 'right' },
    )
    rowY += rowH
  }
  const bodyBottom = rowY

  for (let i = 1; i < cols.length; i++) doc.line(colX[i], tableTop + headerH, colX[i], bodyBottom)
  doc.line(tableX, tableTop + headerH, tableX, bodyBottom)
  doc.line(tableX + tableW, tableTop + headerH, tableX + tableW, bodyBottom)
  doc.line(tableX, bodyBottom, tableX + tableW, bodyBottom)

  return bodyBottom + 4
}

function drawBankAccounts(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  const banks = data.bank_accounts ?? []
  const wallet = data.payment_wallet
  const lines: string[] = []
  for (const b of banks) {
    lines.push(...formatBankAccountLines(b))
  }
  if (wallet?.provider && wallet.phone && !paymentWalletVisible(data, 'a4')) {
    const wLine = formatWalletAccountLine(wallet.provider, wallet.phone)
    if (wLine) lines.push(wLine)
  }
  if (lines.length === 0) return startY

  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('CUENTAS BANCARIAS:', MARGIN, y)
  y += LINE_H + 1

  setFont(doc, FONT_SM, 'normal')
  doc.setTextColor(0, 0, 0)
  for (const line of lines) {
    doc.text(line, MARGIN, y, { maxWidth: CONTENT_W * 0.72 })
    y += LINE_H
  }

  return y + 2
}

function drawSeller(ctx: A4Ctx, data: PrintData, startY: number): number {
  if (!data.seller_name?.trim()) return startY
  const { doc } = ctx
  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('Vendedor:', MARGIN, y)
  y += LINE_H
  setFont(doc, FONT, 'normal')
  doc.text(data.seller_name.trim(), MARGIN, y)
  return y + LINE_H + 3
}

export async function renderClassicA4(doc: jsPDF, data: PrintData): Promise<void> {
  useA4FontFamily(doc, CLASSIC_FONT_FAMILY)
  const ctx: A4Ctx = { doc, y: MARGIN }
  const nvLayout = getNotaVentaPrintLayout(data.sunat_code)
  const showPaymentCondition = !nvLayout || nvLayout.showPaymentCondition

  await drawHeader(ctx, data, nvLayout)
  drawCustomerBlock(ctx, data, nvLayout)
  // Sección "DETALLE - SERVICIOS DE TRANSPORTE DE CARGA": desactivada a pedido (no es necesaria en
  // el PDF). Se conserva drawTransportDetailBox() para reactivarla descomentando esta línea.
  // drawTransportDetailBox(ctx, data, ctx.y)
  drawItemsTable(ctx, data)

  // Ver estimateA4PostTableBlockHeight: si el bloque de totales/QR/cuentas bancarias no
  // entra completo en lo que queda de esta página, arrancarlo en una hoja nueva.
  const postTableH = estimateA4PostTableBlockHeight(data, showPaymentCondition)
  if (ctx.y + postTableH > PAGE_H - MARGIN) {
    doc.addPage()
    ctx.y = MARGIN
  }

  const sectionY = ctx.y
  const isElectronic = isElectronicSunatCode(data.sunat_code)
  const rightEndY = drawTotalsRight(ctx, data, sectionY)

  let leftY: number
  let sunatQrBottomY: number | null = null
  let sunatQrPage: number | null = null
  if (showPaymentCondition) {
    if (isElectronic) {
      const legendEndY = drawAmountInWords(ctx, data, sectionY)
      // El QR debe esperar a que termine la columna de totales (misma franja X a la
      // derecha) para no solaparse — posición idéntica a antes, no se toca.
      const qrStartY = Math.max(rightEndY, legendEndY) + 3
      // La caja "CONDICIÓN DE PAGO" va en la columna izquierda (no se cruza con los
      // totales en X): no necesita esperarlos, solo el "SON: ..." que tiene encima.
      const boxStartY = legendEndY + 2
      const row = await drawElectronicPaymentAndQrRow(ctx, data, { boxStartY, qrStartY })
      leftY = row.leftY
      sunatQrBottomY = row.qrBottomY
      sunatQrPage = row.qrPage
    } else {
      leftY = drawPaymentMethodBox(ctx, data, sectionY)
    }
  } else {
    leftY = sectionY
  }
  // Recuadro "Información Adicional" de detracción, justo debajo de condición/método de pago
  // (mismo lugar y estilo que en el PDF del facturador).
  leftY = drawDetraccionInfoBox(ctx, data, leftY)
  // Cuotas de venta a crédito, justo debajo de la condición/método de pago.
  leftY = drawCreditInstallmentsTable(ctx, data, leftY)
  // Las cuentas bancarias no dependen de este ajuste: se eligen en Empresa → Comprobantes.
  leftY = drawBankAccounts(ctx, data, leftY)
  leftY = drawSeller(ctx, data, leftY)

  // Términos y condiciones/observaciones pueden ser un texto largo configurado por el
  // negocio: drawLegendAndNotes usa TODO el espacio que quede en esta página y solo salta
  // a una nueva si hace falta (línea por línea, nunca recorta ni oculta el texto).
  const pagesBeforeLegend = doc.getNumberOfPages()
  leftY = drawLegendAndNotes(ctx, data, leftY, isElectronic)
  const pageBroke = doc.getNumberOfPages() > pagesBeforeLegend

  // Si hubo salto de página, rightEndY (totales de la página 1) ya no aplica — el pie va
  // en la página donde terminó el texto, y sin anclar al fondo (evita el hueco enorme
  // entre el fin del texto y el pie en una página de continuación).
  const footerMinY = pageBroke ? leftY : Math.max(leftY, rightEndY)
  await drawFooter(ctx, data, footerMinY, { bottomAnchor: !pageBroke })

  // QR de pago (Yape/Plin): si hay QR del comprobante (boleta/factura), va pegado justo
  // debajo de ese QR, en su misma columna/página — así ambos QR quedan juntos en vez de
  // que el de la billetera aparezca solo al fondo de la página (o en la página de
  // continuación si los términos saltaron de página). Para nota de venta (sin QR SUNAT)
  // se mantiene el pie de página como antes.
  if (paymentWalletVisible(data, 'a4')) {
    if (sunatQrBottomY != null && sunatQrPage != null) {
      const currentPage = doc.getNumberOfPages()
      if (sunatQrPage !== currentPage) doc.setPage(sunatQrPage)
      await renderPaymentWalletBlock(doc, data, 'a4', sunatQrBottomY + 6, PAGE_W, MARGIN, 'right')
      if (sunatQrPage !== currentPage) doc.setPage(currentPage)
    } else {
      const walletBlockH = 42
      await renderPaymentWalletBlock(
        doc,
        data,
        'a4',
        PAGE_H - FOOTER_BOTTOM_MARGIN - walletBlockH,
        PAGE_W,
        MARGIN,
        'right',
      )
    }
  }
}
