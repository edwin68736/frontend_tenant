import type { PrepaymentModuleConfig } from '@/services/prepayment.service'
import type { PrepaymentAffectationGroup } from '@/utils/fiscalPrepayment'

type PrepaymentEmitSummaryProps = {
  emit: boolean
  config: PrepaymentModuleConfig
  affectationGroup: PrepaymentAffectationGroup
  total: number
  formatMoney: (n: number) => string
}

export function PrepaymentEmitSummary({
  emit,
  config,
  affectationGroup,
  total,
  formatMoney,
}: PrepaymentEmitSummaryProps) {
  if (!emit) return null

  const affLabel =
    (config.affectation_groups ?? []).find((g) => g.value === affectationGroup)?.label ?? affectationGroup

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-950 space-y-1">
      <p className="font-semibold uppercase tracking-wide text-sky-800">Anticipo</p>
      <div className="flex justify-between gap-2">
        <span>{config.pdf_label}</span>
        <span className="tabular-nums font-medium">{formatMoney(total)}</span>
      </div>
      <div className="flex justify-between gap-2 text-sky-800/90">
        <span>Afectación: {affLabel}</span>
        <span>{config.emit_operation_type}</span>
      </div>
    </div>
  )
}
