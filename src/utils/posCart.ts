import type { Product } from '@/services/products.service'
import { isBonificacionGravada } from '@/constants/igvAffectation'
import { calcItem, type TaxConfig } from '@/utils/taxCalc'
import type { CartModifierEntry } from '@/types/productModifiers'
import {
  buildCatalogConfigureKey,
  calcUnitPriceWithModifiers,
  modifiersToJson,
} from '@/utils/productModifiers'
import { roundMoney } from '@/utils/checkoutDiscount'
import { comboSignature, comboSelectionsToJson, type ComboCartState } from '@/utils/comboCart'

export type CatalogCartLine = {
  kind: 'catalog'
  lineId: string
  product: Product
  quantity: number
  notes?: string
  base_price: number
  unit_price: number
  modifiers: CartModifierEntry[]
  configureKey: string
  serials?: string[]
  /**
   * Solo si product.has_combo: lo que el cliente eligió en cada grupo. Un combo es un
   * producto de catálogo con una selección encima, así que reusa esta misma línea.
   */
  combo?: ComboCartState
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
  return Number(line.unit_price) || 0
}

export function cartLineBasePrice(line: PosCartLine): number {
  if (line.kind === 'catalog') return Number(line.base_price) || Number(line.product.sale_price) || 0
  return Number(line.unit_price) || 0
}

export function applyCatalogLineUnitPrice(line: CatalogCartLine, unitPrice: number): CatalogCartLine {
  const price = roundMoney(Math.max(0, unitPrice))
  return {
    ...line,
    unit_price: price,
    configureKey: buildCatalogConfigureKey(line.modifiers, line.notes ?? '', price, line.serials),
  }
}

export function cartLineTotal(
  line: PosCartLine,
  taxRate: number,
  taxConfig: Partial<TaxConfig> | undefined,
): number {
  return cartLineTaxTotals(line, taxRate, taxConfig).total
}

export function cartLineTaxTotals(
  line: PosCartLine,
  taxRate: number,
  taxConfig: Partial<TaxConfig> | undefined,
): { subtotal: number; taxAmount: number; total: number } {
  const unit = cartLineUnitPrice(line)
  const aff =
    line.kind === 'catalog'
      ? line.product.igv_affectation_type ?? '10'
      : line.igv_affectation_type
  const result =
    line.kind === 'catalog'
      ? calcItem(
          unit,
          line.quantity,
          0,
          aff,
          line.product.price_includes_igv ?? true,
          taxRate,
          taxConfig,
        )
      : calcItem(
          line.unit_price,
          line.quantity,
          0,
          aff,
          line.price_includes_igv,
          taxRate,
          taxConfig,
        )
  if (isBonificacionGravada(aff)) {
    return { subtotal: result.subtotal, taxAmount: result.taxAmount, total: 0 }
  }
  return result
}

export function createCatalogCartLine(
  product: Product,
  partial?: {
    lineId?: string
    quantity?: number
    notes?: string
    modifiers?: CartModifierEntry[]
    base_price?: number
    serials?: string[]
    combo?: ComboCartState
  },
): CatalogCartLine {
  const base = partial?.base_price ?? (Number(product.sale_price) || 0)
  const modifiers = partial?.modifiers ?? []
  const notes = partial?.notes ?? ''
  const serials = partial?.serials
  const combo = partial?.combo
  const unit_price = calcUnitPriceWithModifiers(base, modifiers)
  return {
    kind: 'catalog',
    lineId: partial?.lineId ?? newLineId(),
    product,
    quantity: partial?.quantity ?? 1,
    notes,
    base_price: base,
    unit_price,
    modifiers,
    // La elección del combo entra en la clave: dos combos con distinta selección no se funden.
    configureKey: comboConfigureKey(
      buildCatalogConfigureKey(modifiers, notes, unit_price, serials),
      combo,
    ),
    serials,
    combo,
  }
}

/** Añade la firma del combo a la clave de fusión del carrito. */
function comboConfigureKey(base: string, combo?: ComboCartState): string {
  if (!combo) return base
  return base + '@c' + comboSignature(combo.components)
}

/** JSON de la selección para el backend; vacío si la línea no es un combo. */
export function catalogLineComboJson(line: CatalogCartLine): string {
  if (!line.combo) return ''
  return comboSelectionsToJson(line.combo.selections)
}

export function catalogLinesMatch(a: CatalogCartLine, b: CatalogCartLine): boolean {
  return a.product.id === b.product.id && a.configureKey === b.configureKey
}

export type AppendCatalogResult = { cart: PosCartLine[]; merged: boolean }

export function appendCatalogLine(cart: PosCartLine[], line: CatalogCartLine): AppendCatalogResult {
  const i = cart.findIndex((x) => x.kind === 'catalog' && catalogLinesMatch(x, line))
  if (i >= 0) {
    return {
      cart: cart.map((x, j) =>
        j === i && x.kind === 'catalog' ? { ...x, quantity: x.quantity + line.quantity } : x,
      ),
      merged: true,
    }
  }
  return { cart: [...cart, line], merged: false }
}

export function catalogLineModifiersJson(line: CatalogCartLine): string {
  return modifiersToJson(line.modifiers)
}

export function createManualCartLine(partial?: Partial<ManualCartLine>): ManualCartLine {
  return {
    kind: 'manual',
    lineId: partial?.lineId ?? newLineId('manual'),
    description: partial?.description ?? '',
    code: partial?.code ?? 'MANUAL',
    unit: partial?.unit ?? 'NIU',
    unit_price: partial?.unit_price ?? 0,
    quantity: partial?.quantity ?? 1,
    igv_affectation_type: partial?.igv_affectation_type ?? '10',
    price_includes_igv: partial?.price_includes_igv ?? true,
  }
}
