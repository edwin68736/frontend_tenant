import type { ComboGroup, ComboSelection, Product } from '@/services/products.service'
import { roundMoney } from '@/utils/checkoutDiscount'

/**
 * Componente de un combo ya resuelto: lo que se pinta en el carrito y queda en el comprobante.
 * Espejo de comboComponentPayload en el backend (internal/catalog/combos/combos.go).
 */
export type ComboCartComponent = {
  group_id: number
  group_name: string
  selection_type: ComboGroup['selection_type']
  product_id: number
  product_name: string
  /** Cantidad por combo, sin multiplicar por los combos pedidos. */
  quantity: number
  extra_price: number
}

/** Elección del cliente + snapshot de componentes, guardado en la línea de carrito. */
export type ComboCartState = {
  selections: ComboSelection[]
  components: ComboCartComponent[]
}

/** Mapa grupo → productos elegidos, tal como lo maneja el modal de configuración. */
export type ComboPicks = Record<number, { product_id: number; quantity: number }[]>

export function productIsCombo(product: Product): boolean {
  return !!product.has_combo
}

/** Preselección al abrir el modal: los fijos van solos y los demás toman su opción por defecto. */
export function defaultComboPicks(groups: ComboGroup[]): ComboPicks {
  const picks: ComboPicks = {}
  for (const g of groups) {
    const id = g.id ?? 0
    if (!id) continue
    if (g.selection_type === 'fixed') {
      picks[id] = g.items.map((it) => ({
        product_id: it.product_id,
        quantity: it.default_quantity || 1,
      }))
      continue
    }
    if (g.selection_type === 'single') {
      const def = g.items.find((it) => it.is_default) ?? g.items[0]
      picks[id] = def ? [{ product_id: def.product_id, quantity: def.default_quantity || 1 }] : []
      continue
    }
    // multiple: solo se preseleccionan las marcadas por defecto.
    picks[id] = g.items
      .filter((it) => it.is_default)
      .map((it) => ({ product_id: it.product_id, quantity: it.default_quantity || 1 }))
  }
  return picks
}

/**
 * Valida la elección con las mismas reglas que el backend (resolveComboGroupSelection).
 * Devuelve el primer error legible, o null si es válida.
 */
export function validateComboPicks(groups: ComboGroup[], picks: ComboPicks): string | null {
  for (const g of groups) {
    const id = g.id ?? 0
    if (!id) continue
    const chosen = picks[id] ?? []

    if (g.selection_type === 'fixed') {
      if (g.items.length === 0) return `El grupo «${g.name}» no tiene componente configurado.`
      continue
    }
    if (g.selection_type === 'single') {
      if (chosen.length !== 1) return `Debe elegir una opción en «${g.name}».`
      if (!g.items.some((it) => it.product_id === chosen[0].product_id)) {
        return `La opción elegida no pertenece a «${g.name}».`
      }
      continue
    }
    // multiple
    const seen = new Set<number>()
    for (const c of chosen) {
      const item = g.items.find((it) => it.product_id === c.product_id)
      if (!item) return `Una de las opciones elegidas no pertenece a «${g.name}».`
      if (seen.has(c.product_id)) return `Opción duplicada en «${g.name}».`
      seen.add(c.product_id)
      if (g.allow_quantity && item.max_quantity > 0 && c.quantity > item.max_quantity) {
        return `«${g.name}»: la cantidad máxima de «${item.product_name ?? 'esa opción'}» es ${item.max_quantity}.`
      }
    }
    if (chosen.length < g.min_select) {
      return `Debe elegir al menos ${g.min_select} opción(es) en «${g.name}».`
    }
    if (g.max_select > 0 && chosen.length > g.max_select) {
      return `Solo puede elegir hasta ${g.max_select} opción(es) en «${g.name}».`
    }
  }
  return null
}

/** Resuelve los componentes finales. Los grupos fijos se incluyen aunque no vengan en picks. */
export function resolveComboComponents(
  groups: ComboGroup[],
  picks: ComboPicks,
): ComboCartComponent[] {
  const out: ComboCartComponent[] = []
  for (const g of groups) {
    const groupId = g.id ?? 0
    if (!groupId) continue

    const push = (productId: number, qty: number) => {
      const item = g.items.find((it) => it.product_id === productId)
      if (!item) return
      out.push({
        group_id: groupId,
        group_name: g.name,
        selection_type: g.selection_type,
        product_id: productId,
        product_name: item.product_name ?? '',
        quantity: qty > 0 ? qty : item.default_quantity || 1,
        extra_price: Number(item.extra_price) || 0,
      })
    }

    if (g.selection_type === 'fixed') {
      // Todos los componentes fijos entran: espejo de combos.ResolveGroupSelection.
      for (const item of g.items) {
        push(item.product_id, item.default_quantity || 1)
      }
      continue
    }
    for (const c of picks[groupId] ?? []) {
      push(c.product_id, g.allow_quantity ? c.quantity : 0)
    }
  }
  return out
}

/**
 * Precio del combo: precio fijo + Σ (sobreprecio × cantidad) de lo elegido.
 * Espejo de combos.Resolve en el backend; si divergen, el POS muestra un precio
 * y el servidor cobra otro.
 */
export function calcComboUnitPrice(basePrice: number, components: ComboCartComponent[]): number {
  const extras = components.reduce(
    (sum, c) => sum + (Number(c.extra_price) || 0) * (Number(c.quantity) || 0),
    0,
  )
  return roundMoney((Number(basePrice) || 0) + extras)
}

/** Suma de los componentes a precio de lista, para mostrar el ahorro frente al combo. */
export function calcComboComponentsListTotal(
  groups: ComboGroup[],
  components: ComboCartComponent[],
): number {
  let total = 0
  for (const c of components) {
    const g = groups.find((x) => (x.id ?? 0) === c.group_id)
    const item = g?.items.find((it) => it.product_id === c.product_id)
    if (!item) continue
    total += (Number(item.product_sale_price) || 0) * (Number(c.quantity) || 0)
  }
  return roundMoney(total)
}

/** Payload para el backend: solo los grupos donde el cliente elige (los fijos se resuelven solos). */
export function componentsToSelections(
  groups: ComboGroup[],
  components: ComboCartComponent[],
): ComboSelection[] {
  const byGroup = new Map<number, ComboSelection>()
  for (const c of components) {
    const g = groups.find((x) => (x.id ?? 0) === c.group_id)
    if (!g || g.selection_type === 'fixed') continue
    const entry = byGroup.get(c.group_id) ?? { group_id: c.group_id, items: [] }
    entry.items.push({ product_id: c.product_id, quantity: c.quantity })
    byGroup.set(c.group_id, entry)
  }
  return [...byGroup.values()]
}

export function comboSelectionsToJson(selections: ComboSelection[]): string {
  if (!selections.length) return ''
  return JSON.stringify(selections)
}

/**
 * Firma determinista de la elección: dos combos con la misma selección se funden en el
 * carrito; con distinta, no. Mismo criterio que comboSelectionSignature en el backend.
 */
export function comboSignature(components: ComboCartComponent[]): string {
  return components
    .map((c) => `${c.group_id}:${c.product_id}:${c.quantity}:${(Number(c.extra_price) || 0).toFixed(2)}`)
    .sort()
    .join(',')
}

/** Etiqueta del componente en el carrito y el comprobante: «2 x Papas fritas». */
export function comboComponentLabel(c: ComboCartComponent): string {
  return c.quantity > 1 ? `${c.quantity} x ${c.product_name}` : c.product_name
}
