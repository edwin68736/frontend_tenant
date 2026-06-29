import { ArrowDown, CheckCircle2, FileText, RotateCcw, ShoppingCart } from 'lucide-react'
import {
  billingStatusColor,
  billingStatusLabel,
  normalizeBillingStatus,
} from '@/constants/billingStatus'
import type { LinkedReversionSummary } from '@/services/billing.service'

export type FiscalTimelineOrigin = {
  label: string
  sublabel?: string
  onNavigate?: () => void
}

type Props = {
  origin?: FiscalTimelineOrigin
  fiscalLabel: string
  fiscalSeries: string
  fiscalCorrelative: string
  fiscalBillingStatus: string
  reversion?: LinkedReversionSummary | null
  compact?: boolean
}

function StepCard({
  icon,
  title,
  subtitle,
  statusLabel,
  statusClass,
  action,
  compact,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  statusLabel?: string
  statusClass?: string
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-2' : 'p-2.5'}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-gray-400 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className={`font-medium text-gray-800 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          {statusLabel && (
            <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusClass ?? 'bg-gray-100 text-gray-700'}`}>
              {statusLabel}
            </span>
          )}
        </div>
        {action}
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex justify-center py-0.5 text-gray-300">
      <ArrowDown size={14} />
    </div>
  )
}

export function FiscalDocumentTimeline({
  origin,
  fiscalLabel,
  fiscalSeries,
  fiscalCorrelative,
  fiscalBillingStatus,
  reversion,
  compact,
}: Props) {
  const bs = normalizeBillingStatus(fiscalBillingStatus)
  const rrStatus = reversion?.status ?? ''
  const finalStatus = reversion
    ? (rrStatus === 'accepted' ? 'Revertido (SUNAT)' : `RR ${rrStatus || 'pendiente'}`)
    : billingStatusLabel(bs)

  return (
    <div className={compact ? 'space-y-0' : 'space-y-0.5'}>
      {origin && (
        <>
          <StepCard
            compact={compact}
            icon={<ShoppingCart size={14} />}
            title="Documento origen"
            subtitle={origin.sublabel ?? origin.label}
            action={origin.onNavigate ? (
              <button type="button" onClick={origin.onNavigate} className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 shrink-0">
                Ver
              </button>
            ) : undefined}
          />
          <Arrow />
        </>
      )}
      <StepCard
        compact={compact}
        icon={<FileText size={14} />}
        title={fiscalLabel}
        subtitle={`${fiscalSeries}-${fiscalCorrelative}`}
        statusLabel={billingStatusLabel(bs)}
        statusClass={billingStatusColor(bs)}
      />
      <Arrow />
      {reversion ? (
        <>
          <StepCard
            compact={compact}
            icon={<RotateCcw size={14} />}
            title="Reversión (RR)"
            subtitle={`RR ${reversion.correlativo}${reversion.motivo ? ` · ${reversion.motivo}` : ''}`}
            statusLabel={reversion.status === 'accepted' ? 'Aceptada' : (reversion.status || 'Pendiente')}
            statusClass={reversion.status === 'accepted' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'}
          />
          <Arrow />
        </>
      ) : null}
      <StepCard
        compact={compact}
        icon={<CheckCircle2 size={14} />}
        title="Estado final"
        statusLabel={finalStatus}
        statusClass={reversion?.status === 'accepted' ? 'bg-orange-100 text-orange-800' : billingStatusColor(bs)}
      />
    </div>
  )
}
