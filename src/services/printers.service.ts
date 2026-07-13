import type { PrintData } from '@/types/printData'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { isElectronicSunatCode } from '@/constants/sunat'
import { isTauriDesktop } from '@/lib/platform/detect'
import {
  buildEscPosCenteredTextRaster,
  buildEscPosLogoRaster,
  buildEscPosPayConditionSunatRowRaster,
  buildEscPosWalletQrRaster,
} from '@/utils/escposRasterImage'
import { bankAccountTextLines, paymentConditionLeftLines } from '@/utils/receiptTicketFooter'
import { paymentWalletVisible, walletProviderLabel } from '@/utils/receiptPaymentWallet'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { normalizeTextForTicketPrint } from '@/utils/normalizeTextForTicketPrint'
import { buildReceiptTotalLines, formatReceiptTotalAmount } from '@/utils/receiptTotals'
import {
  prepaymentDeductionDescription,
  receiptDocTypeTitle,
} from '@/utils/fiscalPrepayment'
import {
  receiptItemDisplayDescription,
  receiptItemDisplayTotal,
  receiptItemDisplayUnitPrice,
} from '@/utils/receiptBonificacion'
import { trimCompanyAdditionalNotes, wrapCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
import { escposColumnsForPaper } from '@/utils/receiptTicketPaper'
import {
  getConfiguredComandaDefaultPrinter,
  getConfiguredComandaPrinter,
  isComandaAutoPrintEnabled,
} from '@/services/printers/comandas'
import { resolvePrinterConfig } from '@/services/printers/resolve'
import { getNotaVentaPrintLayout, type NotaVentaPrintLayoutSettings } from '@/services/printers/notaVentaPrintLayout'
import {
  clampPort,
  DEFAULT_TCP_PORT,
  loadStoredPrinterSettings,
  normalizeSlot,
} from '@/services/printers/storage'
import { sendEscPosPayload, isNativePrintAvailable } from '@/services/printers/transport'
import type {
  PrinterConfig,
  PrinterConnectionMode,
  PrinterKind,
  PrinterPaperWidth,
} from '@/services/printers/types'

export type {
  BluetoothDeviceInfo,
  PrinterConfig,
  PrinterConnectionMode,
  PrinterKind,
  PrinterPaperWidth,
  PrinterPlatformCapabilities,
  StoredPrinterSettings,
} from '@/services/printers/types'
export {
  availableConnectionModes,
  connectionModeLabel,
  defaultConnectionForPlatform,
  getPrinterPlatformCapabilities,
} from '@/services/printers/platform'
export {
  clampPort,
  DEFAULT_TCP_PORT,
  emptyPrinterSettings,
  loadStoredPrinterSettings,
  normalizeSlot,
  PRINTER_SETTINGS_STORAGE_KEY_V3,
  saveStoredPrinterSettings,
} from '@/services/printers/storage'
export {
  checkBluetoothPermissions,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  ensureBluetoothPermissions,
  getBluetoothConnectionStatus,
  listPairedBluetoothPrinters,
  requestBluetoothPermissions,
  scanBluetoothPrinters,
} from '@/services/printers/bluetooth'
export {
  getConfiguredComandaDefaultPrinter,
  getConfiguredComandaPrinter,
  isComandaAutoPrintEnabled,
} from '@/services/printers/comandas'
export { isPrinterConfigReady, resolvePrinterConfig } from '@/services/printers/resolve'
export { isNativePrintAvailable, sendEscPosPayload } from '@/services/printers/transport'

/** @deprecated Usar PRINTER_SETTINGS_STORAGE_KEY_V3 */
export const PRINTER_SETTINGS_STORAGE_KEY = 'tukichef_kitchen_printer_settings_v3'

/** Configuración lista para imprimir (null = falta completar datos según el modo). */
export function getConfiguredPrinter(kind: PrinterKind): PrinterConfig | null {
  if (kind === 'comandas') {
    return getConfiguredComandaDefaultPrinter()
  }
  const settings = loadStoredPrinterSettings()
  const cfg = normalizeSlot(kind === 'precuenta' ? settings.precuenta : settings.documentos)
  return resolvePrinterConfig(cfg)
}

export function isAutoPrintEnabled(kind: PrinterKind): boolean {
  if (kind === 'comandas') return isComandaAutoPrintEnabled()
  const settings = loadStoredPrinterSettings()
  const cfg = kind === 'precuenta' ? settings.precuenta : settings.documentos
  return Boolean(cfg.autoPrint)
}

export function isTauri(): boolean {
  return isTauriDesktop()
}

export function isWindowsDesktop(): boolean {
  return isTauriDesktop()
}

export async function listInstalledPrinters(): Promise<string[]> {
  if (!isTauri()) return []
  const { invoke } = await import('@tauri-apps/api/core')
  const printers = await invoke<string[]>('list_printers')
  return Array.isArray(printers) ? printers : []
}

function buildTestEscPosTicket(kind: PrinterKind, paperWidthMm: PrinterPaperWidth): Uint8Array {
  const cols = escposColumnsForPaper(paperWidthMm)
  const title =
    kind === 'comandas' ? 'PRUEBA COMANDA' : kind === 'precuenta' ? 'PRUEBA PRECUENTA' : 'PRUEBA DOCUMENTO'
  const lines = [TUKIFAC_APP_NAME, '='.repeat(Math.min(cols, 48)), title, '='.repeat(Math.min(cols, 48)), '', '']
  const out: number[] = [0x1b, 0x40, 0x1b, 0x61, 1]
  for (const line of lines) {
    out.push(...Array.from(new TextEncoder().encode(`${line}\n`)))
  }
  out.push(0x1d, 0x56, 0x41, 0x10)
  return new Uint8Array(out)
}

export async function testPrint(input: {
  kind: PrinterKind
  connection: PrinterConnectionMode
  printerName?: string
  tcpHost?: string
  tcpPort?: number
  paperWidthMm: PrinterPaperWidth
  bluetoothMac?: string
  bluetoothName?: string
}): Promise<string> {
  if (!isNativePrintAvailable()) return 'No disponible en navegador'

  const cfg: PrinterConfig = normalizeSlot({
    connection: input.connection,
    printerName: input.printerName ?? '',
    tcpHost: input.tcpHost ?? '',
    tcpPort: input.tcpPort,
    paperWidthMm: input.paperWidthMm,
    autoPrint: true,
    bluetoothMac: input.bluetoothMac ?? '',
    bluetoothName: input.bluetoothName ?? '',
  })

  if (isTauriDesktop() && (input.connection === 'windows' || input.connection === 'network')) {
    const { invoke } = await import('@tauri-apps/api/core')
    const mode = input.connection === 'network' ? 'network' : 'windows'
    const out = await invoke<string>('printers_test_print', {
      input: {
        mode,
        printer_name: input.printerName ?? '',
        tcp_host: input.tcpHost ?? '',
        tcp_port: clampPort(input.tcpPort ?? DEFAULT_TCP_PORT),
        paper_width_mm: input.paperWidthMm,
        kind: input.kind,
      },
    })
    return typeof out === 'string' ? out : 'OK'
  }

  const data =
    input.kind === 'precuenta'
      ? buildPrecuentaEscPos({
          tableName: 'Mesa 01',
          orderCode: 'PRUEBA-001',
          issueDate: new Date().toLocaleDateString('es-PE'),
          items: [
            { productName: 'Lomo saltado', quantity: 2, unitPrice: 28, lineTotal: 56 },
            { productName: 'Chicha morada', quantity: 1, unitPrice: 8, lineTotal: 8 },
          ],
          total: 64,
          paperWidthMm: input.paperWidthMm,
        })
      : buildTestEscPosTicket(input.kind, input.paperWidthMm)
  return sendEscPosPayload(cfg, data, `${TUKIFAC_APP_NAME} - Prueba`)
}

export async function printRawEscPos(input: {
  connection: PrinterConnectionMode
  printerName?: string
  tcpHost?: string
  tcpPort?: number
  bluetoothMac?: string
  bluetoothName?: string
  paperWidthMm?: PrinterPaperWidth
  data: Uint8Array
  docName?: string
}): Promise<string> {
  if (!isNativePrintAvailable()) return 'No disponible en navegador'
  const cfg = normalizeSlot({
    connection: input.connection,
    printerName: input.printerName ?? '',
    tcpHost: input.tcpHost ?? '',
    tcpPort: input.tcpPort ?? DEFAULT_TCP_PORT,
    paperWidthMm: input.paperWidthMm ?? 80,
    autoPrint: true,
    bluetoothMac: input.bluetoothMac ?? '',
    bluetoothName: input.bluetoothName ?? '',
  })
  return sendEscPosPayload(cfg, input.data, input.docName)
}

function columnsForWidth(width: PrinterPaperWidth): number {
  return escposColumnsForPaper(width)
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(normalizeTextForTicketPrint(s))
}

function wrapText(s: string, width: number): string[] {
  const clean = normalizeTextForTicketPrint(String(s ?? '')).replace(/\s+/g, ' ').trim()
  if (!clean) return ['']
  const words = clean.split(' ')
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length <= width) {
      line = next
      continue
    }
    if (line) out.push(line)
    if (w.length > width) {
      for (let i = 0; i < w.length; i += width) out.push(w.slice(i, i + width))
      line = ''
    } else {
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

function escposInit(): number[] {
  return [0x1b, 0x40]
}

function escposCutPartial(): number[] {
  return [0x1d, 0x56, 0x41, 0x10]
}

function escposAlign(align: 'left' | 'center' | 'right'): number[] {
  const n = align === 'left' ? 0 : align === 'center' ? 1 : 2
  return [0x1b, 0x61, n]
}

function escposBold(on: boolean): number[] {
  return [0x1b, 0x45, on ? 1 : 0]
}

function escposSize(widthMul: number, heightMul: number): number[] {
  const w = Math.min(8, Math.max(1, Math.floor(widthMul)))
  const h = Math.min(8, Math.max(1, Math.floor(heightMul)))
  const n = ((w - 1) << 4) | (h - 1)
  return [0x1d, 0x21, n]
}

function escposQr(data: string, opts?: { moduleSize?: number; ecc?: 'L' | 'M' | 'Q' | 'H' }): number[] {
  const moduleSize = Math.min(16, Math.max(1, Math.floor(opts?.moduleSize ?? 8)))
  const ecc = opts?.ecc ?? 'M'
  const eccByte = ecc === 'L' ? 0x30 : ecc === 'M' ? 0x31 : ecc === 'Q' ? 0x32 : 0x33
  const bytes = textBytes(data)
  const storeLen = bytes.length + 3
  const pL = storeLen & 0xff
  const pH = (storeLen >> 8) & 0xff
  const out: number[] = []
  out.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize)
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, eccByte)
  out.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30)
  out.push(...Array.from(bytes))
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
  return out
}

