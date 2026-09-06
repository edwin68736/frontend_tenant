import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { writeXlsx, type CellValue } from 'hucre'
import type { CashSessionReport, MovementReportRow } from '@/services/cashbank.service'

/**
 * Exporta los reportes de caja a Excel. Se usa writeXlsx directo (y no exportTableToExcel)
 * porque el resumen de sesión tiene varias secciones y necesita una hoja por cada una,
 * igual que el PDF.
 *
 * Los importes van como número, no como texto: poder sumarlos y filtrarlos es justamente
 * la razón de pedir Excel en vez del PDF.
 */
function money(n: unknown): CellValue {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

type MovementDetailRow = {
  date: string
  type: string
  doc_number: string
  reference: string
  amount: number
  payment_method: string
}

// movementTypeLabel — etiqueta legible para el campo `type` de cualquier fila de detalle
// (ingresos, egresos, anuladas, crédito/CxP generados). Mismo mapeo que CashReportsPage.tsx
// (pantalla) y cashSessionReportPdf.ts, para que las 3 vistas del mismo reporte digan lo mismo.
// Un tipo desconocido muestra el texto crudo, nunca una etiqueta incorrecta.
function movementTypeLabel(type: string): string {
  switch (type) {
    case 'venta':
      return 'Venta'
    case 'cobro_cxc':
      return 'Cobro CxC'
    case 'compra':
      return 'Compra'
    case 'gasto':
      return 'Gasto'
    case 'ingreso_manual':
      return 'Ingreso manual'
    case 'egreso_manual':
      return 'Egreso manual'
    case 'otro':
      return 'Otro'
    case 'pago_proveedor':
      return 'Pago a proveedor'
    case 'credito_generado':
      return 'Crédito generado (CxC)'
    case 'cxp_generada':
      return 'Cuenta por pagar generada (CxP)'
    case 'anulacion_venta':
      return 'Anulación de venta'
    default:
      return type || ''
  }
}

function detailSheet(
  title: string,
  rows: MovementDetailRow[],
  methodLabel: (code: string) => string,
): CellValue[][] {
  const out: CellValue[][] = [
    [title],
    [],
    ['Fecha', 'Tipo', 'Documento', 'Referencia', 'Método de pago', 'Monto'],
  ]
  for (const r of rows) {
    out.push([
      r.date ?? '',
      movementTypeLabel(r.type ?? ''),
      r.doc_number ?? '',
      r.reference ?? '',
      methodLabel(r.payment_method ?? ''),
      money(r.amount),
    ])
  }
  if (rows.length === 0) out.push(['Sin movimientos'])
  return out
}

/** Resumen de una sesión de caja: totales, efectivo, ingresos, egresos y métodos. */
export function downloadCashSessionReportExcel(
  report: CashSessionReport,
  methodLabel: (code: string) => string,
): Promise<void> {
  const s = report.session
  const t = report.totals

  const resumen: CellValue[][] = [
    ['REPORTE DE SESIÓN DE CAJA'],
    [],
    ['Sesión', s?.id ?? ''],
    ['Abierta por', s?.opened_by_user_name ?? ''],
    ['Sucursal', s?.branch_name ?? ''],
    ['Apertura', s?.opened_at ?? ''],
    ['Cierre', s?.closed_at ?? ''],
    ['Estado', s?.status ?? ''],
    [],
    ['TOTALES'],
    ['Concepto', 'Monto'],
    ['Saldo inicial', money(s?.opening_balance)],
    ['Total ingresos', money(t?.total_income)],
    ['Total egresos', money(t?.total_expense)],
    ['Total ventas', money(t?.total_sales)],
    ['Total compras', money(t?.total_purchases)],
    ['Saldo final', money(t?.final_balance)],
  ]
  if (t?.total_detraccion_spot) {
    resumen.push(['Detracción SPOT', money(t.total_detraccion_spot)])
  }
  if (report.credit_generated?.total) {
    resumen.push(['Crédito generado (CxC, sin cobrar)', money(report.credit_generated.total)])
  }
  if (report.payable_generated?.total) {
    resumen.push(['Cuenta por pagar generada (CxP, sin pagar)', money(report.payable_generated.total)])
  }

  const cash = report.cash_physical
  if (cash) {
    resumen.push([], ['EFECTIVO EN CAJA'], ['Concepto', 'Monto'])
    resumen.push(['Saldo de apertura', money(cash.opening_balance)])
    resumen.push(['Ingresos', money(cash.total_income)])
    resumen.push(['Egresos', money(cash.total_expense)])
    resumen.push(['Saldo físico', money(cash.physical_balance)])
    if (s?.closing_balance != null) {
      resumen.push(['Saldo de cierre declarado', money(s.closing_balance)])
      resumen.push(['Diferencia', money(Number(s.closing_balance) - Number(cash.physical_balance))])
    }
  }

  const metodos: CellValue[][] = [['TOTALES POR MÉTODO DE PAGO'], []]
  const bloques: [string, { method: string; total: number }[]][] = [
    ['Ventas', report.totals_by_method?.sales ?? []],
    ['Compras', report.totals_by_method?.purchases ?? []],
    ['Movimientos', report.totals_by_method?.movements ?? []],
  ]
  for (const [label, list] of bloques) {
    metodos.push([label], ['Método', 'Total'])
    if (list.length === 0) metodos.push(['Sin registros'])
    for (const m of list) metodos.push([methodLabel(m.method ?? ''), money(m.total)])
    metodos.push([])
  }

  const sheets = [
    { name: 'Resumen', rows: resumen },
    { name: 'Ingresos', rows: detailSheet('INGRESOS', report.income_detail ?? [], methodLabel) },
    { name: 'Egresos', rows: detailSheet('EGRESOS', report.expense_detail ?? [], methodLabel) },
    { name: 'Por método', rows: metodos },
  ]
  const anuladas = report.cancelled_sales_detail ?? []
  if (anuladas.length > 0) {
    sheets.push({ name: 'Anuladas', rows: detailSheet('VENTAS ANULADAS', anuladas, methodLabel) })
  }
  const creditoGenerado = report.credit_generated?.sales ?? []
  if (creditoGenerado.length > 0) {
    sheets.push({ name: 'Crédito generado', rows: detailSheet('CRÉDITO GENERADO (CxC, SIN COBRAR)', creditoGenerado, methodLabel) })
  }
  const cxpGenerada = report.payable_generated?.purchases ?? []
  if (cxpGenerada.length > 0) {
    sheets.push({ name: 'CxP generada', rows: detailSheet('CUENTA POR PAGAR GENERADA (CxP, SIN PAGAR)', cxpGenerada, methodLabel) })
  }

  return writeXlsx({ sheets }).then((bytes) => downloadXlsxBytes(bytes, `reporte-caja-sesion-${s?.id ?? ''}.xlsx`))
}

/** Movimientos de caja del periodo filtrado. */
export function downloadCashMovementsReportExcel(input: {
  filtersLabel: string
  movements: MovementReportRow[]
  detractionMovements?: MovementReportRow[]
  methodLabel: (code: string) => string
}): Promise<void> {
  const { filtersLabel, movements, detractionMovements = [], methodLabel } = input

  const header = [
    'Fecha',
    'Tipo',
    'Documento',
    'Cliente / Proveedor',
    'Usuario',
    'Sucursal',
    'Método de pago',
    'Monto',
  ]
  const toRows = (list: MovementReportRow[]): CellValue[][] =>
    list.map((m) => [
      m.date ?? '',
      m.type ?? '',
      m.doc_number ?? '',
      m.contact_name ?? '',
      m.user_name ?? '',
      m.branch_name ?? '',
      methodLabel(m.payment_method ?? ''),
      money(m.amount),
    ])

  const rows: CellValue[][] = [['MOVIMIENTOS DE CAJA'], [filtersLabel], [], header, ...toRows(movements)]
  if (movements.length === 0) rows.push(['Sin movimientos para los filtros seleccionados'])

  const sheets = [{ name: 'Movimientos', rows }]
  if (detractionMovements.length > 0) {
    sheets.push({
      name: 'Detracción SPOT',
      rows: [['DETRACCIÓN SPOT'], [], header, ...toRows(detractionMovements)],
    })
  }

  return writeXlsx({ sheets }).then((bytes) => downloadXlsxBytes(bytes, 'reporte-caja-movimientos.xlsx'))
}
