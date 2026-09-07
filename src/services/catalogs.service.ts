import api from './api'

export interface DetraccionGood {
  code: string
  description: string
  rate_percent: number
  min_amount_pen: number
  transport_cargo: boolean
  active: boolean
}

export interface DetraccionPaymentMethod {
  code: string
  description: string
  active: boolean
}

export const catalogsService = {
  detraccionGoods: () =>
    api
      .get<{ items: DetraccionGood[] }>('/api/catalogs/detraccion/goods', {
        params: { exclude_transport: true },
      })
      .then((r) => r.data.items),

  /** Solo el código 027 (transporte de carga) — para el combo de la operación 1004, que nunca
   * debe mezclarse con el resto del catálogo. */
  detraccionTransportGoods: () =>
    api
      .get<{ items: DetraccionGood[] }>('/api/catalogs/detraccion/goods', {
        params: { only_transport: true },
      })
      .then((r) => r.data.items),

  detraccionPaymentMethods: () =>
    api
      .get<{ items: DetraccionPaymentMethod[] }>('/api/catalogs/detraccion/payment-methods')
      .then((r) => r.data.items),
}
