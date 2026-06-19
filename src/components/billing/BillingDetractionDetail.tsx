import type { PrintFiscalContext } from '@/types/printData'
import { SUNAT_TIPO_OPERACION, SUNAT_TIPO_OPERACION_DETRACCION } from '@/constants/sunat'

function fmtMoney(v: number | undefined): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

interface BillingDetractionDetailProps {
  operationTypeCode?: string | null
  fiscal?: PrintFiscalContext | null
  currency?: string
}

/** Sección solo lectura con datos persistidos de detracción 1001. */
export function BillingDetractionDetail({ operationTypeCode, fiscal, currency = 'PEN' }: BillingDetractionDetailProps) {
  const opCode = String(operationTypeCode ?? '').trim()
  const showDetraction = opCode === SUNAT_TIPO_OPERACION_DETRACCION || fiscal?.has_detraccion

  if (!showDetraction) {
    return null
  }

  const opLabel = (SUNAT_TIPO_OPERACION[opCode] ?? opCode) || '—'
  const moneySuffix = currency === 'USD' ? 'USD' : 'S/'

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Detalle detracción</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-amber-800/70">Tipo operación</p>
          <p className="font-medium text-amber-950">
            {opCode || '—'} {opLabel !== opCode ? `— ${opLabel}` : ''}
          </p>
        </div>
        {fiscal?.detraccion_good_code && (
          <div>
            <p className="text-xs text-amber-800/70">Código Cat. 54</p>
            <p className="font-mono font-medium text-amber-950">{fiscal.detraccion_good_code}</p>
          </div>
        )}
        {fiscal?.detraccion_good_label && (
          <div className="col-span-2">
            <p className="text-xs text-amber-800/70">Descripción bien/servicio</p>
            <p className="text-amber-950">{fiscal.detraccion_good_label}</p>
          </div>
        )}
        {fiscal?.detraccion_rate_percent != null && (
          <div>
            <p className="text-xs text-amber-800/70">Porcentaje</p>
            <p className="font-medium text-amber-950">{fiscal.detraccion_rate_percent}%</p>
          </div>
        )}
        {fiscal?.detraccion_amount != null && (
          <div>
            <p className="text-xs text-amber-800/70">Monto detracción</p>
            <p className="font-semibold text-amber-950">
              {moneySuffix} {fmtMoney(fiscal.detraccion_amount)}
            </p>
          </div>
        )}
        {fiscal?.detraccion_net_payable != null && (
          <div>
            <p className="text-xs text-amber-800/70">Neto cobrable</p>
            <p className="font-semibold text-amber-950">
              {moneySuffix} {fmtMoney(fiscal.detraccion_net_payable)}
            </p>
          </div>
        )}
        {fiscal?.detraccion_bank_account && (
          <div className="col-span-2">
            <p className="text-xs text-amber-800/70">Cuenta BN</p>
            <p className="font-mono text-amber-950">{fiscal.detraccion_bank_account}</p>
          </div>
        )}
      </div>
    </div>
  )
}
