import type {
  CashSession,
  CashSessionReport,
  ExpenseDetailRow,
  IncomeDetailRow,
  SessionDocKind,
  SessionDocumentRow,
  SessionDocumentsReport,
  SessionProductSoldRow,
} from '../services/cashbank.service.ts'
import { normalizeTextForTicketPrint } from './normalizeTextForTicketPrint.ts'

/**
 * Detalle de caja en formato ticket térmico (58/80 mm). La maqueta se resuelve aquí como líneas de
 * texto monoespaciado ya cortadas al ancho de la impresora, para que la MISMA salida sirva a la
 * impresora ESC/POS y al PDF/vista de impresión del navegador. Sin dependencias de React ni de la
 * app (se prueba con `node --test`).
 */

export type TicketLine = {
  text: string
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  /** Doble alto/ancho (solo títulos cortos). */
  big?: boolean
}

export type CashSessionDetailData = {
  company: { name: string; ruc: string; address?: string }
  /** Fila de la sesión (historial o recién cerrada): cierre, esperado, diferencia, quién cerró. */
  session: CashSession | null
  report: CashSessionReport
  documents: SessionDocumentsReport
  products: SessionProductSoldRow[]
  /** Momento de impresión (inyectable para pruebas). */
  printedAt?: Date
  /** Nombre legible del método de pago (código → etiqueta). Por defecto capitaliza el código. */
  methodLabel?: (code: string) => string
  /** Pie del ticket (nombre de la app). */
  footer?: string
}

const LIMA = 'America/Lima'

function limaParts(d: Date): { y: string; mo: string; da: string; h: string; mi: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const h = get('hour') === '24' ? '00' : get('hour')
  return { y: get('year'), mo: get('month'), da: get('day'), h, mi: get('minute') }
}

export function ticketDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  const p = limaParts(d)
  return `${p.da}/${p.mo}/${p.y} ${p.h}:${p.mi}`
}

export function ticketTime(value: string | Date | null | undefined): string {
  if (!value) return '--:--'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '--:--'
  const p = limaParts(d)
  return `${p.h}:${p.mi}`
}

/** Importe con símbolo de moneda (soles por defecto). Sin conversión entre monedas. */
export function ticketMoney(n: number | null | undefined, currency?: string): string {
  const v = Number(n ?? 0)
  const c = String(currency ?? 'PEN').trim().toUpperCase()
  const sym = c === 'USD' ? 'US$' : c === 'EUR' ? 'EUR' : c === '' || c === 'PEN' ? 'S/' : c
  const abs = Number.isFinite(v) ? Math.abs(v) : 0
  return `${v < 0 && abs >= 0.005 ? "-" : ""}${sym}${abs.toFixed(2)}`
}

/** Hora (HH:MM) o, si la sesión abarca varios días, «dd/mm HH:MM» para no confundir el orden. */
function ticketStamp(value: string | Date | null | undefined, withDate: boolean): string {
  if (!withDate) return ticketTime(value)
  const full = ticketDateTime(value)
  return full === '-' ? '--/-- --:--' : `${full.slice(0, 5)} ${full.slice(11)}`
}

