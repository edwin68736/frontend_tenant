import { SUNAT_TIPO_OPERACION, SUNAT_TIPO_OPERACION_DETRACCION, SUNAT_TIPO_OPERACION_VENTA_INTERNA } from '@/constants/sunat'

function normalizeOpCode(code?: string | null): string {
  const c = String(code ?? '').trim()
  return c || SUNAT_TIPO_OPERACION_VENTA_INTERNA
}

function isPrepaymentOperationBadge(code: string): boolean {
  const label = (SUNAT_TIPO_OPERACION[code] ?? '').toLowerCase()
  return label.includes('anticipo')
}

/** Badge compacto de tipo de operación SUNAT (0101 / 1001 / anticipo). */
export function BillingOperationTypeBadge({ operationTypeCode }: { operationTypeCode?: string | null }) {
  const code = normalizeOpCode(operationTypeCode)
  const label = SUNAT_TIPO_OPERACION[code] ?? code

  if (code === SUNAT_TIPO_OPERACION_DETRACCION) {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        1001 Detracción
      </span>
    )
  }

  if (isPrepaymentOperationBadge(code)) {
    return (
      <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
        {code} Anticipo
      </span>
    )
  }

  if (code === SUNAT_TIPO_OPERACION_VENTA_INTERNA) {
    return (
      <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
        0101
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
      {code} {label !== code ? label : ''}
    </span>
  )
}
