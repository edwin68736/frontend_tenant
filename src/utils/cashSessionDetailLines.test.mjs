// Ejecutar: node --test --experimental-strip-types src/utils/cashSessionDetailLines.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCashSessionDetailLines,
  ticketPair,
  wrapTicketText,
  totalsByCurrency,
  sortProductsSold,
  salesByMethodRows,
  ticketMoney,
  allCashDetailSections,
  resolveCashDetailSections,
  CASH_DETAIL_SECTION_OPTIONS,
} from './cashSessionDetailLines.ts'

const doc = (o) => ({
  sale_id: 1, kind: 'boleta', doc_number: 'B001-1', created_at: '2026-11-02T15:30:00Z', contact_name: 'Juan',
  total: 10, currency: 'PEN', status: 'issued', cancelled: false, cancel_reason: '', payment_method: 'efectivo', payments: [], ...o,
})

const base = (over = {}) => ({
  company: { name: 'Mi Empresa', ruc: '20123456789', address: 'Av. Sucursal 1' },
  session: { id: 7, status: 'closed', closing_balance: 100, difference: -5, closed_by_name: 'Ana', opened_by_name: 'Luis' },
  report: {
    session: { id: 7, branch_id: 1, branch_name: 'Principal', opened_by_user_name: 'Luis', opened_at: '2026-11-02T14:00:00Z', closed_at: '2026-11-02T22:00:00Z', opening_balance: 50, closing_balance: 100, status: 'closed' },
    income_detail: [], expense_detail: [],
    totals_by_method: { sales: [{ method: 'yape', total: 30 }, { method: 'efectivo', total: 70 }], purchases: [], movements: [] },
    totals: { total_income: 0, total_expense: 0, total_sales: 100, total_purchases: 0, final_balance: 105 },
    cash_physical: { opening_balance: 50, total_income: 0, total_expense: 0, physical_balance: 105, sales_total: 70, cash_sales: [],
      manual_income: [{ date: '2026-11-02T16:00:00Z', type: 'manual', doc_number: '', reference: 'Sencillo', amount: 20, payment_method: 'efectivo', category: 'ingreso_manual' }],
      expenses: [{ date: '2026-11-02T17:00:00Z', type: 'manual', doc_number: '', reference: '', amount: 35, payment_method: 'efectivo', category: 'egreso_manual' }] },
  },
  documents: {
    documents: [
      doc({ kind: 'boleta', doc_number: 'B001-1', total: 60 }),
      doc({ kind: 'factura', doc_number: 'F001-1', total: 40, payment_method: 'yape' }),
      doc({ kind: 'nota_venta', doc_number: 'NV01-1', total: 12.5, currency: 'USD' }),
      doc({ kind: 'boleta', doc_number: 'B001-2', total: 15, cancelled: true, cancel_reason: 'Error de cliente' }),
    ],
    by_kind: [], active_count: 3, active_total: 112.5, cancelled_count: 1, cancelled_total: 15,
  },
  products: [{ code: 'a', description: 'Gaseosa', unit: 'NIU', quantity: 2, total: 8 }, { code: 'b', description: 'Pollo', unit: 'NIU', quantity: 1.5, total: 45 }],
  printedAt: new Date('2026-11-02T23:00:00Z'),
  ...over,
})

test('ningúna línea excede el ancho de la impresora (32 y 48 columnas)', () => {
  for (const cols of [32, 48]) {
    for (const l of buildCashSessionDetailLines(base(), cols)) {
      assert.ok(l.text.length <= (l.big ? Math.floor(cols / 2) : cols), `[${l.text}] en ${cols}`)
    }
  }
})

test('trae todas las secciones, anulados con motivo y productos por importe', () => {
  const txt = buildCashSessionDetailLines(base(), 48).map((l) => l.text).join('\n')
  for (const s of ['DETALLE DE CAJA', 'CAJA CERRADA', 'RESUMEN', 'VENTAS POR METODO DE PAGO', 'COMPROBANTES', 'NOTAS DE VENTA (1)', 'BOLETAS (1)', 'FACTURAS (1)', 'VENTAS ANULADAS', 'MOVIMIENTOS DE CAJA', 'PRODUCTOS VENDIDOS']) {
    assert.ok(txt.includes(s), s)
  }
  assert.ok(txt.includes('Motivo: Error de cliente'))
  assert.ok(txt.includes('Saldo de cierre'))
  assert.ok(txt.includes('-S/5.00'))
  assert.ok(txt.includes('Faltante'))
  assert.ok(txt.indexOf('Pollo') < txt.indexOf('Gaseosa'))
  assert.ok(txt.includes('1.5 x Pollo'))
  assert.ok(!txt.includes('REPORTE PARCIAL'))
})

