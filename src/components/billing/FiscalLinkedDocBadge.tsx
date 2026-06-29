import { billingStatusLabel, normalizeBillingStatus } from '@/constants/billingStatus'
import type { LinkedFiscalDocSummary } from '@/services/billing.service'

type Props = {
  doc: LinkedFiscalDocSummary
  kind: 'retention' | 'perception'
  onClick?: () => void
}

export function FiscalLinkedDocBadge({ doc, kind, onClick }: Props) {
  const bs = normalizeBillingStatus(doc.billing_status || doc.status)
  const prefix = kind === 'retention' ? 'CRE' : 'CPE'
  const label = `${prefix} ${doc.series}-${doc.correlative} · ${billingStatusLabel(bs)}`
  const rr = doc.linked_reversion
  const full = rr ? `${label} · RR ${rr.correlativo}` : label

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex text-left text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 max-w-full truncate"
        title={full}
      >
        {full}
      </button>
    )
  }

  return (
    <span
      className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 max-w-full truncate"
      title={full}
    >
      {full}
    </span>
  )
}
