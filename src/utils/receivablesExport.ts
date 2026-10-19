import { exportTableToPdf, type ExportColumn as PdfExportColumn } from '@/utils/exportPdf'
import { exportTableToExcel, type ExportColumn as ExcelExportColumn } from '@/utils/exportExcel'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'
import { formatSaleMoney, saleCurrencySymbol } from '@/utils/formatMoney'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import type { ReceivableRow } from '@/services/receivables.service'

/** Fila de la exportación: el comprobante más los campos derivados que no vienen del backend. */
type ExportRow = ReceivableRow & {
  currency_code: string
  cuotas_text: string
  estado_text: string
  /** Neto cobrable: con detracción es lo que se cobra directo; sin detracción, el total. */
  neto_cobrar: number
}

const BN_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  rejected: 'Rechazada',
  self_pending: 'Autodetracción',
}

const dateCell = (v: unknown): string => {
  const s = String(v ?? '').trim()
  if (!s) return '—'
  return formatDisplayDatePeru(s.includes('T') ? s.slice(0, 10) : s)
}

function toExportRows(rows: ReceivableRow[]): ExportRow[] {
  return rows.map((r) => {
    const instTotal = r.installments?.length ?? 0
    const isCredit = r.status === 'credit' || r.payment_condition_code === 'credit'
    return {
      ...r,
      currency_code: (r.currency || 'PEN').toUpperCase(),
      cuotas_text:
        instTotal > 0
          ? `${r.installments_pending ?? 0} pend. / ${instTotal}`
          : isCredit
            ? 'Crédito'
            : '—',
      estado_text: r.direct_due > 0 ? (r.is_overdue ? 'Vencido' : 'Vigente') : r.spot_pending > 0 ? 'SPOT pendiente' : 'Cobrado',
      neto_cobrar: r.has_detraccion ? r.direct_target : r.total,
    }
  })
}

const n2 = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

interface Col {
  key: string
  label: string
  weight: number
  money?: boolean
  align?: 'right' | 'center'
  format?: (v: unknown, r: ExportRow) => string
}

/** Mismas columnas que la tabla de la vista (más N° de documento, emisión y moneda). */
const COLS: Col[] = [
  { key: 'sale_number', label: 'Comprobante', weight: 20 },
  { key: 'contact_name', label: 'Cliente', weight: 38, format: (v) => String(v || '—') },
  { key: 'contact_doc_number', label: 'N° documento', weight: 18, format: (v) => String(v || '—') },
  { key: 'issue_date', label: 'Emisión', weight: 16, format: dateCell },
  { key: 'due_date', label: 'Vencimiento', weight: 19, format: dateCell },
  { key: 'cuotas_text', label: 'Cuotas', weight: 16 },
  { key: 'currency_code', label: 'Moneda', weight: 12, align: 'center' },
  { key: 'total', label: 'Total', weight: 18, money: true, align: 'right' },
  { key: 'neto_cobrar', label: 'Neto a cobrar', weight: 18, money: true, align: 'right' },
  { key: 'direct_paid', label: 'Cobrado', weight: 18, money: true, align: 'right' },
  { key: 'direct_due', label: 'Saldo', weight: 18, money: true, align: 'right' },
  { key: 'spot_pending', label: 'SPOT BN pend. (S/)', weight: 18, align: 'right', format: (v) => (Number(v) > 0 ? n2(v) : '—') },
  {
    key: 'bn_confirmation_status',
    label: 'Estado BN',
    weight: 20,
    format: (v, r) => (r.has_detraccion ? BN_STATUS_LABELS[String(v ?? '')] ?? (String(v || '') || '—') : '—'),
  },
  { key: 'estado_text', label: 'Estado', weight: 14 },
]

const SUM_KEYS = ['total', 'neto_cobrar', 'direct_paid', 'direct_due', 'spot_pending'] as const