test('los anulados no suman en comprobantes vigentes y el efectivo va primero', () => {
  const txt = buildCashSessionDetailLines(base(), 48).map((l) => l.text).join('\n')
  const comp = txt.slice(txt.indexOf('COMPROBANTES'), txt.indexOf('VENTAS ANULADAS'))
  assert.ok(!comp.includes('B001-2'))
  assert.ok(txt.indexOf('Efectivo (caja fisica)') < txt.indexOf('Yape'))
})

test('sesión abierta se rotula como reporte parcial y no muestra cierre', () => {
  const d = base()
  d.session = { id: 7, status: 'open' }
  d.report.session.status = 'open'
  d.report.session.closed_at = null
  const txt = buildCashSessionDetailLines(d, 32).map((l) => l.text).join('\n')
  assert.ok(txt.includes('*** REPORTE PARCIAL ***'))
  assert.ok(!txt.includes('Saldo de cierre'))
})

test('monedas distintas se muestran por separado, sin convertir', () => {
  const t = totalsByCurrency(base().documents.documents.filter((d) => !d.cancelled))
  assert.deepEqual(t.map((x) => x.currency), ['PEN', 'USD'])
  assert.equal(t[0].total, 100)
  assert.equal(t[1].total, 12.5)
  const txt = buildCashSessionDetailLines(base(), 48).map((l) => l.text).join('\n')
  assert.ok(txt.includes('US$12.50'))
})

test('helpers: pair, wrap, dinero, orden y métodos', () => {
  assert.equal(ticketPair('a', 'S/1.00', 10).join('|'), 'a   S/1.00')
  assert.ok(ticketPair('Una descripcion muy larga de producto', 'S/1.00', 20).every((x, i) => i > 0 || x.length === 20))
  assert.deepEqual(wrapTicketText('hola mundo cruel', 9), ['hola', 'mundo', 'cruel'])
  assert.equal(ticketMoney(3), 'S/3.00')
  assert.equal(ticketMoney(3, 'USD'), 'US$3.00')
  assert.equal(sortProductsSold([{ description: 'x', quantity: 1, total: 1 }, { description: 'y', quantity: 1, total: 9 }])[0].description, 'y')
  assert.equal(salesByMethodRows(base().report)[0].method, 'efectivo')
})

test('secciones opcionales: cada una desmarcada desaparece sin dejar título', () => {
  const lines = (sections) => buildCashSessionDetailLines(base({ sections }), 48).map((l) => l.text).join('\n')
  const titles = { documents: 'COMPROBANTES', cancelled: 'VENTAS ANULADAS', movements: 'MOVIMIENTOS DE CAJA', products: 'PRODUCTOS VENDIDOS' }
  const extra = { documents: ['B001-1', 'F001-1', 'Subtotal facturas'], cancelled: ['Error de cliente', 'TOTAL ANULADO'], movements: ['Sencillo', 'Ingresos en efectivo'], products: ['Gaseosa', 'Productos distintos'] }
  for (const key of Object.keys(titles)) {
    const txt = lines({ [key]: false })
    assert.ok(!txt.includes(titles[key]), `${key}: título`)
    for (const x of extra[key]) assert.ok(!txt.includes(x), `${key}: ${x}`)
    for (const [k, t] of Object.entries(titles)) if (k !== key) assert.ok(txt.includes(t), `${key} off: debe seguir ${t}`)
    assert.ok(txt.includes('RESUMEN') && txt.includes('VENTAS POR METODO DE PAGO'))
  }
})

test('todas las secciones opcionales desmarcadas: queda solo la base', () => {
  const none = { documents: false, cancelled: false, movements: false, products: false }
  const txt = buildCashSessionDetailLines(base({ sections: none }), 32).map((l) => l.text).join('\n')
  for (const t of ['COMPROBANTES', 'VENTAS ANULADAS', 'MOVIMIENTOS DE CAJA', 'PRODUCTOS VENDIDOS']) assert.ok(!txt.includes(t), t)
  for (const t of ['DETALLE DE CAJA', 'RESUMEN', 'Saldo esperado', 'VENTAS POR METODO DE PAGO', 'Impreso:']) assert.ok(txt.includes(t), t)
  assert.ok(!/={32}\n={32}/.test(txt), 'sin títulos vacíos consecutivos')
  for (const l of buildCashSessionDetailLines(base({ sections: none }), 32)) assert.ok(l.text.length <= 32)
})

test('selección por defecto: todo marcado y los faltantes se incluyen', () => {
  assert.deepEqual(allCashDetailSections(), { documents: true, cancelled: true, movements: true, products: true })
  assert.deepEqual(resolveCashDetailSections({ products: false }), { documents: true, cancelled: true, movements: true, products: false })
  assert.deepEqual(resolveCashDetailSections(null), allCashDetailSections())
  assert.deepEqual(CASH_DETAIL_SECTION_OPTIONS.map((o) => o.key), ['documents', 'cancelled', 'movements', 'products'])
})
