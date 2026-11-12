import { describe, expect, it } from 'vitest'
import { MAX_SERVICE_CHARGE_RATE, isValidServiceChargeRate, serviceChargeAmount, serviceChargeLabel } from './serviceCharge'

describe('serviceChargeAmount', () => {
  it('calcula el % sobre la base y redondea a 2 decimales', () => {
    expect(serviceChargeAmount(100, 10)).toBe(10)
    expect(serviceChargeAmount(84.75, 10)).toBe(8.48)
    expect(serviceChargeAmount(33.33, 13)).toBe(4.33)
  })
  it('devuelve 0 con base no positiva o % fuera de (0, 13]', () => {
    expect(serviceChargeAmount(0, 10)).toBe(0)
    expect(serviceChargeAmount(-5, 10)).toBe(0)
    expect(serviceChargeAmount(100, 0)).toBe(0)
    expect(serviceChargeAmount(100, 13.01)).toBe(0)
    expect(serviceChargeAmount(100, NaN)).toBe(0)
  })
  it('acepta el tope legal', () => {
    expect(MAX_SERVICE_CHARGE_RATE).toBe(13)
    expect(serviceChargeAmount(100, 13)).toBe(13)
    expect(isValidServiceChargeRate(13)).toBe(true)
    expect(isValidServiceChargeRate(0.01)).toBe(true)
  })
})

describe('serviceChargeLabel', () => {
  it('incluye el porcentaje', () => {
    expect(serviceChargeLabel(10)).toBe('Recargo al consumo (10 %)')
    expect(serviceChargeLabel(12.5)).toBe('Recargo al consumo (12.5 %)')
    expect(serviceChargeLabel(0)).toBe('Recargo al consumo')
  })
})
