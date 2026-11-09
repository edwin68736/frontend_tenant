import api from './api'

/** Tabla genérica que arma el backend; el navegador la convierte a Excel (ver utils/accountingExport.ts). */
export interface AccountingTable {
  file_name: string
  sheet: string
  preamble?: string[] | null
  no_header?: boolean
  columns: string[] | null
  rows: (string | number | null)[][] | null
  footer?: (string | number | null)[][] | null
  warnings?: string[] | null
}

export interface AccountingExport {
  table?: AccountingTable
  text?: string
  file_name: string
  warnings?: string[] | null
}

export interface SummaryRow {
  type: string
  sunat_code: string
  series: string
  quantity: number
  first_number: string
  last_number: string
  taxable_base: number
  igv: number
  icbper: number
  total: number
  gaps: string
}
export interface VoidedRow {
  type: string
  sunat_code: string
  series: string
  numbers: string
  quantity: number
  total: number
}
export interface SummaryReport {
  from: string
  to: string
  confirmed: SummaryRow[] | null
  voided: VoidedRow[] | null
  confirmed_totals: SummaryRow
  voided_total: number
  not_accepted: number
  warnings?: string[] | null
}

export interface LedgerRow {
  code: string
  name: string
  level: number
  kind: string
  previous: number
  debit: number
  credit: number
  final: number
}
export interface Ledger {
  month: string
  company: string
  ruc: string
  from: string
  to: string
  rows: LedgerRow[] | null
  notes: string[] | null
  warnings?: string[] | null
}

export interface AccountingSettings {
  receivable_pen: string
  receivable_usd: string
  igv_sales_pen: string
  igv_sales_usd: string
  taxed_pen: string
  taxed_usd: string
  exonerated: string
  unaffected: string
  exportation: string
  icbper: string
  payable_pen: string
  payable_usd: string
  igv_purchases: string
  purchase_cost: string
  subdiario_sales: string
}
export interface AccountingDefaults {
  ReceivablePEN: string
  ReceivableUSD: string
  IgvSalesPEN: string
  IgvSalesUSD: string
  TaxedPEN: string
  TaxedUSD: string
  Exonerated: string
  Unaffected: string
  Exportation: string
  Icbper: string
  SubdiarioSales: string
}

export interface SireSettingsView {
  client_id: string
  sol_username: string
  has_client_secret: boolean
  has_sol_password: boolean
  encryption_ok: boolean
}
export interface SirePeriod {
  year: string
  status: string
  periods: { period: string; status: string }[] | null
}
export interface SireTicket {
  id: number
  book: string
  period: string
  ticket: string
  status_code: string
  status_text: string
  file_name: string
  accepted_at: string | null
  created_at: string
}
export type SireMatch = 'ok' | 'diff' | 'only_sunat' | 'only_system'
export interface SireRow {
  source: 'sunat' | 'system'
  date: string
  doc_type: string
  series: string
  number: string
  total: number
  local_total: number
  match: SireMatch
  document: string
}
export interface SireResult {
  ticket: SireTicket
  ready: boolean
  rows: SireRow[] | null
  summary: Record<string, number>
  file_name?: string
  warnings?: string[] | null
  total_sunat: number
  total_system: number
}

const d = <T,>(r: { data: { data: T } }) => r.data.data

export const accountingService = {
  salesRegister: (month: string, withStatus: boolean) =>
    api.get('/api/accounting/registers/sales', { params: { month, with_status: withStatus ? 1 : 0 } }).then(d<AccountingTable>),
  purchasesRegister: (month: string) =>
    api.get('/api/accounting/registers/purchases', { params: { month } }).then(d<AccountingTable>),
  summary: (from: string, to: string) =>
    api.get('/api/accounting/summary', { params: { from, to } }).then(d<SummaryReport>),
  formats: () => api.get('/api/accounting/formats').then(d<{ key: string; name: string }[]>),
  exportFormat: (format: string, month: string) =>
    api.get('/api/accounting/formats/export', { params: { format, month } }).then(d<AccountingExport>),
  ledger: (month: string) => api.get('/api/accounting/ledger', { params: { month } }).then(d<Ledger>),

  getSettings: () =>
    api.get('/api/accounting/settings').then(d<{ settings: AccountingSettings; defaults: AccountingDefaults }>),
  saveSettings: (s: Partial<AccountingSettings>) => api.put('/api/accounting/settings', s).then(d<AccountingSettings>),

  sireSettings: () => api.get('/api/accounting/sire/settings').then(d<SireSettingsView>),
  saveSireSettings: (s: { client_id: string; client_secret: string; sol_username: string; sol_password: string }) =>
    api.put('/api/accounting/sire/settings', s).then(d<SireSettingsView>),
  sirePeriods: (book: string) => api.get(`/api/accounting/sire/${book}/periods`).then(d<SirePeriod[]>),
  sireTickets: (book: string) => api.get(`/api/accounting/sire/${book}/tickets`).then(d<SireTicket[]>),
  sireRequestTicket: (book: string, period: string) =>
    api.post(`/api/accounting/sire/${book}/tickets`, { period }).then(d<SireTicket>),
  sireQuery: (book: string, period: string, ticket: string) =>
    api.post(`/api/accounting/sire/${book}/query`, { period, ticket }).then(d<SireResult>),
  sireAccept: (period: string) =>
    api.post('/api/accounting/sire/sale/accept', { period, confirm: true }).then(d<{ accepted: boolean }>),
}
