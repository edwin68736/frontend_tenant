import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import { cashbankService, type CashSession } from '@/services/cashbank.service'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import { loadBranchPrintIdentity } from '@/lib/branchIdentity/store'
import { getConfiguredPrinter, isNativePrintAvailable, printRawEscPos } from '@/services/printers.service'
import { downloadJsPdf } from '@/utils/downloadBlob'
import { normalizeTextForTicketPrint } from '@/utils/normalizeTextForTicketPrint'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
import {
  buildCashSessionDetailLines,
  type CashSessionDetailData,
  type TicketLine,
} from '@/utils/cashSessionDetailLines'
import { printTicketPdfDocument, ticketLayoutWidthMm } from '@/utils/receiptPng'
import { configuredTicketPaperMm, escposColumnsForPaper, type TicketPaperWidthMm } from '@/utils/receiptTicketPaper'

/** Reúne todo lo que el detalle necesita (reporte, comprobantes, productos, empresa y fila de sesión). */
export async function loadCashSessionDetailData(
  sessionId: number,
  sessionRow?: CashSession | null,
): Promise<CashSessionDetailData> {
  const [report, documents, products, row] = await Promise.all([
    cashbankService.getSessionReport(sessionId),
    cashbankService.getSessionDocumentsReport(sessionId),
    cashbankService.getSessionProductsReport(sessionId),
    sessionRow ? Promise.resolve(sessionRow) : cashbankService.getSession(sessionId).catch(() => null),
  ])
  // closeSession/getSession no traen el nombre de quien cerró: el listado sí.
  let sessionData = row ?? null
  if (sessionData && sessionData.status === 'closed' && !sessionData.closed_by_name) {
    const listed = await cashbankService.listSessions(report.session.branch_id).catch(() => [] as CashSession[])
    const match = listed.find((s) => s.id === sessionId)
    if (match) sessionData = { ...sessionData, ...match }
  }
  const cfg = getCompanyConfigCache()
  // Dirección de la SUCURSAL de la sesión, con respaldo a la empresa.
  const issuer = await loadBranchPrintIdentity({ id: report.session.branch_id, name: report.session.branch_name })
  return {
    company: {
      name: cfg?.trade_name?.trim() || cfg?.business_name?.trim() || '',
      ruc: cfg?.ruc?.trim() || '',
      address: issuer.address || '',
    },
    session: sessionData,
    report,
    documents,
    products: products ?? [],
    methodLabel: formatPaymentMethodLabel,
    footer: `${TUKIFAC_APP_NAME} - Sistema POS`,
  }
}

/* ───────────── ESC/POS ───────────── */

function escposBytes(lines: TicketLine[], cols: number): Uint8Array {
  const out: number[] = [0x1b, 0x40]
  const enc = new TextEncoder()
  let align: 'left' | 'center' | 'right' = 'left'
  let bold = false
  let big = false
  for (const l of lines) {
    const a = l.align ?? 'left'
    if (a !== align) {
      out.push(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2)
      align = a
    }
    if (Boolean(l.bold) !== bold) {
      out.push(0x1b, 0x45, l.bold ? 1 : 0)
      bold = Boolean(l.bold)
    }
    if (Boolean(l.big) !== big) {
      out.push(0x1d, 0x21, l.big ? 0x11 : 0x00)
      big = Boolean(l.big)
    }
    const text = normalizeTextForTicketPrint(l.text).slice(0, l.big ? Math.floor(cols / 2) : cols)
    out.push(...Array.from(enc.encode(`${text}\n`)))
  }
  out.push(0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00, 0x1b, 0x61, 0x00)
  out.push(...Array.from(enc.encode('\n\n\n')))
  out.push(0x1d, 0x56, 0x41, 0x10)
  return new Uint8Array(out)
}

/* ───────────── PDF (una sola hoja larga, tipografía monoespaciada) ───────────── */

