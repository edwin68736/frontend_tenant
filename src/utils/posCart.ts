import type { Product } from '@/services/products.service'
import { calcItem, type TaxConfig } from '@/utils/taxCalc'
import { roundSunat } from '@/utils/money'

export type CatalogCartLine = {
  kind: 'catalog'
  lineId: string
  product: Product
  quantity: number
  unitPrice?: number
  serials?: string[]
  modifiersJson?: string
}

export type ManualCartLine = {
  kind: 'manual'
  lineId: string
  description: string
  code: string
  unit: string
  unit_price: number
  quantity: number
  igv_affectation_type: string
  price_includes_igv: boolean
}

export type PosCartLine = CatalogCartLine | ManualCartLine

function newLineId(prefix = 'cart'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function isManualCartLine(line: PosCartLine): line is ManualCartLine {
  return line.kind === 'manual'
}

export function isCatalogCartLine(line: PosCartLine): line is CatalogCartLine {
  return line.kind === 'catalog'
}

export function cartLineKey(line: PosCartLine): string {
  return line.lineId
}

export function cartLineLabel(line: PosCartLine): string {
  return line.kind === 'catalog' ? line.product.name : line.description.trim() || 'Producto manual'
}

export function cartLineUnitPrice(line: PosCartLine): number {
  if (line.kind === 'manual') return Number(line.unit_price) || 0
  return Number(line.unitPrice ?? line.product.sale_price) || 0
}

export function applyCatalogLineUnitPrice(line: CatalogCartLine, unitPrice: number): CatalogCartLine {
  return { ...line, unitPrice: roundSunat(Math.max(0, unitPrice)) }
}

export function cartLineTotal(
  line: PosCartLine,
  taxRate: number,
  taxConfig: Partial<TaxConfig> | undefined,
): number {
  if (line.kind === 'manual') {
    return calcItem(
      line.unit_price,
      line.quantity,
      0,
      line.igv_affectation_type,
      line.price_includes_igv,
      taxRate,
      taxConfig,
    ).total
  }
  const p = line.product
  return calcItem(
    cartLineUnitPrice(line),
    line.quantity,
    0,
    p.igv_affectation_type ?? '10',
    p.price_includes_igv ?? true,
    taxRate,
    taxConfig,
  ).total
}

export function createCatalogCartLine(
  product: Product,
  partial?: Partial<Omit<CatalogCartLine, 'kind' | 'product'>> & { product?: Product },
): CatalogCartLine {
  return {
    kind: 'catalog',
    lineId: partial?.lineId ?? newLineId(),
    product: partial?.product ?? product,
    quantity: partial?.quantity ?? 1,
    unitPrice: partial?.unitPrice,
    serials: partial?.serials,
    modifiersJson: partial?.modifiersJson,
  }
}
