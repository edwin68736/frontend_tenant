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

/**
 * Snapshot de la SaleUnit elegida para una línea del carrito (Fase 7E). Solo lo mínimo que el POS
 * necesita mostrar/usar: nombre para el carrito, factor para el texto de ayuda, y allow_fraction
 * para decidir si la cantidad comercial de esta línea puede ser decimal — NUNCA se usa para
 * convertir la cantidad a unidad base (eso es responsabilidad exclusiva del backend) ni para
 * recalcular el precio (unit_price ya viene resuelto — Price1 global o BranchPrice — antes de
 * construir la línea).
 */
export type CartSaleUnit = {
  id: number
  name: string
  conversion_factor: number
  allow_fraction: boolean
}

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
  /**
   * Unidad de venta elegida (ej. "Caja x12"), cuando el producto vende en una unidad distinta de
   * la base — Fase 7E. undefined = línea legacy sin conversión (comportamiento previo, intacto).
   * Mutuamente excluyente con `modifiers` de tipo 'variant' (Presentation) — ProductConfigureModal
   * nunca construye una línea con ambos a la vez (ver backend: PresentationID + SaleUnitID se
   * rechazan juntos).
   */
  sale_unit?: CartSaleUnit
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

/**
 * true si la línea no tiene un precio de venta real. No hay excepción por bonificación: en
 * afectación '15' lo que se cobra al cliente se fuerza a 0 en el checkout, pero el precio
 * unitario/de referencia siempre debe ser mayor a 0 — este chequeo aplica a todas las líneas.
 */
export function cartLineHasMissingPrice(line: PosCartLine): boolean {
  return !(cartLineUnitPrice(line) > 0)
}

export function applyCatalogLineUnitPrice(line: CatalogCartLine, unitPrice: number): CatalogCartLine {
  const price = roundMoney(Math.max(0, unitPrice))
  return {
    ...line,
    unit_price: price,
    configureKey: buildCatalogConfigureKey(
      line.modifiers,
      line.notes ?? '',
      price,
      line.serials,
      line.sale_unit?.id,
    ),
  }
}

/** Máximo de decimales que persiste la BD en cantidades (decimal(15,3)) — igual criterio que
 *  QUANTITY_MAX_DECIMALS en constants/sunatUnits.ts, duplicado aquí a propósito: la cantidad
 *  comercial de una SaleUnit se rige por su propio `allow_fraction`, no por el código de unidad
 *  SUNAT del producto, así que no reutiliza normalizeQuantityForUnit (que decide por unidad). */
const SALE_UNIT_QUANTITY_MAX_DECIMALS = 3

/**
 * Ajusta la cantidad comercial de una línea con SaleUnit a lo que esa unidad permite —
 * allow_fraction=false → entero ≥ 1; allow_fraction=true → hasta 3 decimales, mínimo 0.001.
 * Nunca convierte a cantidad base (eso lo hace el backend con conversion_factor).
 */
export function normalizeSaleUnitQuantity(qty: number, allowFraction: boolean): number {
  if (!Number.isFinite(qty)) return 1
  if (!allowFraction) return Math.max(1, Math.round(qty))
  const factor = 10 ** SALE_UNIT_QUANTITY_MAX_DECIMALS
  return Math.max(1 / factor, Math.round(qty * factor) / factor)
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
    /**
     * Unidad de venta elegida (Fase 7E). Cuando se indica, `base_price` debe venir ya resuelto
     * (Price1 global o BranchPrice, decidido por el caller — ProductConfigureModal) y `modifiers`
     * debe venir vacío (mutuamente excluyente con Presentation/extras) — esta función NO
     * multiplica el precio por conversion_factor ni recalcula nada, solo lo conserva en la línea.
     */
    sale_unit?: CartSaleUnit
  },
): CatalogCartLine {
  const base = partial?.base_price ?? (Number(product.sale_price) || 0)
  const modifiers = partial?.modifiers ?? []
  const notes = partial?.notes ?? ''
  const serials = partial?.serials
  const combo = partial?.combo
  const saleUnit = partial?.sale_unit
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
    sale_unit: saleUnit,
    // La elección del combo entra en la clave: dos combos con distinta selección no se funden.
    // La SaleUnit también entra en la clave (buildCatalogConfigureKey) para que dos unidades
    // distintas del mismo producto nunca se fusionen en una sola línea.
    configureKey: comboConfigureKey(
      buildCatalogConfigureKey(modifiers, notes, unit_price, serials, saleUnit?.id),
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