export function buildComandaEscPos(input: {
  tableName?: string | null
  orderNumber?: number | null
  waiterName?: string | null
  items: {
    productName: string
    quantity: number
    notes?: string | null
    modifierLines?: string[]
  }[]
  paperWidthMm: PrinterPaperWidth
}): Uint8Array {
  const cols = columnsForWidth(input.paperWidthMm)
  const bigCols = Math.max(12, Math.floor(cols / 2))

  const out: number[] = []
  out.push(...escposInit())

  out.push(...escposAlign('center'))
  out.push(...escposBold(true))
  out.push(...escposSize(2, 2))
  out.push(...Array.from(textBytes(`COMANDA\n`)))
  out.push(...escposBold(false))
  out.push(...escposSize(1, 1))

  out.push(...escposAlign('left'))
  out.push(...Array.from(textBytes(`${'-'.repeat(cols)}\n`)))

  out.push(...escposBold(true))
  out.push(...escposSize(2, 2))
  if (input.tableName) out.push(...Array.from(textBytes(`${wrapText(`MESA: ${input.tableName}`, bigCols).join('\n')}\n`)))
  if (input.orderNumber != null) out.push(...Array.from(textBytes(`PEDIDO: #${input.orderNumber}\n`)))
  if (input.waiterName) out.push(...Array.from(textBytes(`${wrapText(`MOZO: ${input.waiterName}`, bigCols).join('\n')}\n`)))
  out.push(...escposBold(false))
  out.push(...escposSize(1, 1))
  out.push(...Array.from(textBytes(`${'-'.repeat(cols)}\n`)))

  for (const it of input.items) {
    const qty = String(it.quantity ?? 0).replace(/\.0+$/, '')
    const head = `${qty}x `
    const wrapped = wrapText(String(it.productName ?? '').trim(), Math.max(6, bigCols - head.length))

    out.push(...escposBold(true))
    out.push(...escposSize(2, 2))
    out.push(...Array.from(textBytes(`${head}${wrapped[0] ?? ''}\n`)))
    for (const w of wrapped.slice(1)) out.push(...Array.from(textBytes(`${' '.repeat(head.length)}${w}\n`)))
    out.push(...escposBold(false))
    out.push(...escposSize(1, 1))

    for (const mod of it.modifierLines ?? []) {
      const line = String(mod).trim()
      if (!line) continue
      for (const w of wrapText(line, cols - 4)) out.push(...Array.from(textBytes(`  * ${w}\n`)))
    }

    const note = String(it.notes ?? '').trim()
    if (note) {
      for (const w of wrapText(`Obs: ${note}`, cols - 4)) out.push(...Array.from(textBytes(`  > ${w}\n`)))
    }
    out.push(...Array.from(textBytes(`\n`)))
  }

  out.push(...Array.from(textBytes(`${'-'.repeat(cols)}\n\n\n`)))
  out.push(...escposCutPartial())
  return new Uint8Array(out)
}