function excelCols(): ExcelExportColumn<ExportRow>[] {
  return COLS.map((c) => ({
    key: c.key,
    label: c.label,
    excelNumber: c.money || c.key === 'spot_pending',
    format: c.format as ExcelExportColumn<ExportRow>['format'],
  }))
}

function pdfCols(): PdfExportColumn<ExportRow>[] {
  return COLS.map((c) => ({
    key: c.key,
    label: c.label,
    weight: c.weight,
    align: c.align,
    format: c.money
      ? (v: unknown, r: ExportRow) => formatSaleMoney(Number(v) || 0, r.currency_code)
      : (c.format as PdfExportColumn<ExportRow>['format']),
  }))
}

/** Una fila de totales por moneda (nunca se suman PEN y USD entre sí). */
function totalsByCurrency(rows: ExportRow[]): { currency: string; count: number; sums: Record<string, number> }[] {
  const map = new Map<string, { currency: string; count: number; sums: Record<string, number> }>()
  for (const r of rows) {
    let g = map.get(r.currency_code)
    if (!g) {
      g = { currency: r.currency_code, count: 0, sums: Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) }
      map.set(r.currency_code, g)
    }
    g.count++
    for (const k of SUM_KEYS) g.sums[k] += Number(r[k]) || 0
  }
  return [...map.values()].sort((a, b) => (a.currency === 'PEN' ? -1 : b.currency === 'PEN' ? 1 : a.currency.localeCompare(b.currency)))
}

function footerRows(rows: ExportRow[]): (string | number)[][] {
  const groups = totalsByCurrency(rows)
  const multi = groups.length > 1
  return groups.map((g) =>
    COLS.map((c, i) => {
      if (i === 0) return multi ? `TOTAL ${saleCurrencySymbol(g.currency)}` : 'TOTAL'
      if (c.key === 'contact_name') return `${g.count} comprobante(s)`
      if (c.key === 'currency_code') return g.currency
      if (c.money || c.key === 'spot_pending') {
        return Math.round((g.sums[c.key] ?? 0) * 100) / 100
      }
      return ''
    }),
  )
}

export interface ReceivablesExportContext {
  statusLabel: string
  search: string
}

function subtitleLines(ctx: ReceivablesExportContext): string[] {
  const cfg = getCompanyConfigCache()
  const company = cfg ? [cfg.business_name || cfg.trade_name, cfg.ruc ? `RUC ${cfg.ruc}` : ''].filter(Boolean).join(' · ') : ''
  return [
    ...(company ? [company] : []),
    [`Estado: ${ctx.statusLabel}`, ctx.search.trim() ? `Búsqueda: "${ctx.search.trim()}"` : '']
      .filter(Boolean)
      .join('  ·  '),
  ]
}

const fileDate = () => getTodayPeru()

export async function exportReceivablesPdf(rows: ReceivableRow[], ctx: ReceivablesExportContext): Promise<void> {
  const data = toExportRows(rows)
  const groups = totalsByCurrency(data)
  await exportTableToPdf<ExportRow>('Cuentas por cobrar', pdfCols(), data, `cuentas-por-cobrar-${fileDate()}.pdf`, {
    subtitle: subtitleLines(ctx),
    summary: groups.map((g) => ({
      label: `Saldo pendiente ${g.currency} (${g.count})`,
      value: formatSaleMoney(Math.round(g.sums.direct_due * 100) / 100, g.currency),
    })),
    footerRows: footerRows(data),
    rowTextColor: (r) => (r.estado_text === 'Vencido' ? [200, 30, 30] : undefined),
  })
}

export async function exportReceivablesExcel(rows: ReceivableRow[]): Promise<void> {
  const data = toExportRows(rows)
  await exportTableToExcel<ExportRow>(
    'Cuentas por cobrar',
    excelCols(),
    data,
    `cuentas-por-cobrar-${fileDate()}.xlsx`,
    footerRows(data),
  )
}
