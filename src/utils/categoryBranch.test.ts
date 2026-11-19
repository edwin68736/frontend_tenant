import { describe, expect, it } from 'vitest'
import { categoriesForProduct, categoryLabel, categoryProductConflict } from './categoryBranch'

const branches = [
  { id: 1, name: 'Principal' },
  { id: 2, name: 'Surco' },
]
const todas = { id: 10, name: 'Postres', branch_id: null }
const s1 = { id: 11, name: 'Bebidas', branch_id: 1 }
const s2 = { id: 12, name: 'Bebidas', branch_id: 2 }
const legacy = { id: 13, name: 'Antigua' } // sin branch_id: categoría anterior a V192

describe('categoryLabel', () => {
  it('distingue dos «Bebidas» de sucursales distintas', () => {
    expect(categoryLabel(s1, branches)).toBe('Bebidas · Principal')
    expect(categoryLabel(s2, branches)).toBe('Bebidas · Surco')
  })
  it('no agrega nada a las de todas ni con una sola sucursal', () => {
    expect(categoryLabel(todas, branches)).toBe('Postres')
    expect(categoryLabel(legacy, branches)).toBe('Antigua')
    expect(categoryLabel(s1, [branches[0]])).toBe('Bebidas')
  })
})

describe('categoriesForProduct', () => {
  const all = [todas, s1, s2, legacy]
  it('producto de todas las sucursales: solo categorías de todas', () => {
    expect(categoriesForProduct(all, []).map((c) => c.id)).toEqual([10, 13])
  })
  it('producto solo en una sucursal: las de todas y las de esa sucursal', () => {
    expect(categoriesForProduct(all, [2]).map((c) => c.id)).toEqual([10, 12, 13])
  })
  it('producto en varias sucursales: solo las de todas', () => {
    expect(categoriesForProduct(all, [1, 2]).map((c) => c.id)).toEqual([10, 13])
  })
  it('conserva la categoría ya elegida aunque no sea compatible, para poder avisar', () => {
    expect(categoriesForProduct(all, [], 11).map((c) => c.id)).toEqual([10, 11, 13])
  })
})

describe('categoryProductConflict', () => {
  it('compatible: sin aviso', () => {
    expect(categoryProductConflict(todas, [], branches)).toBeNull()
    expect(categoryProductConflict(s1, [1], branches)).toBeNull()
    expect(categoryProductConflict(undefined, [1, 2], branches)).toBeNull()
  })
  it('categoría de sucursal con producto de todas o de varias: aviso con el nombre de la sucursal', () => {
    expect(categoryProductConflict(s1, [], branches)).toContain('Principal')
    expect(categoryProductConflict(s1, [1, 2], branches)).toContain('Principal')
    expect(categoryProductConflict(s1, [2], branches)).toContain('Principal')
  })
})