export type PrecuentaPrintItem = {
  productName: string
  quantity: number
  unitPrice: number
  lineTotal?: number
  modifierLines?: string[]
  notes?: string
}

export function buildPrecuentaEscPos(input: {
  tableName?: string | null
  orderCode?: string | null
  customerName?: string | null
  issueDate?: string | null
  items: PrecuentaPrintItem[]
  total: number
  currency?: string
  paperWidthMm: PrinterPaperWidth
}): Uint8Array {
  const cols = columnsForWidth(input.paperWidthMm)
  const narrow = input.paperWidthMm === 58
  const currency = String(input.currency ?? 'PEN').toUpperCase()
  const money = (n: number) => moneyEsc(currency, n)

  const headerLines: string[] = []
  if (input.tableName) wrapText(`Mesa: ${input.tableName}`, cols).forEach((x) => headerLines.push(x))
  if (input.orderCode) headerLines.push(`Pedido: ${input.orderCode}`)
  if (input.issueDate) headerLines.push(`Fecha: ${input.issueDate}`)
  if (input.customerName) wrapText(`Cliente: ${input.customerName}`, cols).forEach((x) => headerLines.push(x))

  const detailLines: string[] = []
  detailLines.push('-'.repeat(cols))
  detailLines.push(itemDetailHeaderRow(cols, narrow))
  detailLines.push('-'.repeat(cols))

  for (const it of input.items) {
    const qty = String(it.quantity ?? 0).replace(/\.0+$/, '')
    let desc = normalizeTextForTicketPrint(String(it.productName ?? '').trim())
    for (const mod of it.modifierLines ?? []) {
      const m = normalizeTextForTicketPrint(String(mod).trim())
      if (m) desc = desc ? `${desc}; ${m}` : m
    }
    const note = normalizeTextForTicketPrint(String(it.notes ?? '').trim())
    if (note) desc = desc ? `${desc} (Obs: ${note})` : `(Obs: ${note})`
    const lineTotal = it.lineTotal ?? Number(it.quantity) * Number(it.unitPrice)
    itemDetailRows(cols, qty, desc || '—', money(it.unitPrice), money(lineTotal), narrow).forEach((r) =>
      detailLines.push(r),
    )
  }

  const totalLines: string[] = [amountLine('TOTAL A PAGAR:', money(input.total), cols)]
  const docLabel = 'Documento:'
  const docLine = docLabel + '_'.repeat(Math.max(10, cols - docLabel.length))

  const out: number[] = []
  out.push(...escposInit())
  out.push(...escposAlign('center'))
  out.push(...escposBold(true))
  escposPushLines(out, ['PRECUENTA'], 'center')
  out.push(...escposBold(false))
  out.push(...escposAlign('left'))
  if (headerLines.length) escposPushLines(out, headerLines, 'left')
  escposPushLines(out, detailLines, 'left')
  escposPushLines(out, ['-'.repeat(cols)], 'left')
  out.push(...escposAlign('right'))
  escposPushLines(out, totalLines, 'right')
  out.push(...Array.from(textBytes('\n')))
  out.push(...escposAlign('left'))
  escposPushLines(out, [docLine], 'left')
  out.push(...Array.from(textBytes('\n\n')))
  out.push(...escposCutPartial())
  return new Uint8Array(out)
}

