import { roundSunat } from '@/utils/money'

export const SUNAT_DETRACCION_THRESHOLD_PEN = 700
export const DETRACCION_PAYMENT_METHOD_CODE = 'detraccion_bn'
export const DETRACCION_PAYMENT_METHOD_NAME = 'Detracción BN (SPOT)'

export interface DetraccionPreviewInput {
  sunatCode: string
  operationTypeCode: string
  currency: string
  gravadoTotal: number
  saleTotal: number
  goodCode: string
  goodRatePercent: number
  minAmountPen: number
  bankAccount: string
  contactEsPercepcion?: boolean
}

export interface DetraccionPreviewResult {
  applicable: boolean
  reason: string
  ratePercent: number
  detractionAmount: number
  netPayable: number
}

export function previewDetraccion(input: DetraccionPreviewInput): DetraccionPreviewResult {
  const fail = (reason: string): DetraccionPreviewResult => ({
    applicable: false,
    reason,
    ratePercent: input.goodRatePercent,
    detractionAmount: 0,
    netPayable: input.saleTotal,
  })

  if (input.operationTypeCode !== '1001') {
    return fail('')
  }
  if (input.sunatCode !== '01') {
    return fail('La detracción solo aplica a facturas (01)')
  }
  if (input.currency !== 'PEN') {
    return fail('La detracción requiere moneda PEN')
  }
  if (input.contactEsPercepcion) {
    return fail('No se permite detracción con cliente agente de percepción')
  }
  if (!input.bankAccount?.trim()) {
    return fail('Configure la cuenta BN en Configuración → SUNAT')
  }
  if (!input.goodCode?.trim()) {
    return fail('Seleccione el bien o servicio sujeto a detracción')
  }
  const base = roundSunat(input.gravadoTotal)
  if (base <= 0) {
    return fail('Se requieren ítems gravados con IGV')
  }
  const threshold = input.minAmountPen > 0 ? input.minAmountPen : SUNAT_DETRACCION_THRESHOLD_PEN
  if (base <= threshold) {
    return fail(`El importe gravado no supera S/ ${threshold.toFixed(2)}`)
  }
  const rate = input.goodRatePercent
  const amount = roundSunat(base * rate / 100)
  const net = roundSunat(Math.max(0, input.saleTotal - amount))
  return {
    applicable: true,
    reason: `Detracción del ${rate.toFixed(2)}% sobre operaciones gravadas`,
    ratePercent: rate,
    detractionAmount: amount,
    netPayable: net,
  }
}
