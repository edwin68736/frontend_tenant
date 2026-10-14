import { normalizeLogoPrintSize, scaleLogoDimension } from '@/services/printers/logoPrintSize'
import { getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { getTipoDocIdentidadShortLabel, isElectronicSunatCode, isGuiaSunatCode } from '@/constants/sunat'
import {
  prepaymentDeductionDescription,
  receiptDocTypeTitle,
} from '@/utils/fiscalPrepayment'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import {
  receiptItemDisplayDescription,
  receiptItemDisplayTotal,
  receiptItemDisplayUnit,
  receiptItemDisplayUnitPrice,
} from '@/utils/receiptBonificacion'
import { lineGlobalSubtotalDiscount, lineSubtotalDiscount } from '@/utils/receiptDiscount'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import { getCreditNoteReference } from '@/utils/receiptCreditNoteRef'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { DETRACCION_PAYMENT_METHOD_CODE } from '@/utils/fiscalDetraction'
import { formatBankAccountLines, formatWalletAccountLine } from '@/utils/receiptBankAccounts'
import {
  getNotaVentaPrintLayout,
  type NotaVentaPrintLayoutSettings,
} from '@/services/printers/notaVentaPrintLayout'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - 2 * MARGIN
const LINE_H = 4.4
const FONT = 9
const FONT_SM = 8
const FONT_XS = 7
const FONT_LG = 10.5
const FONT_TITLE = 11.5
/** Recuadro R.U.C. / tipo / número de la cabecera. */
const FONT_DOCBOX = 12
/** Recuadros de datos del cliente / comprobante. */
const FIELD_FONT = 7.8
const FIELD_LINE_H = 3.9
const FIELD_PAD = 2
/** Gris claro (~20%) para barra tipo doc. y cabecera tabla */
const GRAY: [number, number, number] = [214, 214, 214]
const GREEN: [number, number, number] = [0, 128, 0]
/** Ancho fijo de etiquetas cliente (alineación tipo factura referencia) */
const CLIENT_LABEL_W = 46
/** Radio de esquina de los recuadros informativos (RUC/tipo doc., condición de pago,
 *  Información Adicional) — look más prolijo, mismo estilo que el PDF del facturador. */
const BOX_RADIUS = 2
/** Tamaño del QR SUNAT en la factura/boleta A4 (antes 42mm, se pidió más chico). Un solo
 *  valor usado tanto al dibujarlo (drawElectronicPaymentAndQrRow) como al estimar el alto
 *  del bloque de totales (estimateA4PostTableBlockHeight) — que ambos lean de la misma
 *  constante evita que se desincronicen, que es justo el bug que causaba el salto de
 *  página de más. */
const SUNAT_QR_SIZE = 34

const FOOTER_BOTTOM_MARGIN = 8

function defaultTukifacWebDisplay(): string {
  return 'www.tukifac.com'
}

function normalizeWebDisplay(raw?: string): string {
  const web = raw?.trim() || defaultTukifacWebDisplay()
  return web.replace(/^https?:\/\//i, '')
}

// Sans-serif (helvetica): más legible y sobrio que la serif de antes — diseño pedido 14-oct-2026.
const FONT_FAMILY = 'helvetica'

function formatDocNumber(data: PrintData): string {
  const n = String(data.number ?? '').trim()
  if (n.includes('-')) return n
  const s = String(data.series ?? '').trim()
  if (s && n) return `${s}-${n}`
  return n || s
}

function formatPlainAmount(n: number): string {
  return n.toFixed(2)
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr?.trim()) return '—'
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return dateStr.slice(0, 10)
  const dmy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return dateStr.trim()
}

function a4DocTypeTitle(data: PrintData): string {
  return receiptDocTypeTitle(data.sunat_code, data.fiscal)
}

function itemLineDiscount(it: PrintData['items'][0]): number {
  return lineSubtotalDiscount(it) + lineGlobalSubtotalDiscount(it)
}

function resolveDueDate(data: PrintData): string {
  return formatDisplayDate(data.valid_until || data.issue_date)
}

/** Pagos a mostrar en "Condición/método de pago": sin la porción de detracción (detraccion_bn),
 * que no la paga el cliente al emisor sino que la deposita en el Banco de la Nación — ya figura
 * en "Información Adicional" y en NETO A COBRAR. */
function customerPayments(data: PrintData): PrintData['payments'] {
  return data.payments.filter((p) => p.method !== DETRACCION_PAYMENT_METHOD_CODE)
}

function primaryPaymentLabel(data: PrintData): string {
  const payments = customerPayments(data)
  if (payments.length > 0) {
    return payments.map((p) => salePaymentMethodLabelEs(p.method)).join(', ')
  }
  const cond = String(data.payment_condition ?? '').trim()
  return cond || 'Contado'
}

function moneySymbol(currency: string): string {
  return currency === 'USD' ? '$' : 'S/'
}

async function qrDataUrl(payload: string, sizeMm: number): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: rasterPxForMm(sizeMm),
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

type A4Ctx = {
  doc: jsPDF
  y: number
}

function setFont(doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
  doc.setFont(FONT_FAMILY, style)
  doc.setFontSize(size)
  doc.setTextColor(0, 0, 0)
}

function drawDottedRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.roundedRect(x, y, w, h, BOX_RADIUS, BOX_RADIUS)
  doc.setLineDashPattern([], 0)
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

/**
 * Cabecera: logo a la izquierda, datos del emisor CENTRADOS en el espacio del medio y recuadro
 * R.U.C. / tipo de comprobante / número a la derecha (diseño pedido por el cliente, 14-oct-2026:
 * más ordenado y legible que la versión anterior con barra gris y datos alineados a la izquierda).
 */
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
  if (showContact && data.company.phone?.trim()) pushInfoLine(`Central telefónica: ${data.company.phone.trim()}`)
  if (showContact && data.company.email?.trim()) pushInfoLine(`Email: ${data.company.email.trim()}`)
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

function currencyLabel(currency: string): string {
  return currency === 'USD' ? 'Dólares' : 'Soles'
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

/**
 * "DETALLE - SERVICIOS DE TRANSPORTE DE CARGA" (solo detracción 1004) — mismo lugar (entre
 * los datos del cliente y la tabla de ítems) y el mismo tipo de recuadro de 2 columnas que el
 * PDF del sistema anterior (facturador-tukifac). Antes esta sección no existía en absoluto en
 * el PDF A4 de Tukifac aunque el backend ya guardaba todos estos datos.
 *
 * El sistema anterior guarda ubigeo (código numérico) y dirección como dos campos separados;
 * Tukifac los compone en un solo string al guardar la venta (ver UbigeoCascadeSelect.tsx /
 * SalesRegisterPage.tsx) para no tocar el contrato de punto_origen/punto_destino que ya
 * consume el backend — por eso acá se muestran como "Punto de origen/destino" en una sola
 * línea en vez de "Ubigeo" + "Dirección" separados.
 *
 * DESACTIVADA: la llamada en renderA4 está comentada (esta sección no se muestra en el PDF).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawTransportDetailBox(ctx: A4Ctx, data: PrintData, startY: number): number {
  const f = data.fiscal
  if (!f?.has_detraccion || !f.detraccion_punto_origen) return startY
  const { doc } = ctx
  const boxX = MARGIN
  const boxW = CONTENT_W
  const pad = 3
  const colW = boxW / 2
  const labelW = 34

  type Cell = { label: string; value: string }
  const cells: (Cell | null)[] = [
    { label: 'PUNTO DE ORIGEN:', value: f.detraccion_punto_origen },
    f.detraccion_punto_destino ? { label: 'PUNTO DE DESTINO:', value: f.detraccion_punto_destino } : null,
    f.detraccion_valor_referencial != null
      ? {
          label: 'VALOR REFERENCIAL:',
          value: `${moneySymbol(data.currency)} ${formatPlainAmount(f.detraccion_valor_referencial)}`,
        }
      : null,
    f.detraccion_carga_efectiva_tm != null
      ? { label: 'CARGA EFECTIVA:', value: `${f.detraccion_carga_efectiva_tm.toFixed(2)} TM` }
      : null,
    f.detraccion_carga_util_tm != null
      ? { label: 'CARGA ÚTIL:', value: `${f.detraccion_carga_util_tm.toFixed(2)} TM` }
      : null,
    f.detraccion_trip_detail ? { label: 'DETALLE DEL VIAJE:', value: f.detraccion_trip_detail } : null,
    f.detraccion_mtc_registro ? { label: 'REGISTRO MTC:', value: f.detraccion_mtc_registro } : null,
    f.detraccion_config_vehicular ? { label: 'CONFIG. VEHICULAR:', value: f.detraccion_config_vehicular } : null,
  ]
  const present = cells.filter((c): c is Cell => c != null)
  if (!present.length) return startY

  // Pares izquierda/derecha en el mismo orden, como el recuadro del sistema anterior.
  const pairs: { left: Cell; right?: Cell }[] = []
  for (let i = 0; i < present.length; i += 2) pairs.push({ left: present[i], right: present[i + 1] })

  setFont(doc, FONT_XS, 'normal')
  const valueW = colW - pad - labelW
  const pairLineCounts = pairs.map((p) => {
    const l = Math.max(1, doc.splitTextToSize(p.left.value, valueW).length)
    const r = p.right ? Math.max(1, doc.splitTextToSize(p.right.value, valueW).length) : 0
    return Math.max(l, r)
  })
  const rowH = LINE_H - 0.6
  const titleH = LINE_H
  const boxH = pad * 2 + titleH + pairLineCounts.reduce((sum, n) => sum + n * rowH, 0)

  const boxY = startY
  doc.setLineWidth(0.25)
  doc.setDrawColor(0, 0, 0)
  doc.roundedRect(boxX, boxY, boxW, boxH, BOX_RADIUS, BOX_RADIUS)

  let y = boxY + pad + LINE_H - 1
  setFont(doc, FONT_SM, 'bold')
  doc.text('DETALLE - SERVICIOS DE TRANSPORTE DE CARGA', boxX + pad, y)
  y += titleH

  pairs.forEach((p, i) => {
    const drawCell = (cell: Cell, x: number) => {
      setFont(doc, FONT_XS, 'bold')
      doc.text(cell.label, x, y)
      setFont(doc, FONT_XS, 'normal')
      const lines = doc.splitTextToSize(cell.value, valueW)
      lines.forEach((line: string, li: number) => doc.text(line, x + labelW, y + li * rowH))
    }
    drawCell(p.left, boxX + pad)
    if (p.right) drawCell(p.right, boxX + colW + pad)
    y += pairLineCounts[i] * rowH
  })

  ctx.y = boxY + boxH + 4
  return ctx.y
}

type TableCol = { label: string; w: number; align?: 'left' | 'right' | 'center' }

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

/**
 * Dibuja una línea en `y`, saltando a una página nueva ANTES si no entra completa en lo
 * que queda de la página actual (deja MARGIN de aire abajo). Devuelve el `y` ya avanzado
 * para la siguiente línea. Usa todo el espacio disponible de la página actual antes de
 * saltar — a diferencia de "medir todo el bloque y decidir de una si cabe o no", que
 * dejaba la página 1 a medio llenar cuando el bloque completo no cabía.
 */
function drawLineWithPageBreak(ctx: A4Ctx, y: number, line: string): number {
  const { doc } = ctx
  let cursorY = y
  if (cursorY + LINE_H > PAGE_H - MARGIN) {
    doc.addPage()
    cursorY = MARGIN
  }
  doc.text(line, MARGIN, cursorY)
  return cursorY + LINE_H
}

/** Dibuja legenda ("Son: ..."), términos y condiciones, y observaciones, con salto de
 * página automático línea por línea si el texto (configurable por el negocio, puede ser
 * largo) no entra completo en lo que queda de la página. Nunca se oculta ni se recorta. */
function drawLegendAndNotes(ctx: A4Ctx, data: PrintData, startY: number, skipLegend = false): number {
  const { doc } = ctx
  let y = startY

  if (data.legend_text && !skipLegend) {
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(`Son: ${data.legend_text}`, CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  if (data.fiscal?.show_terms_conditions && data.fiscal.terms_text?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    y = drawLineWithPageBreak(ctx, y, 'Términos y condiciones:')
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.fiscal.terms_text.trim(), CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  if (data.notes?.trim() && data.notes.trim() !== data.fiscal?.fiscal_observations?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    y = drawLineWithPageBreak(ctx, y, 'Observaciones:')
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.notes.trim(), CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  return y
}

/** Alto del bloque de pie (GRACIAS → Tukifac → URL → notas), sin margen inferior. */
function estimateA4FooterContentHeight(data: PrintData): number {
  let h = LINE_H + 1.2 // GRACIAS
  h += LINE_H + 0.8 // Tukifac!
  h += LINE_H + 0.5 // Comprobante emitido a través de…
  if (isElectronicSunatCode(data.sunat_code)) {
    h += LINE_H - 0.2 + LINE_H
  } else if (data.sunat_code === 'QT') {
    h += LINE_H
  }
  if (data.company.website?.trim()) {
    h += LINE_H * 0.95
  }
  return h
}

async function drawFooter(ctx: A4Ctx, data: PrintData, minY: number, opts?: { bottomAnchor?: boolean }) {
  const { doc } = ctx
  const consultBase = data.company.website?.trim()
  const showElectronic = isElectronicSunatCode(data.sunat_code)
  const showQtNote = data.sunat_code === 'QT'
  // bottomAnchor=false en página de continuación (términos/observaciones largos que ya
  // saltaron de página): forzar el pie al fondo ahí dejaba un hueco enorme entre el fin
  // del texto y el pie. Con false, el pie va justo debajo del contenido.
  const bottomAnchor = opts?.bottomAnchor !== false

  const contentH = estimateA4FooterContentHeight(data)
  const maxStart = PAGE_H - FOOTER_BOTTOM_MARGIN - contentH
  // Gap "ideal" (look habitual, pie separado del contenido) vs. gap mínimo aceptable
  // pegado al contenido. Usar el gap ideal para decidir si el pie "no entra" mandaba a una
  // página nueva casos que sí entraban de sobra con un margen más ajustado — p. ej. cuando
  // estimateA4PostTableBlockHeight se queda corta por un par de mm (un texto que envuelve
  // una línea más de lo estimado), el contenido real termina un poco más abajo de lo
  // previsto y el pie entero saltaba a una hoja 2 casi vacía por esos pocos mm, dejando la
  // hoja 1 con un espacio en blanco enorme. Con el gap mínimo, ese mismo comprobante sigue
  // entrando en una sola página.
  const MIN_GAP = 2
  const IDEAL_GAP = 6
  let y: number
  if (minY + MIN_GAP > maxStart) {
    // Ni con el espacio mínimo entra: página nueva para el pie (una hoja en blanco
    // siempre tiene de sobra para ~15-28mm de pie).
    doc.addPage()
    y = MARGIN
  } else if (bottomAnchor) {
    // Ya sabemos que cabe (aunque sea con el gap mínimo): ancla al fondo, look habitual.
    y = maxStart
  } else {
    // Página de continuación (términos/observaciones largos que ya saltaron de página):
    // pegar el pie justo debajo del contenido, con el gap ideal si cabe o el mínimo que
    // sí quepa. Nunca ancla al fondo aquí — eso es lo que dejaba el hueco enorme entre el
    // fin del texto y el pie en una página de continuación.
    y = Math.min(maxStart, minY + IDEAL_GAP)
  }

  setFont(doc, FONT, 'normal')
  doc.setTextColor(0, 0, 0)
  doc.text('GRACIAS POR SU PREFERENCIA', PAGE_W / 2, y, { align: 'center' })
  y += LINE_H + 1.2

  setFont(doc, FONT_LG, 'bold')
  doc.text('Tukifac!', PAGE_W / 2, y, { align: 'center' })
  y += LINE_H + 0.8

  const webDisplay = normalizeWebDisplay(data.company.website)
  const prefix = 'Comprobante emitido a través de '
  setFont(doc, FONT_SM, 'normal')
  const totalLineW = doc.getTextWidth(prefix + webDisplay)
  const lineStart = PAGE_W / 2 - totalLineW / 2
  doc.setTextColor(0, 0, 0)
  doc.text(prefix, lineStart, y)
  const urlX = lineStart + doc.getTextWidth(prefix)
  doc.setTextColor(...GREEN)
  doc.text(webDisplay, urlX, y)
  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.15)
  doc.line(urlX, y + 0.6, urlX + doc.getTextWidth(webDisplay), y + 0.6)
  doc.setTextColor(0, 0, 0)
  y += LINE_H

  if (showElectronic) {
    setFont(doc, FONT_XS)
    doc.text('Representación impresa del comprobante electrónico', PAGE_W / 2, y, { align: 'center' })
    y += LINE_H - 0.2
    doc.text('Consulte su comprobante en sunat.gob.pe', PAGE_W / 2, y, { align: 'center' })
    y += LINE_H
  } else if (showQtNote) {
    setFont(doc, FONT_XS)
    doc.text('Documento comercial — no válido como comprobante de pago SUNAT', PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W,
    })
    y += LINE_H
  }

  if (consultBase) {
    setFont(doc, 6.5, 'normal')
    const url = consultBase.startsWith('http')
      ? consultBase.replace(/\/+$/, '')
      : `https://${consultBase.replace(/\/+$/, '')}`
    doc.text(`Para consultar el comprobante ingresar a ${url}/buscar`, PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W - 10,
    })
    y += LINE_H * 0.95
  }

  ctx.y = y
}

const BOX_FONT = FONT_SM
const BOX_LINE_H = LINE_H - 0.6
const BOX_PAD_X = 2.5
const BOX_PAD_Y = 1.6
const BOX_GAP_Y = 2

type BoxCell = { label: string; value: string }
type BoxRow = BoxCell[]

/**
 * Caja con título en barra gris (mismo lenguaje visual que drawItemsTable) y filas de
 * campos en grilla de 1 o 2 columnas — así una guía cabe en una sola página en vez de
 * una línea por campo. Cada fila puede envolver a más de una línea (ítem largo como
 * "Dirección"); la altura de la fila se ajusta al contenido más alto de esa fila.
 */
function drawInfoBox(ctx: A4Ctx, title: string, rows: BoxRow[]) {
  const { doc } = ctx
  const boxX = MARGIN
  const boxTop = ctx.y
  const titleH = BOX_LINE_H + 1.6

  // getTextWidth/splitTextToSize dependen de la fuente actual del doc: fijarla ANTES de
  // medir, si no la envoltura de línea queda calculada con la fuente que haya quedado
  // puesta por lo último dibujado (drawHeader, etc.) en vez de BOX_FONT.
  setFont(doc, BOX_FONT, 'bold')

  // Primera pasada: envolver cada celda y calcular alto real de cada fila.
  const wrapped = rows.map((row) => {
    const colW = CONTENT_W / row.length
    return row.map((cell) => {
      const labelW = doc.getTextWidth(`${cell.label}: `) + 1
      const valueMaxW = colW - BOX_PAD_X * 2 - labelW
      const lines: string[] = doc.splitTextToSize(cell.value || '—', Math.max(10, valueMaxW))
      return { ...cell, labelW, colW, lines: lines.length ? lines : ['—'] }
    })
  })
  const rowHeights = wrapped.map((row) => Math.max(...row.map((c) => c.lines.length)) * BOX_LINE_H)
  const bodyH = rowHeights.reduce((s, h) => s + h, 0) + BOX_PAD_Y * 2

  doc.setFillColor(...GRAY)
  doc.rect(boxX, boxTop, CONTENT_W, titleH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.rect(boxX, boxTop, CONTENT_W, titleH)
  setFont(doc, BOX_FONT, 'bold')
  doc.text(title, boxX + BOX_PAD_X, boxTop + titleH - 1.6)

  doc.rect(boxX, boxTop + titleH, CONTENT_W, bodyH)

  let y = boxTop + titleH + BOX_PAD_Y + BOX_LINE_H - 0.8
  wrapped.forEach((row, i) => {
    let x = boxX
    for (const cell of row) {
      setFont(doc, BOX_FONT, 'bold')
      doc.text(`${cell.label}:`, x + BOX_PAD_X, y)
      setFont(doc, BOX_FONT, 'normal')
      cell.lines.forEach((line, li) => {
        doc.text(line, x + BOX_PAD_X + cell.labelW, y + li * BOX_LINE_H)
      })
      x += cell.colW
    }
    y += rowHeights[i]
  })

  ctx.y = boxTop + titleH + bodyH + BOX_GAP_Y
}

function drawDespatchInfoBoxes(ctx: A4Ctx, data: PrintData) {
  const d = data.despatch
  if (!d) return

  const docLabel = getTipoDocIdentidadShortLabel(d.destinatario.doc_type || '6').toUpperCase()
  drawInfoBox(ctx, 'DESTINATARIO', [
    [
      { label: 'Razón Social', value: d.destinatario.name || '—' },
      { label: docLabel, value: d.destinatario.doc_number || '—' },
    ],
    [{ label: 'Dirección', value: d.destinatario.address || '—' }],
  ])

  if (d.related_doc_number) {
    drawInfoBox(ctx, 'DOCUMENTO RELACIONADO', [
      [{ label: d.related_doc_label || 'Documento', value: d.related_doc_number }],
    ])
  }

  const peso = d.peso_total ? `${d.peso_total.toFixed(2)} ${d.und_peso || 'KGM'}` : '—'
  const partida = [d.partida.ubigueo, d.partida.address].filter(Boolean).join(' — ')
  const llegada = [d.llegada.ubigueo, d.llegada.address].filter(Boolean).join(' — ')
  const envioRows: BoxRow[] = [
    [
      { label: 'Fecha Emisión', value: formatDisplayDate(data.issue_date) },
      { label: 'Fecha Inicio de Traslado', value: d.fecha_traslado || '—' },
    ],
    [
      { label: 'Motivo de Traslado', value: d.motivo_traslado || '—' },
      { label: 'Modalidad de Transporte', value: d.modalidad || '—' },
    ],
    [
      { label: 'Peso Bruto Total', value: peso },
      { label: 'N° de Bultos', value: d.num_bultos ? String(d.num_bultos) : '—' },
    ],
    [{ label: 'P. Partida', value: partida || '—' }],
    [{ label: 'P. Llegada', value: llegada || '—' }],
  ]
  drawInfoBox(ctx, 'ENVÍO', envioRows)

  if (d.vehiculo || d.choferes?.length || d.transportista) {
    const row: BoxRow = []
    if (d.vehiculo?.placa) row.push({ label: 'Vehículo Principal', value: d.vehiculo.placa })
    const chofer = d.choferes?.[0]
    if (chofer) {
      const parts = [chofer.doc_number ? `DNI ${chofer.doc_number}` : '', chofer.name].filter(Boolean).join(' — ')
      row.push({ label: 'Conductor Principal', value: parts || '—' })
    }
    const transporteRows: BoxRow[] = row.length ? [row] : []
    if (d.transportista) {
      const t = [d.transportista.name, d.transportista.doc_number ? `RUC ${d.transportista.doc_number}` : '']
        .filter(Boolean)
        .join(' — ')
      transporteRows.push([{ label: 'Transportista', value: t || '—' }])
    }
    for (const ch of (d.choferes ?? []).slice(1)) {
      const parts = [ch.name, ch.doc_number ? `DNI ${ch.doc_number}` : '', ch.licencia ? `Lic. ${ch.licencia}` : '']
        .filter(Boolean)
        .join(' — ')
      transporteRows.push([{ label: 'Conductor Adicional', value: parts || '—' }])
    }
    if (transporteRows.length) drawInfoBox(ctx, 'TRANSPORTE', transporteRows)
  }
}

/** Misma grilla visual que drawItemsTable, sin columnas de precio (una guía no factura
 *  montos) y sin filas vacías de relleno — compacta, a diferencia de la tabla de venta que
 *  sí necesita un alto mínimo para no verse vacía en un ticket de compra. */
function drawDespatchItemsTable(ctx: A4Ctx, data: PrintData): number {
  const { doc } = ctx
  const tableTop = ctx.y
  const tableX = MARGIN
  const rowH = LINE_H - 0.4

  const cols: TableCol[] = [
    { label: 'ITEM', w: 12, align: 'center' },
    { label: 'CÓDIGO', w: 30, align: 'left' },
    { label: 'DESCRIPCIÓN', w: CONTENT_W - 12 - 30 - 22 - 22, align: 'left' },
    { label: 'UNIDAD', w: 22, align: 'center' },
    { label: 'CANTIDAD', w: 22, align: 'center' },
  ]
  const colX: number[] = []
  let cx = tableX
  for (const c of cols) {
    colX.push(cx)
    cx += c.w
  }

  const headerH = rowH + 0.8
  doc.setFillColor(...GRAY)
  doc.rect(tableX, tableTop, CONTENT_W, headerH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.rect(tableX, tableTop, CONTENT_W, headerH)

  setFont(doc, FONT_XS, 'bold')
  const hy = tableTop + headerH - 1.6
  cols.forEach((c, i) => {
    const tx =
      c.align === 'right' ? colX[i] + c.w - 1.5 : c.align === 'center' ? colX[i] + c.w / 2 : colX[i] + 1.5
    doc.text(c.label, tx, hy, { align: c.align ?? 'left', maxWidth: c.w - 2 })
    if (i > 0) doc.line(colX[i], tableTop, colX[i], tableTop + headerH)
  })
  doc.line(tableX + CONTENT_W, tableTop, tableX + CONTENT_W, tableTop + headerH)

  let rowY = tableTop + headerH
  data.items.forEach((it, idx) => {
    const descLines = doc.splitTextToSize(it.description || '—', cols[2].w - 3)
    const h = rowH * Math.max(1, descLines.length)
    setFont(doc, FONT_XS, 'normal')
    const midY = rowY + rowH - 0.6
    doc.text(String(idx + 1), colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text((it.code || '—').slice(0, 18), colX[1] + 1.5, midY, { maxWidth: cols[1].w - 2 })
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], colX[2] + 1.5, rowY + rowH - 0.6 + i * rowH, { maxWidth: cols[2].w - 3 })
    }
    doc.text((receiptItemDisplayUnit(it) || 'NIU').slice(0, 8), colX[3] + cols[3].w / 2, midY, { align: 'center' })
    doc.text(String(it.quantity), colX[4] + cols[4].w / 2, midY, { align: 'center' })
    rowY += h
  })

  doc.line(tableX, tableTop + headerH, tableX + CONTENT_W, tableTop + headerH)
  doc.line(tableX, tableTop, tableX, rowY)
  for (let i = 1; i < cols.length; i++) doc.line(colX[i], tableTop, colX[i], rowY)
  doc.line(tableX + CONTENT_W, tableTop, tableX + CONTENT_W, rowY)
  doc.line(tableX, rowY, tableX + CONTENT_W, rowY)

  ctx.y = rowY + BOX_GAP_Y + 1
  return rowY
}

/** Guía de remisión (09/31): documento de traslado, no de cobro — layout propio y compacto
 *  (cajas con grilla de 2 columnas, no una línea por campo), sin método de pago, cuentas
 *  bancarias ni QR de billetera. Reusa el header del template general; pie propio y minimal
 *  — un documento de traslado no lleva mensaje de agradecimiento de venta. */
async function renderDespatchA4(doc: jsPDF, data: PrintData): Promise<void> {
  const ctx: A4Ctx = { doc, y: MARGIN }
  await drawHeader(ctx, data, null)
  drawDespatchInfoBoxes(ctx, data)
  drawDespatchItemsTable(ctx, data)

  // QR SUNAT — obligatorio en la representación impresa de toda guía electrónica desde la
  // GRE 2022 (RS 317-2021/SUNAT y modificatorias). Compacto: sin esto la plantilla genérica
  // no lo dibujaba nunca para guías (isElectronicSunatCode solo cubre 01/03).
  const qrSize = 26
  let qrBottom = ctx.y
  if (data.qr_data) {
    try {
      const qrX = PAGE_W - MARGIN - qrSize
      const qrY = ctx.y
      const qrUrl = await qrDataUrl(data.qr_data, qrSize)
      doc.addImage(qrUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'NONE')
      setFont(doc, 6, 'normal')
      let hy = qrY + qrSize + 2.2
      if (data.sunat_hash?.trim()) {
        const hashLines = doc.splitTextToSize(`Hash: ${data.sunat_hash.trim()}`, qrSize + 4)
        for (const hl of hashLines) {
          doc.text(hl, qrX + qrSize / 2, hy, { align: 'center', maxWidth: qrSize + 4 })
          hy += 2.6
        }
      }
      qrBottom = hy
    } catch {
      /* sin QR */
    }
  }

  setFont(doc, FONT_XS, 'normal')
  const legendY = Math.max(ctx.y + LINE_H, qrBottom - qrSize - 4)
  doc.text('Representación impresa de la guía de remisión electrónica.', MARGIN, legendY)
  const consultBase = data.company.website?.trim()
  let footerY = legendY
  if (consultBase) {
    const url = consultBase.startsWith('http')
      ? consultBase.replace(/\/+$/, '')
      : `https://${consultBase.replace(/\/+$/, '')}`
    footerY += LINE_H - 1
    doc.text(`Consulte esta guía en ${url}/buscar`, MARGIN, footerY)
  }

  ctx.y = Math.max(footerY, qrBottom) + 2
}

export async function renderReceiptA4(doc: jsPDF, data: PrintData): Promise<void> {
  if (isGuiaSunatCode(data.sunat_code) && data.despatch) {
    await renderDespatchA4(doc, data)
    return
  }
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
