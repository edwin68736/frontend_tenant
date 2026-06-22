import api from './api'
import type { PaymentMethodRecord } from './cashbank.service'

export interface PaymentConditionRecord {
  id: number
  code: string
  name: string
  active: boolean
}

export interface TaxPaymentTypeRecord {
  id: number
  code: string
  name: string
  active: boolean
}

export const paymentCatalogService = {
  listPaymentMethods: (all?: boolean): Promise<PaymentMethodRecord[]> =>
    api
      .get('/api/payment-methods', { params: all ? { all: '1' } : {} })
      .then((r) => (r.data?.data ?? r.data ?? []) as PaymentMethodRecord[]),

  listPaymentConditions: (all?: boolean): Promise<PaymentConditionRecord[]> =>
    api
      .get('/api/payment-conditions', { params: all ? { all: '1' } : {} })
      .then((r) => (r.data?.data ?? r.data ?? []) as PaymentConditionRecord[]),

  listTaxPaymentTypes: (all?: boolean): Promise<TaxPaymentTypeRecord[]> =>
    api
      .get('/api/tax-payment-types', { params: all ? { all: '1' } : {} })
      .then((r) => (r.data?.data ?? r.data ?? []) as TaxPaymentTypeRecord[]),
}
