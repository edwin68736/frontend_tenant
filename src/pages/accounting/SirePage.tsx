import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Download, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  accountingService, type SireMatch, type SirePeriod, type SireResult, type SireTicket,
} from '@/services/accounting.service'
import { downloadSimpleSheet, errMessage, money } from '@/utils/accountingExport'
import {
  AccountingPage, Card, Field, Spinner, Warnings, btnPrimary, btnSecondary, inputCls,
} from '@/components/accounting/AccountingUi'

const MATCH_LABEL: Record<SireMatch, string> = {
  ok: 'Coincide',
  diff: 'Diferencia de monto',
  only_sunat: 'Solo en SUNAT',
  only_system: 'Solo en el sistema',
}
const MATCH_CLS: Record<SireMatch, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  diff: 'bg-red-50 text-red-700',
  only_sunat: 'bg-amber-50 text-amber-800',
  only_system: 'bg-blue-50 text-blue-700',
}

/** SIRE (ventas o compras): propuesta de SUNAT comparada con lo registrado en Tukifac. */
export default function SirePage() {
  const { book: bookParam } = useParams()
  const book = bookParam === 'purchase' ? 'purchase' : 'sale'
  const { hasPermission } = useAuth()
  const canManage = hasPermission('accounting.sire_manage')
  const [periods, setPeriods] = useState<SirePeriod[]>([])
  const [year, setYear] = useState('')
  const [period, setPeriod] = useState('')
  const [tickets, setTickets] = useState<SireTicket[]>([])
  const [ticket, setTicket] = useState<SireTicket | null>(null)
  const [result, setResult] = useState<SireResult | null>(null)
  const [filter, setFilter] = useState<'all' | SireMatch>('all')
  const [loading, setLoading] = useState(false)
  const [needsConfig, setNeedsConfig] = useState(false)

  // quiet: en la carga inicial, la falta de credenciales ya se explica con el aviso amarillo (con su enlace); un toast
  // rojo además de ese aviso era un error duplicado nada más abrir la página.
  const handleErr = useCallback((e: unknown, quiet = false) => {
    const msg = errMessage(e)
    const missingConfig = msg.includes('credenciales SIRE')
    setNeedsConfig(missingConfig)
    if (!(quiet && missingConfig)) toast.error(msg)
  }, [])

  const loadTickets = useCallback(async () => {
    try {
      setTickets((await accountingService.sireTickets(book)) ?? [])
    } catch {
      /* el historial es secundario */
    }
  }, [book])

  useEffect(() => {
    setPeriods([])
    setYear('')
    setPeriod('')
    setTicket(null)
    setResult(null)
    setNeedsConfig(false)
    setLoading(true)
    // Sin credenciales no se pide nada a SUNAT: el servidor respondería 400 (error en consola) y el aviso con el
    // enlace a Ajustes ya lo explica. sireSettings nunca devuelve los secretos, solo si están guardados.
    accountingService
      .sireSettings()
      .then((cfg) => {
        if (!(cfg.client_id && cfg.sol_username && cfg.has_client_secret && cfg.has_sol_password)) {
          setNeedsConfig(true)
          return null
        }
        return accountingService.sirePeriods(book)
      })
      .then((p) => {
        if (!p) return
        setPeriods(p)
        if (p.length) setYear(p[0].year)
      })
      .catch((e) => handleErr(e, true))
      .finally(() => setLoading(false))
    void loadTickets()
  }, [book, handleErr, loadTickets])

  const periodOptions = useMemo(() => periods.find((p) => p.year === year)?.periods ?? [], [periods, year])

  const request = async () => {
    if (!period) return
    setLoading(true)
    try {
      const t = await accountingService.sireRequestTicket(book, period)
      setTicket(t)
      setResult(null)
      toast.success(`Ticket ${t.ticket} solicitado. Consulta su estado en unos segundos.`)
      void loadTickets()
    } catch (e) {
      handleErr(e)
    } finally {
      setLoading(false)
    }
  }

  const query = async (t: SireTicket | null = ticket) => {
    if (!t) return
    setLoading(true)
    try {
      const r = await accountingService.sireQuery(book, t.period, t.ticket)
      setTicket(r.ticket)
      setResult(r)
      setFilter('all')
      if (!r.ready) toast.info(`Estado del ticket: ${r.ticket.status_text || r.ticket.status_code}`)
      void loadTickets()
    } catch (e) {
      handleErr(e)
    } finally {
      setLoading(false)
    }
  }

  const accept = async () => {
    if (!ticket) return
    const ok = window.confirm(
      `¿Aceptar la propuesta de ventas del periodo ${ticket.period} en SUNAT?\n\nEsta acción es irreversible. Revisa antes las diferencias de la tabla.`,
    )
    if (!ok) return
    setLoading(true)
    try {
      await accountingService.sireAccept(ticket.period)
      toast.success('Propuesta aceptada en SUNAT')
      void loadTickets()
    } catch (e) {
      handleErr(e)
    } finally {
      setLoading(false)
    }
  }

  const rows = (result?.rows ?? []).filter((r) => filter === 'all' || r.match === filter)

  const exportExcel = async () => {
    if (!result) return
    await downloadSimpleSheet(
      'SIRE',
      `sire-${book}-${result.ticket.period}.xlsx`,
      [`SIRE ${book === 'sale' ? 'ventas (RVIE)' : 'compras (RCE)'} — periodo ${result.ticket.period}`, `Ticket ${result.ticket.ticket}`],
      ['Resultado', 'Fecha', 'Tipo doc.', 'Serie', 'Número', 'Total SUNAT', 'Total sistema'],
      (result.rows ?? []).map((r) => [MATCH_LABEL[r.match], r.date, r.doc_type, r.series, r.number, r.source === 'sunat' ? r.total : '', r.local_total || '']),
    )
  }

  return (
    <AccountingPage
      title={book === 'sale' ? 'SIRE – Ventas (RVIE)' : 'SIRE – Compras (RCE)'}
      subtitle="Pide la propuesta a SUNAT, descárgala y compárala con lo registrado en Tukifac."
    >
      {needsConfig && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Faltan las credenciales SIRE.{' '}
          <Link to="/ajustes" state={{ erpSettingsTab: 'contabilidad' }} className="font-semibold underline">
            Configúralas aquí
          </Link>
          .
        </div>
      )}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Año">
            <select className={inputCls} value={year} onChange={(e) => { setYear(e.target.value); setPeriod('') }}>
              <option value="">Seleccionar</option>
              {periods.map((p) => (
                <option key={p.year} value={p.year}>{p.year} – {p.status}</option>
              ))}
            </select>
          </Field>
          <Field label="Periodo">
            <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">Seleccionar</option>
              {periodOptions.map((p) => (
                <option key={p.period} value={p.period}>{p.period} – {p.status}</option>
              ))}
            </select>
          </Field>
          {canManage && (
            <button type="button" className={btnPrimary} disabled={!period || loading} onClick={() => void request()}>
              <Send size={16} /> Enviar
            </button>
          )}
        </div>
      </Card>

      {tickets.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-800 mb-2 text-sm">Tickets recientes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1">Periodo</th><th className="text-left">Ticket</th><th className="text-left">Estado</th>
                  <th className="text-left">Aceptada</th><th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className={`border-t border-gray-100 ${ticket?.id === t.id ? 'bg-gray-50' : ''}`}>
                    <td className="py-1.5">{t.period}</td>
                    <td>{t.ticket}</td>
                    <td>{t.status_text || t.status_code}</td>
                    <td>{t.accepted_at ? new Date(t.accepted_at).toLocaleDateString('es-PE') : '—'}</td>
                    <td className="text-right">
                      <button type="button" className="text-[rgb(var(--p600))] font-medium" onClick={() => { setTicket(t); void query(t) }}>
                        Consultar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {ticket && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Ticket actual: <strong>{ticket.ticket}</strong></span>
            <span>Periodo: <strong>{ticket.period}</strong></span>
            <span>Estado: <strong>{ticket.status_text || ticket.status_code}</strong></span>
            <button type="button" className={btnSecondary} disabled={loading} onClick={() => void query()}>
              <RefreshCw size={16} /> Consultar
            </button>
          </div>
        </Card>
      )}

      {loading && <Spinner text="Consultando a SUNAT…" />}

      {result?.ready && !loading && (
        <div className="space-y-3">
          <Warnings items={result.warnings} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['all', 'ok', 'diff', 'only_sunat', 'only_system'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-full border ${filter === k ? 'border-[rgb(var(--p600))] text-[rgb(var(--p600))] font-semibold' : 'border-gray-200 text-gray-600'}`}
              >
                {k === 'all' ? `Todos (${result.rows?.length ?? 0})` : `${MATCH_LABEL[k]} (${result.summary[k] ?? 0})`}
              </button>
            ))}
            <span className="ml-auto text-gray-500">
              Total SUNAT S/ {money(result.total_sunat)} · Total sistema S/ {money(result.total_system)}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={() => void exportExcel()}>
              <Download size={16} /> Exportar Excel
            </button>
            {book === 'sale' && canManage && (
              <button type="button" className={btnPrimary} onClick={() => void accept()}>
                <CheckCircle2 size={16} /> Aceptar propuesta
              </button>
            )}
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-[28rem]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Resultado', 'F. emisión', 'Tipo documento', 'Serie', 'Número', 'Total SUNAT', 'Total sistema'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full ${MATCH_CLS[r.match]}`}>{MATCH_LABEL[r.match]}</span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5">{r.doc_type}</td>
                    <td className="px-2 py-1.5">{r.series}</td>
                    <td className="px-2 py-1.5">{r.number}</td>
                    <td className="px-2 py-1.5">{r.source === 'sunat' ? money(r.total) : '—'}</td>
                    <td className="px-2 py-1.5">{r.match === 'only_sunat' ? '—' : money(r.local_total)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-500">No se encontraron resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AccountingPage>
  )
}