export function buildCashSessionDetailPdf(lines: TicketLine[], paperMm: TicketPaperWidthMm): jsPDF {
  const cols = escposColumnsForPaper(paperMm)
  const pageW = ticketLayoutWidthMm(paperMm)
  const margin = paperMm === 58 ? 1.5 : 3
  const usable = pageW - margin * 2
  const charW = usable / cols
  const fontPt = charW / 0.6 / 0.3528
  const lineH = fontPt * 0.3528 * 1.18
  const height = Math.max(40, margin * 2 + lines.length * lineH + 6)
  const doc = new jsPDF({ unit: 'mm', format: [pageW, height] })
  doc.setTextColor(0, 0, 0)
  let y = margin + lineH * 0.8
  for (const l of lines) {
    const bigScale = l.big ? 2 : 1
    doc.setFont('courier', l.bold ? 'bold' : 'normal')
    doc.setFontSize(fontPt * bigScale)
    const text = normalizeTextForTicketPrint(l.text)
    const w = text.length * charW * bigScale
    const x = l.align === 'center' ? margin + (usable - w) / 2 : l.align === 'right' ? margin + usable - w : margin
    if (l.big) y += lineH * 0.5
    doc.text(text, Math.max(margin, x), y)
    y += lineH * (l.big ? 1.5 : 1)
  }
  return doc
}

async function buildPdfFor(data: CashSessionDetailData): Promise<jsPDF> {
  const paper = configuredTicketPaperMm()
  return buildCashSessionDetailPdf(buildCashSessionDetailLines(data, escposColumnsForPaper(paper)), paper)
}

/* ───────────── Acciones ───────────── */

/**
 * Imprime el detalle de caja: impresora térmica configurada (documentos) cuando hay impresión
 * directa; si no, vista de impresión del navegador con la hoja del ancho de rollo configurado.
 */
export async function printCashSessionDetail(
  sessionId: number,
  opts?: { sessionRow?: CashSession | null; quiet?: boolean },
): Promise<boolean> {
  const toastId = opts?.quiet ? undefined : toast.loading('Preparando detalle de caja…')
  try {
    const data = await loadCashSessionDetailData(sessionId, opts?.sessionRow)
    const cfg = isNativePrintAvailable() ? getConfiguredPrinter('documentos') : null
    if (cfg) {
      const cols = escposColumnsForPaper(cfg.paperWidthMm)
      await printRawEscPos({
        ...cfg,
        data: escposBytes(buildCashSessionDetailLines(data, cols), cols),
        docName: `${TUKIFAC_APP_NAME} - Detalle de caja`,
      })
    } else {
      const paper = configuredTicketPaperMm()
      await printTicketPdfDocument(await buildPdfFor(data), paper)
    }
    if (toastId !== undefined) toast.success('Detalle de caja enviado a imprimir', { id: toastId })
    return true
  } catch (e) {
    console.error('[caja] imprimir detalle', e)
    const msg = e instanceof Error && e.message ? e.message : 'No se pudo imprimir el detalle de caja'
    if (toastId !== undefined) toast.error(msg, { id: toastId })
    else toast.error(msg)
    return false
  }
}

/** Descarga el mismo detalle como PDF de ticket (ancho de rollo configurado). */
export async function downloadCashSessionDetailPdf(sessionId: number, opts?: { sessionRow?: CashSession | null }): Promise<void> {
  const data = await loadCashSessionDetailData(sessionId, opts?.sessionRow)
  await downloadJsPdf(await buildPdfFor(data), `detalle-caja-${sessionId}.pdf`)
}

/** Muestra el PDF ticket en el visor global de la app. */
export async function openCashSessionDetailPdfViewer(sessionId: number, opts?: { sessionRow?: CashSession | null }): Promise<void> {
  const data = await loadCashSessionDetailData(sessionId, opts?.sessionRow)
  const url = URL.createObjectURL((await buildPdfFor(data)).output('blob'))
  openPdfViewer({
    url,
    title: `Detalle de caja #${sessionId}`,
    fileName: `detalle-caja-${sessionId}.pdf`,
    onClose: () => URL.revokeObjectURL(url),
  })
}
