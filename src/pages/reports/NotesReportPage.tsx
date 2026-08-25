import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, RefreshCw } from 'lucide-react'
import { salesService, type Sale } from '@/services/sales.service'
import { companyService, type BranchRow } from '@/services/company.service'
import { useBranch } from '@/contexts/BranchContext'
import { exportTableToExcel, type ExportColumn } from '@/utils/exportExcel'
import { formatSaleDocumentNumber } from '@/utils/format'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'
import { formatSaleMoney } from '@/utils/formatMoney'
import {
  billingStatusColor,
  billingStatusLabel,
  normalizeBillingStatus,
} from '@/constants/billingStatus'

type NoteKind = 'all' | 'credit' | 'debit'

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type MotiveGroup = {
  code: string
  label: string
  docType: string
  count: number
  total: number
}

export default function NotesReportPage() {
  const { activeBranchId } = useBranch()
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [branchId, setBranchId] = useState<number | ''>('')
  const [kind, setKind] = useState<NoteKind>('all')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(getTodayPeru())
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Sale[]>([])

  useEffect(() => {
    companyService.listBranches().then((b) => setBranches(Array.isArray(b) ? b : [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (branchId === '' && activeBranchId > 0) setBranchId(activeBranchId)
  }, [activeBranchId, branchId])

  const load = async () => {
    setLoading(true)
    try {
      const docTypes = kind === 'credit' ? ['NOTA_CREDITO'] : kind === 'debit' ? ['NOTA_DEBITO'] : ['NOTA_CREDITO', 'NOTA_DEBITO']
      const results = await Promise.all(
        docTypes.map((doc_type) =>
          salesService.list({
            doc_type,
            from,
            to,
            branch_id: branchId === '' ? undefined : branchId,
            export_all: '1',
          }),
        ),
      )
      setRows(results.flatMap((r) => r.data))
    } catch {
      toast.error('Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const motives = useMemo<MotiveGroup[]>(() => {
    const map = new Map<string, MotiveGroup>()
    for (const r of rows) {
      const code = r.note_type_code || '—'
      const key = `${r.doc_type}:${code}`
      const g = map.get(key) ?? {
        code,
        label: r.note_type_reason || 'Sin motivo declarado',
        docType: r.doc_type,
        count: 0,
        total: 0,
      }
      g.count += 1
      g.total += r.total
      map.set(key, g)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [rows])

  const totals = useMemo(
    () => ({
      count: rows.length,
      total: rows.reduce((s, r) => s + r.total, 0),
      credit: rows.filter((r) => r.doc_type === 'NOTA_CREDITO').reduce((s, r) => s + r.total, 0),
      debit: rows.filter((r) => r.doc_type === 'NOTA_DEBITO').reduce((s, r) => s + r.total, 0),
    }),
    [rows],
  )

  const exportColumns: ExportColumn<Sale>[] = [
    { key: 'issue_date', label: 'Fecha', format: (v) => formatDisplayDatePeru(String(v)) },
    { key: 'doc_type', label: 'Tipo', format: (v) => (v === 'NOTA_DEBITO' ? 'Nota de débito' : 'Nota de crédito') },
    { key: 'number', label: 'Número', format: (_v, row) => formatSaleDocumentNumber(row.series, row.number) },
    { key: 'note_type_code', label: 'Motivo (código)' },
    { key: 'note_type_reason', label: 'Motivo' },
    { key: 'affected_doc_number', label: 'Comprobante afectado' },
    { key: 'contact_name', label: 'Cliente' },
    { key: 'billing_status', label: 'Estado SUNAT', format: (v) => billingStatusLabel(normalizeBillingStatus(String(v))) },
    { key: 'total', label: 'Monto', excelNumber: true },
  ]

  const exportExcel = () => {
    void exportTableToExcel('Notas', exportColumns, rows, `notas_${from}_a_${to}`, [
      '', '', '', '', '', '', '', 'TOTAL', totals.total,
    ])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Reporte de notas de crédito y débito</h2>
          <p className="text-sm text-gray-500">Por período y motivo declarado a SUNAT.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
          >
            <FileSpreadsheet size={14} /> Exportar
          </button>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-end bg-white border border-gray-200 rounded-2xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="all">Todas</option>
            <option value="credit">Solo crédito</option>
            <option value="debit">Solo débito</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Todas</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Notas de crédito</p>
          <p className="text-lg font-bold text-orange-700">{formatSaleMoney(totals.credit)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Notas de débito</p>
          <p className="text-lg font-bold text-blue-700">{formatSaleMoney(totals.debit)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">Total del período ({totals.count} notas)</p>
          <p className="text-lg font-bold text-gray-800">{formatSaleMoney(totals.total)}</p>
        </div>
      </div>

      {/* Por motivo */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Por motivo</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-y border-gray-100">
            <tr>
              {['Tipo', 'Motivo', 'Cant.', 'Monto'].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {motives.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin notas en el período.</td></tr>
            ) : motives.map((m) => (
              <tr key={`${m.docType}:${m.code}`} className="border-b border-gray-50">
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.docType === 'NOTA_DEBITO' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                    {m.docType === 'NOTA_DEBITO' ? 'Débito' : 'Crédito'}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-700">{m.code} - {m.label}</td>
                <td className="px-4 py-2 text-gray-600">{m.count}</td>
                <td className="px-4 py-2 font-medium text-gray-800">{formatSaleMoney(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalle */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Detalle</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-y border-gray-100">
              <tr>
                {['Fecha', 'Número', 'Motivo', 'Comprobante afectado', 'Cliente', 'Estado', 'Monto'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400"><RefreshCw size={18} className="animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin notas en el período.</td></tr>
              ) : rows.map((r) => {
                const bs = normalizeBillingStatus(r.billing_status)
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDisplayDatePeru(r.issue_date)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{formatSaleDocumentNumber(r.series, r.number)}</td>
                    <td className="px-4 py-2 text-gray-600">{r.note_type_code ? `${r.note_type_code} - ${r.note_type_reason ?? ''}` : '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.affected_doc_number || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{r.contact_name || '—'}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(bs)}`}>{billingStatusLabel(bs)}</span></td>
                    <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{formatSaleMoney(r.total, r.currency)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
