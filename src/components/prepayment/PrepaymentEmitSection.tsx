import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { PrepaymentModuleConfig } from '@/services/prepayment.service'
import {
  inferPrepaymentAffectationGroup,
  validatePrepaymentItems,
  type PrepaymentAffectationGroup,
} from '@/utils/fiscalPrepayment'

type SaleItemLike = { igv_affectation_type?: string }

export type PrepaymentEmitSectionProps = {
  enabled: boolean
  emit: boolean
  onEmitChange: (value: boolean) => void
  affectationGroup: PrepaymentAffectationGroup
  onAffectationGroupChange: (value: PrepaymentAffectationGroup) => void
  config: PrepaymentModuleConfig
  configLoading?: boolean
  configError?: string
  items: SaleItemLike[]
  sunatCode: string
  total: number
  currency: string
  disabled?: boolean
  formatMoney: (n: number) => string
}

/** Controles de emisión de anticipo (panel Información adicional, como PHP has_prepayment). */
export function PrepaymentEmitSection({
  enabled,
  emit,
  onEmitChange,
  affectationGroup,
  onAffectationGroupChange,
  config,
  configLoading,
  configError,
  items,
  sunatCode,
  total,
  currency,
  disabled,
  formatMoney,
}: PrepaymentEmitSectionProps) {
  const inferredGroup = useMemo(() => inferPrepaymentAffectationGroup(items), [items])
  const validationError = emit ? validatePrepaymentItems(affectationGroup, items) : null
  const allowedDocTypes = config.allowed_doc_types ?? []
  const affectationGroups = config.affectation_groups ?? []
  const docAllowed = allowedDocTypes.some((d) => d.code === sunatCode)

  if (!enabled || !docAllowed) return null

  const affectationLabel =
    affectationGroups.find((g) => g.value === affectationGroup)?.label ?? affectationGroup

  return (
    <div className="pt-2 border-t border-gray-100 space-y-3">
      <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
        <span className="text-sm text-gray-700">¿Es un pago anticipado?</span>
        <input
          type="checkbox"
          className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))] h-4 w-4"
          checked={emit}
          disabled={disabled || configLoading}
          onChange={(e) => onEmitChange(e.target.checked)}
        />
      </label>

      {configLoading && (
        <p className="text-xs text-gray-500 inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando…
        </p>
      )}

      {configError && <p className="text-xs text-amber-700">{configError}</p>}

      {emit && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Afectación IGV del anticipo</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={affectationGroup}
              disabled={disabled}
              onChange={(e) => onAffectationGroupChange(e.target.value as PrepaymentAffectationGroup)}
            >
              {affectationGroups.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {inferredGroup && inferredGroup !== affectationGroup && (
              <p className="text-[11px] text-amber-700 mt-1">
                Los ítems sugieren {inferredGroup}. Ajuste el selector o los productos.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2 text-xs text-gray-700 space-y-1">
            <p className="font-medium text-sky-900">{config.pdf_label}</p>
            <p>
              Monto: <strong className="tabular-nums">{formatMoney(total)}</strong> {currency}
            </p>
            <p>
              Afectación: <strong>{affectationLabel}</strong>
            </p>
          </div>

          {validationError && <p className="text-xs text-red-700">{validationError}</p>}

          <p className="text-[11px] text-gray-500 leading-relaxed">
            Igual que el sistema anterior: el comprobante queda marcado como anticipo y el PDF mostrará{' '}
            <em>*** Pago Anticipado ***</em>.
          </p>
        </>
      )}
    </div>
  )
}