function moneyEsc(currency: string, n: number): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym}${Number(n ?? 0).toFixed(2)}`
}

/** Línea compacta etiqueta + monto (sin relleno); alinear a la derecha en impresora. */
function amountLine(label: string, amount: string, cols: number): string {
  const line = `${label.trim()} ${amount}`.trim()
  return line.length > cols ? line.slice(line.length - cols) : line
}

function itemDetailColWidths(cols: number, narrow: boolean) {
  const wCant = narrow ? 3 : 5
  const wMoney = narrow ? 8 : 10
  const wDesc = Math.max(6, cols - wCant - wMoney * 2 - 1)
  return { wCant, wMoney, wDesc }
}

function itemDetailHeaderRow(cols: number, narrow: boolean): string {
  const { wCant, wMoney, wDesc } = itemDetailColWidths(cols, narrow)
  const descLabel = narrow ? 'Desc.' : 'Descripcion'
  const header =
    'Cant'.padEnd(wCant) +
    descLabel.padEnd(wDesc) +
    'P.U.'.padStart(wMoney) +
    'Imp.'.padStart(wMoney)
  return header.slice(0, cols)
}

function itemDetailRows(
  cols: number,
  cant: string,
  desc: string,
  pu: string,
  imp: string,
  narrow: boolean,
): string[] {
  const { wCant, wMoney, wDesc } = itemDetailColWidths(cols, narrow)
  const rows: string[] = []
  const descLines = wrapText(desc, wDesc)
  for (let i = 0; i < descLines.length; i++) {
    const c = i === 0 ? cant.padEnd(wCant) : ' '.repeat(wCant)
    const d = (descLines[i] ?? '').padEnd(wDesc).slice(0, wDesc)
    const p = i === 0 ? pu.padStart(wMoney) : ' '.repeat(wMoney)
    const im = i === 0 ? imp.padStart(wMoney) : ' '.repeat(wMoney)
    rows.push((c + d + p + im).slice(0, cols))
  }
  return rows
}

function escposPushLines(out: number[], lines: string[], align: 'left' | 'center' | 'right') {
  out.push(...escposAlign(align))
  for (const l of lines) out.push(...Array.from(textBytes(`${l}\n`)))
}

function escposPushWrappedCenter(
  out: number[],
  lines: string[],
  opts?: { bold?: boolean; widthMul?: number; heightMul?: number },
) {
  out.push(...escposAlign('center'))
  if (opts?.bold) out.push(...escposBold(true))
  if ((opts?.widthMul ?? 1) !== 1 || (opts?.heightMul ?? 1) !== 1) {
    out.push(...escposSize(opts?.widthMul ?? 1, opts?.heightMul ?? 1))
  }
  for (const line of lines) out.push(...Array.from(textBytes(`${line}\n`)))
  if ((opts?.widthMul ?? 1) !== 1 || (opts?.heightMul ?? 1) !== 1) {
    out.push(...escposSize(1, 1))
  }
  if (opts?.bold) out.push(...escposBold(false))
}

async function pushCompanyHeaderEscPos(
  out: number[],
  printData: PrintData,
  cols: number,
  paperWidthMm: 58 | 80,
  nvLayout?: NotaVentaPrintLayoutSettings | null,
) {
  const tradeName = String(printData.company?.trade_name ?? '').trim()
  const businessName = String(printData.company?.business_name ?? '').trim() || 'Empresa'
  const showBusinessName =
    Boolean(businessName) &&
    businessName.localeCompare(tradeName, undefined, { sensitivity: 'accent' }) !== 0

  // Nombre principal "un poco más grande" (1.3×): tamaño intermedio imposible en
  // texto ESC/POS (solo 1×/2×), por eso se rasteriza. Si falla, cae a texto 1×.
  const mainName = tradeName || businessName
  // 1.1× ≈ solo un poco más grande que el texto nativo del ticket (~1.0× = igual;
  // subir hacia 1.15 si se quiere más grande, bajar hacia 1.0 si aún se ve grande).
  const nameRaster = await buildEscPosCenteredTextRaster(mainName, paperWidthMm, {
    fontScale: 1.1,
    bold: true,
  })
  if (nameRaster?.length) {
    out.push(...escposAlign('center'))
    out.push(...Array.from(nameRaster))
    out.push(...Array.from(textBytes('\n')))
    if (tradeName && showBusinessName) escposPushWrappedCenter(out, wrapText(businessName, cols))
  } else if (tradeName) {
    escposPushWrappedCenter(out, wrapText(tradeName, cols), { bold: true })
    if (showBusinessName) escposPushWrappedCenter(out, wrapText(businessName, cols))
  } else {
    escposPushWrappedCenter(out, wrapText(businessName, cols), { bold: true })
  }

  const metaLines: string[] = []
  if (printData.company?.ruc) metaLines.push(`RUC: ${printData.company.ruc}`)
  const addr = getPrintIssuerAddress(printData)
  if (addr) wrapText(addr, cols).forEach((x) => metaLines.push(x))
  const showContact = !nvLayout || nvLayout.showEmailAndPhone
  if (showContact && printData.company?.phone) metaLines.push(`Telf: ${printData.company.phone}`)
  if (showContact && printData.company?.email) metaLines.push(`Email: ${printData.company.email}`)
  if (metaLines.length) escposPushLines(out, metaLines, 'center')
}

export async function buildSaleDocumentEscPos(
  printData: PrintData,
  paperWidthMm: PrinterPaperWidth,
): Promise<Uint8Array> {
  const cols = columnsForWidth(paperWidthMm)
  const narrow = paperWidthMm === 58
  const currency = String(printData.currency ?? 'PEN').toUpperCase()
  const money = (n: number) => moneyEsc(currency, n)
  const showQr = isElectronicSunatCode(printData.sunat_code) && Boolean(printData.qr_data)
  const nvLayout = getNotaVentaPrintLayout(printData.sunat_code)
  const showPayAndBank = !nvLayout || nvLayout.showBankAccountsAndPaymentCondition

  const additionalNotes = trimCompanyAdditionalNotes(printData.company?.additional_notes)
  const companyAdditionalLines = additionalNotes
    ? wrapCompanyAdditionalNotes(additionalNotes, cols, wrapText)
    : []
  const companyTailLines: string[] = []
  if (printData.company?.website) companyTailLines.push(`Web: ${printData.company.website}`)

  const docHeaderLines: string[] = []
  wrapText(receiptDocTypeTitle(printData.sunat_code, printData.fiscal), cols).forEach((x) =>
    docHeaderLines.push(x),
  )
  docHeaderLines.push(printData.number)

  const detailLines: string[] = []
  detailLines.push(`Fecha Emision: ${printData.issue_date}`)
  if (printData.issue_time) detailLines.push(`Hora Emision: ${printData.issue_time}`)
  const showClient = !nvLayout || nvLayout.showClientData
  if (showClient && printData.client) {
    wrapText(`Cliente: ${printData.client.business_name}`, cols).forEach((x) => detailLines.push(x))
    detailLines.push(`Doc: ${printData.client.doc_number}`)
    if (printData.client.address) wrapText(`Dir: ${printData.client.address}`, cols).forEach((x) => detailLines.push(x))
  }
  if (printData.fiscal?.purchase_order_number) {
    detailLines.push(`O/C: ${printData.fiscal.purchase_order_number}`)
  }
  if (printData.fiscal?.guias?.length) {
    for (const g of printData.fiscal.guias) {
      const label = g.kind === 'guia_transportista' ? 'Guia transp.' : 'Guia rem.'
      detailLines.push(`${label}: ${g.number}`)
    }
  }
  if (printData.fiscal?.fiscal_observations) {
    wrapText(`Obs.: ${printData.fiscal.fiscal_observations}`, cols).forEach((x) => detailLines.push(x))
  }
  if (printData.fiscal?.prepayment_deductions?.length) {
    for (const p of printData.fiscal.prepayment_deductions) {
      wrapText(prepaymentDeductionDescription(p.related_doc_type, p.document_number), cols).forEach((x) =>
        detailLines.push(x),
      )
    }
  }
  detailLines.push('-'.repeat(cols))
  detailLines.push(itemDetailHeaderRow(cols, narrow))
  detailLines.push('-'.repeat(cols))

  if (printData.fiscal?.has_prepayment_emit) {
    wrapText('*** PAGO ANTICIPADO ***', cols).forEach((x) => detailLines.push(x))
    detailLines.push('-'.repeat(cols))
  }

  for (const it of printData.items ?? []) {
    const qty = String(it.quantity ?? 0).replace(/\.0+$/, '')
    let desc = receiptItemDisplayDescription(it)
    if (printData.fiscal?.has_prepayment_emit) {
      desc = `${desc} *** Pago Anticipado ***`
    }
    itemDetailRows(
      cols,
      qty,
      receiptItemDisplayDescription(it),
      receiptItemDisplayUnitPrice(it, money),
      receiptItemDisplayTotal(it, money),
      narrow,
    ).forEach((r) => detailLines.push(r))
  }

  for (const p of printData.fiscal?.prepayment_deductions ?? []) {
    itemDetailRows(
      cols,
      '1',
      prepaymentDeductionDescription(p.related_doc_type, p.document_number),
      money(-Math.abs(p.total)),
      money(-Math.abs(p.total)),
      narrow,
    ).forEach((r) => detailLines.push(r))
  }

  const totalLines: string[] = []
  for (const row of buildReceiptTotalLines(printData)) {
    totalLines.push(
      amountLine(
        row.label.replace(/:$/, ''),
        row.negative
          ? `- ${money(row.amount)}`
          : money(row.amount),
        cols,
      ),
    )
  }

  const legendLines: string[] = []
  if (printData.legend_text) {
    wrapText(`Son: ${printData.legend_text}`, cols).forEach((x) => legendLines.push(x))
  }

  const tailLines: string[] = []
  if (printData.seller_name) {
    tailLines.push(`Vendedor: ${printData.seller_name}`)
  }

  const footerLines: string[] = [`${TUKIFAC_APP_NAME} - Sistema POS`]

  const out: number[] = []
  out.push(...escposInit())

  const logoUrl = printData.company?.logo_url?.trim()
  const showLogo = !nvLayout || nvLayout.showLogo
  if (logoUrl && showLogo) {
    const logoRaster = await buildEscPosLogoRaster(logoUrl, paperWidthMm)
    if (logoRaster?.length) {
      out.push(...escposAlign('center'))
      out.push(...Array.from(logoRaster))
      out.push(...Array.from(textBytes('\n\n')))
    }
  }

  await pushCompanyHeaderEscPos(out, printData, cols, paperWidthMm, nvLayout)
  if (companyAdditionalLines.length) escposPushLines(out, companyAdditionalLines, 'left')
  if (companyTailLines.length) escposPushLines(out, companyTailLines, 'center')
  escposPushLines(out, ['-'.repeat(cols)], 'center')
  if (!nvLayout || nvLayout.showDocTypeAndNumber) {
    escposPushLines(out, docHeaderLines, 'center')
  }
  escposPushLines(out, ['-'.repeat(cols)], 'left')
  escposPushLines(out, detailLines, 'left')
  escposPushLines(out, ['-'.repeat(cols)], 'left')
  escposPushLines(out, totalLines, 'right')
  if (legendLines.length) {
    out.push(...Array.from(textBytes('\n')))
    escposPushLines(out, legendLines, 'left')
  }
  const hasPayBlock =
    showPayAndBank &&
    (showQr ||
      Boolean(printData.payment_condition) ||
      (printData.payments?.length ?? 0) > 0)

  if (hasPayBlock) {
    out.push(...Array.from(textBytes('\n')))
    const leftCol = Math.max(14, Math.floor(cols * 0.5))
    const payTextCols = showQr ? leftCol : cols
    const leftLines: string[] = []
    for (const raw of paymentConditionLeftLines(printData, { cols: payTextCols, ticketMoney: true })) {
      if (raw.length <= payTextCols || raw.startsWith('Pagos detallados')) {
        leftLines.push(raw)
        continue
      }
      wrapText(raw, payTextCols).forEach((l) => leftLines.push(l))
    }

    if (showQr && printData.qr_data) {
      // Una sola imagen (texto + QR): compatible con cualquier marca térmica.
      const rowRaster = await buildEscPosPayConditionSunatRowRaster(
        leftLines,
        printData.qr_data,
        paperWidthMm,
      )
      if (rowRaster?.length) {
        out.push(...escposAlign('center'))
        out.push(...Array.from(rowRaster))
      } else {
        escposPushLines(out, leftLines, 'left')
        out.push(...escposAlign('center'))
        out.push(
          ...escposQr(printData.qr_data, {
            moduleSize: paperWidthMm === 58 ? 7 : 9,
            ecc: 'M',
          }),
        )
      }
    } else {
      escposPushLines(out, leftLines, 'left')
    }
    if (showQr && printData.sunat_hash) {
      escposPushLines(out, wrapText(`Hash: ${printData.sunat_hash}`, cols), 'center')
    }
    if (showQr) {
      escposPushLines(out, wrapText('Representacion impresa CPE', cols), 'center')
      escposPushLines(out, wrapText('Consulte en sunat.gob.pe', cols), 'center')
    }
  }

  const bankLines = bankAccountTextLines(printData)
  if (showPayAndBank && bankLines.length > 0) {
    out.push(...Array.from(textBytes('\n')))
    escposPushLines(out, ['-'.repeat(cols), ...bankLines], 'left')
  }

  if (paymentWalletVisible(printData, 'ticket')) {
    const w = printData.payment_wallet!
    const label = walletProviderLabel(w.provider)
    out.push(...Array.from(textBytes('\n')))
    escposPushLines(
      out,
      ['-'.repeat(cols), `Paga con ${label}`, w.phone.trim()],
      'center',
    )
    const qrSrc = w.qr_url.trim().startsWith('data:') ? w.qr_url.trim() : resolvePublicAssetUrl(w.qr_url)
    const walletRaster = await buildEscPosWalletQrRaster(qrSrc, paperWidthMm)
    if (walletRaster?.length) {
      out.push(...escposAlign('center'))
      out.push(...Array.from(walletRaster))
      out.push(...Array.from(textBytes('\n')))
    }
  }

  if (tailLines.length) {
    out.push(...Array.from(textBytes('\n')))
    escposPushLines(out, tailLines, 'left')
  }

  out.push(...escposAlign('center'))
  out.push(...Array.from(textBytes('\n\n\n')))
  escposPushLines(out, footerLines, 'center')
  out.push(...Array.from(textBytes('\n\n')))
  out.push(...escposCutPartial())
  return new Uint8Array(out)
}

export async function printComandaAuto(
  input: {
    tableName?: string | null
    orderNumber?: number | null
    waiterName?: string | null
    items: {
      productName: string
      quantity: number
      notes?: string | null
      modifierLines?: string[]
    }[]
  },
  opts?: { preparationArea?: string | null; printerConfig?: PrinterConfig },
): Promise<string> {
  const cfg = opts?.printerConfig ?? getConfiguredComandaPrinter(opts?.preparationArea)
  if (!cfg) return 'Impresora de comandas no configurada'
  const data = buildComandaEscPos({ ...input, paperWidthMm: cfg.paperWidthMm })
  return printRawEscPos({ ...cfg, data, docName: `${TUKIFAC_APP_NAME} - Comanda` })
}

export async function printPrecuentaAuto(input: {
  tableName?: string | null
  orderCode?: string | null
  customerName?: string | null
  issueDate?: string | null
  items: PrecuentaPrintItem[]
  total: number
  currency?: string
}): Promise<string> {
  const cfg = getConfiguredPrinter('precuenta')
  if (!cfg) return 'Impresora de precuenta no configurada'
  const data = buildPrecuentaEscPos({ ...input, paperWidthMm: cfg.paperWidthMm })
  return printRawEscPos({ ...cfg, data, docName: `${TUKIFAC_APP_NAME} - Precuenta` })
}

export async function printDocumentAuto(printData: PrintData): Promise<string> {
  const cfg = getConfiguredPrinter('documentos')
  if (!cfg) return 'Impresora de documentos no configurada'
  const data = await buildSaleDocumentEscPos(printData, cfg.paperWidthMm)
  return printRawEscPos({ ...cfg, data, docName: `${TUKIFAC_APP_NAME} - Documento` })
}
