import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import {
  buildSunatFiscalDetailView,
  SUNAT_OBSERVED_HELP,
  SUNAT_OUTCOME_LABELS,
  type SunatFiscalInvoiceInput,
  type SunatFiscalOutcome,
} from '@/utils/sunatFiscalDetail'

type Props = {
  billingStatus?: string
  invoice?: SunatFiscalInvoiceInput | null
  /** Etiqueta de estado de venta (ej. billingStatusLabel) */
  statusLabel?: string
  statusColorClass?: string
}

const OUTCOME_ICON: Record<SunatFiscalOutcome, typeof CheckCircle2> = {
  accepted: CheckCircle2,
  observed: AlertTriangle,
  rejected: XCircle,
  pending: AlertTriangle,
  error: XCircle,
  unknown: HelpCircle,
}

const OUTCOME_BOX: Record<SunatFiscalOutcome, string> = {
  accepted: 'bg-green-50 border-green-200 text-green-900',
  observed: 'bg-amber-50 border-amber-200 text-amber-950',
  rejected: 'bg-red-50 border-red-200 text-red-900',
  pending: 'bg-blue-50 border-blue-200 text-blue-900',
  error: 'bg-orange-50 border-orange-200 text-orange-900',
  unknown: 'bg-gray-50 border-gray-200 text-gray-800',
}

export function SunatResponseDetail({ billingStatus, invoice, statusLabel, statusColorClass }: Props) {
  const view = buildSunatFiscalDetailView(invoice, billingStatus)
  if (!view) {
    return <p className="text-xs text-gray-500">Sin datos de respuesta SUNAT.</p>
  }

  const Icon = OUTCOME_ICON[view.outcome]
  const hasObs = view.observations.length > 0 || view.outcome === 'observed'

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-3 ${OUTCOME_BOX[view.outcome]}`}>
        <div className="flex flex-wrap items-start gap-2">
          <Icon className="shrink-0 mt-0.5" size={18} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{SUNAT_OUTCOME_LABELS[view.outcome]}</span>
              {statusLabel && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColorClass ?? 'bg-white/80'}`}>
                  {statusLabel}
                </span>
              )}
            </div>
            {view.cdrCode != null && view.cdrCode !== '' && (
              <p className="text-xs mt-1 opacity-90">
                <span className="font-medium">Código CDR:</span>{' '}
                <span className="font-mono">{view.cdrCode}</span>
                {view.cdrCode === '0' && !hasObs && ' (sin observaciones)'}
                {view.cdrCode === '0' && hasObs && ' (aceptado; ver observaciones abajo)'}
              </p>
            )}
            {view.pipelineStatus && (
              <p className="text-xs mt-0.5 opacity-80">
                <span className="font-medium">Pipeline:</span>{' '}
                <span className="font-mono">{view.pipelineStatus}</span>
              </p>
            )}
            {view.summary && (
              <p className="text-xs mt-2 leading-relaxed">{view.summary}</p>
            )}
          </div>
        </div>
      </div>

      {hasObs && (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">
              Observaciones SUNAT ({view.observations.length})
            </p>
            {view.observations.length === 0 ? (
              <p className="text-xs text-amber-800">
                El comprobante fue aceptado con advertencias. Revise el mensaje completo más abajo.
              </p>
            ) : (
              <ul className="space-y-2">
                {view.observations.map((o, i) => (
                  <li key={`${o.code}-${i}`} className="text-xs text-amber-950 bg-white/60 rounded-lg p-2 border border-amber-100">
                    <span className="font-mono font-bold text-amber-900">{o.code}</span>
                    {o.message ? <span className="ml-1">{o.message}</span> : null}
                    {o.node ? (
                      <p className="mt-1 text-[11px] text-amber-800 font-mono break-all">
                        Nodo: {o.node}
                        {o.value != null && o.value !== '' ? ` · Valor: "${o.value}"` : ''}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 flex gap-2">
            <HelpCircle className="shrink-0 text-stone-500" size={16} aria-hidden />
            <p className="text-[11px] text-stone-600 leading-relaxed">{SUNAT_OBSERVED_HELP}</p>
          </div>
        </>
      )}

      {view.cdrNotes.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Notas adicionales del CDR</p>
          <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
            {view.cdrNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {view.rawMessage && (
        <details className="group">
          <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
            Mensaje completo SUNAT / PSE
          </summary>
          <pre className="mt-2 text-[11px] text-gray-600 bg-gray-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono border border-gray-100">
            {view.rawMessage}
          </pre>
        </details>
      )}
    </div>
  )
}
