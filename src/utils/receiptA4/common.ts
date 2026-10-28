import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { isElectronicSunatCode } from '@/constants/sunat'
import { receiptDocTypeTitle } from '@/utils/fiscalPrepayment'
import { lineGlobalSubtotalDiscount, lineSubtotalDiscount } from '@/utils/receiptDiscount'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { DETRACCION_PAYMENT_METHOD_CODE } from '@/utils/fiscalDetraction'

export const PAGE_W = 210

export const PAGE_H = 297

export const MARGIN = 12

export const CONTENT_W = PAGE_W - 2 * MARGIN

export const LINE_H = 4.4

export const FONT = 9

export const FONT_SM = 8

export const FONT_XS = 7

export const FONT_LG = 10.5

export const FONT_TITLE = 11.5

/** Gris claro (~20%) para barra tipo doc. y cabecera tabla */
export const GRAY: [number, number, number] = [214, 214, 214]

export const GREEN: [number, number, number] = [0, 128, 0]

/** Ancho fijo de etiquetas cliente (alineación tipo factura referencia) */
export const CLIENT_LABEL_W = 46

/** Radio de esquina de los recuadros informativos (RUC/tipo doc., condición de pago,
 *  Información Adicional) — look más prolijo, mismo estilo que el PDF del facturador. */
export const BOX_RADIUS = 2

/** Tamaño del QR SUNAT en la factura/boleta A4 (antes 42mm, se pidió más chico). Un solo
 *  valor usado tanto al dibujarlo (drawElectronicPaymentAndQrRow) como al estimar el alto
 *  del bloque de totales (estimateA4PostTableBlockHeight) — que ambos lean de la misma
 *  constante evita que se desincronicen, que es justo el bug que causaba el salto de
 *  página de más. */
export const SUNAT_QR_SIZE = 34

export const FOOTER_BOTTOM_MARGIN = 8

export function defaultTukifacWebDisplay(): string {
  return 'www.tukifac.com'
}

export function normalizeWebDisplay(raw?: string): string {
  const web = raw?.trim() || defaultTukifacWebDisplay()
  return web.replace(/^https?:\/\//i, '')
}

export function formatDocNumber(data: PrintData): string {
  const n = String(data.number ?? '').trim()
  if (n.includes('-')) return n
  const s = String(data.series ?? '').trim()
  if (s && n) return `${s}-${n}`
  return n || s
}

export function formatPlainAmount(n: number): string {
  return n.toFixed(2)
}

export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr?.trim()) return '—'
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return dateStr.slice(0, 10)
  const dmy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return dateStr.trim()
}

export function a4DocTypeTitle(data: PrintData): string {
  return receiptDocTypeTitle(data.sunat_code, data.fiscal, data.doc_type)
}

export function itemLineDiscount(it: PrintData['items'][0]): number {
  return lineSubtotalDiscount(it) + lineGlobalSubtotalDiscount(it)
}

export function resolveDueDate(data: PrintData): string {
  return formatDisplayDate(data.valid_until || data.issue_date)
}

/** Pagos a mostrar en "Condición/método de pago": sin la porción de detracción (detraccion_bn),
 * que no la paga el cliente al emisor sino que la deposita en el Banco de la Nación — ya figura
 * en "Información Adicional" y en NETO A COBRAR. */
export function customerPayments(data: PrintData): PrintData['payments'] {
  return data.payments.filter((p) => p.method !== DETRACCION_PAYMENT_METHOD_CODE)
}

export function primaryPaymentLabel(data: PrintData): string {
  const payments = customerPayments(data)
  if (payments.length > 0) {
    return payments.map((p) => salePaymentMethodLabelEs(p.method)).join(', ')
  }
  const cond = String(data.payment_condition ?? '').trim()
  return cond || 'Contado'
}

export function moneySymbol(currency: string): string {
  return currency === 'USD' ? '$' : 'S/'
}

export async function qrDataUrl(payload: string, sizeMm: number): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: rasterPxForMm(sizeMm),
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

export type A4Ctx = {
  doc: jsPDF
  y: number
}

export function drawDottedRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.roundedRect(x, y, w, h, BOX_RADIUS, BOX_RADIUS)
  doc.setLineDashPattern([], 0)
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
export function drawTransportDetailBox(ctx: A4Ctx, data: PrintData, startY: number): number {
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

/**
 * Dibuja una línea en `y`, saltando a una página nueva ANTES si no entra completa en lo
 * que queda de la página actual (deja MARGIN de aire abajo). Devuelve el `y` ya avanzado
 * para la siguiente línea. Usa todo el espacio disponible de la página actual antes de
 * saltar — a diferencia de "medir todo el bloque y decidir de una si cabe o no", que
 * dejaba la página 1 a medio llenar cuando el bloque completo no cabía.
 */
export function drawLineWithPageBreak(ctx: A4Ctx, y: number, line: string): number {
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
export function drawLegendAndNotes(ctx: A4Ctx, data: PrintData, startY: number, skipLegend = false): number {
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
export function estimateA4FooterContentHeight(data: PrintData): number {
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

export async function drawFooter(ctx: A4Ctx, data: PrintData, minY: number, opts?: { bottomAnchor?: boolean }) {
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

/** Familia tipográfica de cada documento: la fija el diseño al empezar a dibujar (ver useA4FontFamily). Va por
 *  documento (WeakMap) y no en una variable global para que dos PDFs generándose a la vez no se pisen. */
const fontFamilies = new WeakMap<jsPDF, string>()

export function useA4FontFamily(doc: jsPDF, family: string) {
  fontFamilies.set(doc, family)
}

export function setFont(doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
  doc.setFont(fontFamilies.get(doc) ?? 'helvetica', style)
  doc.setFontSize(size)
  doc.setTextColor(0, 0, 0)
}

export type TableCol = { label: string; w: number; align?: 'left' | 'right' | 'center' }

/** Moneda legible del comprobante para la etiqueta «Moneda». */
export function currencyLabel(currency: string): string {
  return currency === 'USD' ? 'Dólares' : 'Soles'
}

/** Teléfono y correo del emisor para la cabecera: solo los que existen (antes salía «Central telefónica:» vacío). */
export function issuerContactLines(data: PrintData): string[] {
  const lines: string[] = []
  const phone = data.company.phone?.trim()
  const email = data.company.email?.trim()
  if (phone) lines.push(`Central telefónica: ${phone}`)
  if (email) lines.push(`Email: ${email}`)
  return lines
}

/** Hora de emisión, moneda y tipo de cambio (USD) del comprobante, en un solo texto corto. */
export function issueMetaText(data: PrintData): string {
  const parts: string[] = []
  if (data.issue_time?.trim()) parts.push(`Hora: ${data.issue_time.trim().slice(0, 8)}`)
  parts.push(`Moneda: ${currencyLabel(data.currency)}`)
  if (data.currency === 'USD' && data.exchange_rate) parts.push(`T.C.: ${data.exchange_rate}`)
  return parts.join('    ')
}