function clean(s: string | null | undefined): string {
  return normalizeTextForTicketPrint(String(s ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Corta un texto en líneas de hasta `width` caracteres (palabras largas se parten). */
export function wrapTicketText(raw: string, width: number): string[] {
  const text = clean(raw)
  if (!text) return ['']
  const out: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    const next = line ? `${line} ${w}` : w
    if (next.length <= width) {
      line = next
      continue
    }
    if (line) out.push(line)
    if (w.length > width) {
      let i = 0
      for (; i + width < w.length; i += width) out.push(w.slice(i, i + width))
      line = w.slice(i)
    } else {
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

/** `izquierda ........ derecha` en `cols` columnas; si no cabe, la izquierda se parte en varias líneas. */
export function ticketPair(left: string, right: string, cols: number): string[] {
  const r = clean(right)
  const l = clean(left)
  const room = cols - r.length - 1
  if (l.length <= room) return [l + ' '.repeat(cols - l.length - r.length) + r]
  const lines = wrapTicketText(l, Math.max(8, room))
  const first = lines[0]
  const rest = lines.slice(1)
  return [first + ' '.repeat(Math.max(1, cols - first.length - r.length)) + r, ...rest.map((x) => `  ${x}`)]
}

function qtyText(q: number): string {
  const n = Number(q)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function defaultMethodLabel(code: string): string {
  const c = String(code ?? '').trim().replace(/_/g, ' ')
  return c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : '-'
}

export function isCashCode(code: string | undefined | null): boolean {
  const c = String(code ?? '').trim().toLowerCase()
  return c === '' || c === 'cash' || c === 'efectivo'
}

const KIND_TITLE: Record<SessionDocKind, string> = {
  nota_venta: 'NOTAS DE VENTA',
  boleta: 'BOLETAS',
  factura: 'FACTURAS',
}
const KIND_ORDER: SessionDocKind[] = ['nota_venta', 'boleta', 'factura']

/** Productos vendidos: mayor importe primero (luego mayor cantidad y nombre). */
export function sortProductsSold(rows: SessionProductSoldRow[]): SessionProductSoldRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.total) - Number(a.total) ||
      Number(b.quantity) - Number(a.quantity) ||
      String(a.description).localeCompare(String(b.description), 'es'),
  )
}

/** Suma por método (ventas) manteniendo efectivo primero y el resto por importe. */
export function salesByMethodRows(report: CashSessionReport): { method: string; total: number }[] {
  const acc = new Map<string, number>()
  for (const m of report.totals_by_method?.sales ?? []) {
    const k = String(m.method || 'efectivo').toLowerCase()
    acc.set(k, (acc.get(k) ?? 0) + Number(m.total))
  }
  return [...acc.entries()]
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => Number(isCashCode(b.method)) - Number(isCashCode(a.method)) || b.total - a.total)
}

/** Totales por moneda de una lista de comprobantes (sin convertir entre monedas). PEN primero. */
export function totalsByCurrency(docs: SessionDocumentRow[]): { currency: string; count: number; total: number }[] {
  const acc = new Map<string, { count: number; total: number }>()
  for (const d of docs) {
    const c = String(d.currency || 'PEN').toUpperCase()
    const cur = acc.get(c) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += Number(d.total)
    acc.set(c, cur)
  }
  return [...acc.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => Number(b.currency === 'PEN') - Number(a.currency === 'PEN') || a.currency.localeCompare(b.currency))
}

function movementTypeLabel(r: { type: string }, income: boolean): string {
  const t = String(r.type || '').toLowerCase()
  if (income) return t === 'cobro_cxc' ? 'Cobro CxC' : 'Ingreso'
  if (t === 'gasto') return 'Gasto'
  if (t === 'compra' || t === 'pago_proveedor') return 'Compra'
  return 'Egreso'
}

function movementMotive(r: IncomeDetailRow | ExpenseDetailRow): string {
  const cat = String((r as { category?: string }).category ?? '').trim().replace(/_/g, ' ')
  const ref = String(r.reference ?? '').trim()
  const doc = String(r.doc_number ?? '').trim()
  return [cat, ref || doc].filter((x, i, a) => x && a.indexOf(x) === i).join(' - ')
}

export function buildCashSessionDetailLines(data: CashSessionDetailData, cols: number): TicketLine[] {
  const { report, documents, products } = data
  const label = (code: string) => (code === 'mixto' ? 'Mixto' : clean((data.methodLabel ?? defaultMethodLabel)(code)))
  const s = report.session
  const row = data.session
  const isOpen = (row?.status ?? s.status) === 'open'
  // Una caja que se dejó abierta varios días mezcla fechas: se antepone dd/mm a cada hora.
  const endRef = s.closed_at ?? (data.printedAt ?? new Date()).toISOString()
  const multiDay = ticketDateTime(s.opened_at).slice(0, 10) !== ticketDateTime(endRef).slice(0, 10)
  const stamp = (v: string) => ticketStamp(v, multiDay)
  const out: TicketLine[] = []
  const sep = (ch = '-') => out.push({ text: ch.repeat(cols) })
  const blank = () => out.push({ text: '' })
  const center = (text: string, bold = false, big = false) =>
    wrapTicketText(text, big ? Math.max(8, Math.floor(cols / 2)) : cols).forEach((t) =>
      out.push({ text: t, align: 'center', bold, big }),
    )
  const pair = (l: string, r: string, bold = false) => ticketPair(l, r, cols).forEach((t) => out.push({ text: t, bold }))
  const text = (t: string, indent = 0) =>
    wrapTicketText(t, cols - indent).forEach((x) => out.push({ text: ' '.repeat(indent) + x }))
  // Número + hora a la izquierda; si no cabe junto al importe, la hora pasa a la línea siguiente.
  const docHead = (number: string, when: string, amount: string, detail: string) => {
    const left = `${number} ${when}`
    if (left.length + amount.length + 1 <= cols) {
      pair(left, amount)
      if (detail) text(detail, 2)
    } else {
      pair(number, amount)
      text(`${when}${detail ? ` ${detail}` : ''}`, 2)
    }
  }
  const section = (title: string) => {
    sep('=')
    center(title, true)
    sep('=')
  }

  // 1. Encabezado
  center(data.company.name || 'Empresa', true)
  if (data.company.ruc) center(`RUC: ${data.company.ruc}`)
  if (data.company.address) center(data.company.address)
  blank()
  center('DETALLE DE CAJA', true, true)
  if (isOpen) {
    center('*** REPORTE PARCIAL ***', true)
    center(`Caja abierta, a la fecha ${ticketDateTime(data.printedAt ?? new Date())}`)
  } else {
    center('CAJA CERRADA')
  }
  sep()
  if (s.branch_name) text(`Sucursal: ${s.branch_name}`)
  const caja = [row?.register_code, row?.register_name].filter(Boolean).join(' - ')
  if (caja) text(`Caja: ${caja}`)
  text(`Sesion N: ${s.id}`)
  text(`Abrio: ${row?.opened_by_name || s.opened_by_user_name || '-'}`)
  text(`Apertura: ${ticketDateTime(s.opened_at)}`)
  if (!isOpen) {
    text(`Cerro: ${row?.closed_by_name || '-'}`)
    text(`Cierre: ${ticketDateTime(s.closed_at)}`)
  }
  pair('Monto inicial:', ticketMoney(s.opening_balance), true)

  // 2. Resumen y cuadre de caja física
  const cash = report.cash_physical
  const manualIncome = cash?.manual_income ?? []
  const expenses = cash?.expenses ?? report.expense_detail ?? []
  const salesTotal = Number(report.totals?.total_sales ?? 0)
  const cashSales = Number(cash?.sales_total ?? 0)
  const manualCashIncome = manualIncome.filter((r) => isCashCode(r.payment_method)).reduce((a, r) => a + Number(r.amount), 0)
  const cashExpense = expenses.filter((r) => isCashCode(r.payment_method)).reduce((a, r) => a + Number(r.amount), 0)
  const expected = Number(cash?.physical_balance ?? report.totals?.final_balance ?? 0)
  const allDocs = documents.documents ?? []
  const activeDocs = allDocs.filter((d) => !d.cancelled)
  const cancelledDocs = allDocs.filter((d) => d.cancelled)

  section('RESUMEN')
  pair('Ventas cobradas:', ticketMoney(salesTotal), true)
  const active = totalsByCurrency(activeDocs)
  if (active.length === 0) pair('Vigentes: 0 doc.', ticketMoney(0))
  for (const t of active) pair(`Vigentes: ${t.count} doc.`, ticketMoney(t.total, t.currency))
  const canc = totalsByCurrency(cancelledDocs)
  if (canc.length === 0) pair('Anulados: 0 doc.', ticketMoney(0))
  for (const t of canc) pair(`Anulados: ${t.count} doc.`, ticketMoney(t.total, t.currency))
  sep()
  text('CAJA FISICA (efectivo)')
  pair('Monto inicial', ticketMoney(s.opening_balance))
  pair('+ Ventas en efectivo', ticketMoney(cashSales))
  pair('+ Ingresos de caja', ticketMoney(manualCashIncome))
  pair('- Egresos de caja', ticketMoney(cashExpense))
  pair('= Saldo esperado', ticketMoney(expected), true)
  if (!isOpen) {
    const closing = row?.closing_balance ?? s.closing_balance
    if (closing != null) {
      pair('Saldo de cierre', ticketMoney(closing), true)
      const d = Number(row?.difference ?? Number(closing) - expected)
      pair('Diferencia', `${d > 0 ? '+' : ''}${ticketMoney(d)}`, true)
      text(Math.abs(d) < 0.005 ? 'Cuadre exacto' : d > 0 ? 'Sobrante' : 'Faltante')
    }
  }

  // 3. Ventas por método de pago
  section('VENTAS POR METODO DE PAGO')
  const methods = salesByMethodRows(report)
  if (methods.length === 0) text('Sin ventas cobradas')
  for (const m of methods) pair(`${label(m.method)}${isCashCode(m.method) ? ' (caja fisica)' : ''}`, ticketMoney(m.total))
  if (methods.length > 0) {
    sep()
    pair('TOTAL', ticketMoney(methods.reduce((a, m) => a + m.total, 0)), true)
  }

  // 4. Comprobantes por tipo
  const byKind = new Map<SessionDocKind, SessionDocumentRow[]>()
  for (const d of activeDocs) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d])
  section('COMPROBANTES')
  if (byKind.size === 0) text('Sin comprobantes vigentes')
  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind)
    if (!list?.length) continue
    center(`${KIND_TITLE[kind]} (${list.length})`, true)
    for (const d of list) {
      const who = clean(d.contact_name) || 'Clientes varios'
      docHead(d.doc_number, stamp(d.created_at), ticketMoney(d.total, d.currency), `${who} - ${label(d.payment_method || 'efectivo')}`)
    }
    sep()
    for (const t of totalsByCurrency(list)) pair(`Subtotal ${KIND_TITLE[kind].toLowerCase()}`, ticketMoney(t.total, t.currency), true)
    blank()
  }

  // Anulados
  section('VENTAS ANULADAS')
  if (cancelledDocs.length === 0) text('Sin ventas anuladas')
  for (const kind of KIND_ORDER) {
    const list = cancelledDocs.filter((d) => d.kind === kind)
    if (!list.length) continue
    center(`${KIND_TITLE[kind]} (${list.length})`, true)
    for (const d of list) {
      docHead(d.doc_number, stamp(d.created_at), ticketMoney(d.total, d.currency), d.cancel_reason ? `Motivo: ${d.cancel_reason}` : '')
    }
    for (const t of totalsByCurrency(list)) pair(`Subtotal ${KIND_TITLE[kind].toLowerCase()}`, ticketMoney(t.total, t.currency))
  }
  if (cancelledDocs.length > 0) {
    sep()
    for (const t of canc) pair('TOTAL ANULADO', ticketMoney(t.total, t.currency), true)
  }

  // 5. Movimientos de caja
  section('MOVIMIENTOS DE CAJA')
  const movs: { date: string; income: boolean; r: IncomeDetailRow | ExpenseDetailRow }[] = [
    ...manualIncome.map((r) => ({ date: r.date, income: true, r })),
    ...expenses.map((r) => ({ date: r.date, income: false, r })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  if (movs.length === 0) text('Sin ingresos ni egresos')
  for (const m of movs) {
    pair(`${stamp(m.date)} ${movementTypeLabel(m.r, m.income)}`, `${m.income ? '+' : '-'}${ticketMoney(Number(m.r.amount))}`)
    const motive = movementMotive(m.r)
    const method = isCashCode(m.r.payment_method) ? '' : ` [${label(m.r.payment_method)}]`
    if (motive || method) text(`${motive}${method}`.trim(), 2)
  }
  if (movs.length > 0) {
    sep()
    pair('Ingresos en efectivo', ticketMoney(manualCashIncome))
    pair('Egresos en efectivo', ticketMoney(cashExpense))
  }

  // 6. Productos vendidos
  section('PRODUCTOS VENDIDOS')
  const sorted = sortProductsSold(products)
  if (sorted.length === 0) text('Sin productos vendidos')
  else {
    text('Ordenado por importe (sin anulados)')
    sep()
    for (const p of sorted) pair(`${qtyText(p.quantity)} x ${clean(p.description)}`, ticketMoney(p.total))
    sep()
    pair(`Productos distintos: ${sorted.length}`, ticketMoney(sorted.reduce((a, p) => a + Number(p.total), 0)), true)
  }

  sep('=')
  center(`Impreso: ${ticketDateTime(data.printedAt ?? new Date())}`)
  if (isOpen) center('Reporte parcial: la caja sigue abierta')
  center(data.footer || 'Tukifac - Sistema POS')
  return out
}
