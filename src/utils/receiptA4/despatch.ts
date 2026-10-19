import { jsPDF } from 'jspdf'
import type { PrintData } from '@/types/printData'
import { getTipoDocIdentidadShortLabel, isElectronicSunatCode } from '@/constants/sunat'
import { receiptItemDisplayUnit } from '@/utils/receiptBonificacion'
import { PAGE_W, MARGIN, CONTENT_W, LINE_H, FONT_SM, FONT_XS, GRAY, formatDisplayDate, qrDataUrl, type A4Ctx, type TableCol, setFont } from './common'
import { drawHeader } from './modern'

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
export async function renderDespatchA4(doc: jsPDF, data: PrintData): Promise<void> {
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
