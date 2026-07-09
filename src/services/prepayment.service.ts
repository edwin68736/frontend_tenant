import api from './api'
import type { PrepaymentOpenVoucher } from '@/utils/fiscalPrepayment'

export type PrepaymentAffectationGroup = 'gravado' | 'exonerado' | 'inafecto'

export interface PrepaymentAffectationOption {
  value: PrepaymentAffectationGroup
  label: string
}

export interface PrepaymentAllowedDocType {
  code: string
  label: string
}

export interface PrepaymentModuleConfig {
  emit_operation_type: string
  emit_operation_label: string
  emit_operation_full_label: string
  pdf_label: string
  affectation_groups: PrepaymentAffectationOption[]
  allowed_doc_types: PrepaymentAllowedDocType[]
}

export const DEFAULT_PREPAYMENT_CONFIG: PrepaymentModuleConfig = {
  emit_operation_type: '0101',
  emit_operation_label: 'Venta interna',
  emit_operation_full_label: 'Venta interna (0101)',
  pdf_label: 'COMPROBANTE DE ANTICIPO',
  affectation_groups: [
    { value: 'gravado', label: 'Gravado' },
    { value: 'exonerado', label: 'Exonerado' },
    { value: 'inafecto', label: 'Inafecto' },
  ],
  allowed_doc_types: [
    { code: '01', label: 'Factura' },
    { code: '03', label: 'Boleta' },
  ],
}

/** Completa campos faltantes cuando el backend aún no expone la config completa. */
export function normalizePrepaymentConfig(
  raw?: Partial<PrepaymentModuleConfig> | null,
): PrepaymentModuleConfig {
  const base = DEFAULT_PREPAYMENT_CONFIG
  const opType = String(raw?.emit_operation_type ?? base.emit_operation_type).trim() || base.emit_operation_type
  const opLabel = String(raw?.emit_operation_label ?? base.emit_operation_label).trim() || base.emit_operation_label
  const fullLabel =
    String(raw?.emit_operation_full_label ?? '').trim() ||
    (opType && opLabel ? `${opLabel} (${opType})` : base.emit_operation_full_label)
  return {
    emit_operation_type: opType,
    emit_operation_label: opLabel,
    emit_operation_full_label: fullLabel,
    pdf_label: String(raw?.pdf_label ?? base.pdf_label).trim() || base.pdf_label,
    affectation_groups:
      Array.isArray(raw?.affectation_groups) && raw.affectation_groups.length > 0
        ? raw.affectation_groups
        : base.affectation_groups,
    allowed_doc_types:
      Array.isArray(raw?.allowed_doc_types) && raw.allowed_doc_types.length > 0
        ? raw.allowed_doc_types
        : base.allowed_doc_types,
  }
}

export const prepaymentService = {
  async getConfig(): Promise<PrepaymentModuleConfig> {
    const { data } = await api.get<Partial<PrepaymentModuleConfig>>('/api/prepayment/config')
    return normalizePrepaymentConfig(data)
  },

  async listOpenVouchers(params: {
    contact_id?: number | null
    affectation_group: PrepaymentAffectationGroup
    tax_rate?: number
  }) {
    const query: Record<string, string | number> = {
      affectation_group: params.affectation_group,
    }
    if (params.contact_id) query.contact_id = params.contact_id
    if (params.tax_rate != null) query.tax_rate = params.tax_rate
    const { data } = await api.get<PrepaymentOpenVoucher[]>('/api/prepayment/vouchers', { params: query })
    if (!Array.isArray(data)) {
      throw new Error('Respuesta inválida al listar anticipos')
    }
    return data
  },
}
