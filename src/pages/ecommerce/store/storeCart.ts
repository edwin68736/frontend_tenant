const CART_KEY = 'tukifac_ecommerce_cart'

/** Elección del cliente para un producto con opciones (el servidor recalcula nombre y precio). */
export interface StoreLineSelection {
  presentation_id?: number
  sale_unit_id?: number
  modifier_option_ids?: number[]
}

export interface StoreCartLine extends StoreLineSelection {
  /** Identifica la línea: el mismo producto con otra presentación/extras es otra línea. */
  line_key: string
  product_id: number
  name: string
  /** Texto de la elección (ej. "Talla M · + Queso") para mostrar en el carrito. */
  detail?: string
  unit_price: number
  quantity: number
  image_url?: string
}

export function lineKey(productId: number, sel?: StoreLineSelection): string {
  const opts = [...(sel?.modifier_option_ids ?? [])].sort((a, b) => a - b).join(',')
  return `${productId}|p${sel?.presentation_id ?? 0}|u${sel?.sale_unit_id ?? 0}|m${opts}`
}

export function readCart(): StoreCartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    // Carritos guardados antes de las opciones no traen line_key.
    return parsed.map((l: StoreCartLine) => ({ ...l, line_key: l.line_key ?? lineKey(l.product_id) }))
  } catch {
    return []
  }
}

function writeCart(lines: StoreCartLine[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(lines))
}

export function addToCart(
  product: { id: number; name: string; unit_price: number; image_url?: string; detail?: string },
  quantity = 1,
  selection?: StoreLineSelection,
): StoreCartLine[] {
  const cart = readCart()
  const key = lineKey(product.id, selection)
  const existing = cart.find((l) => l.line_key === key)
  if (existing) {
    existing.quantity += quantity
  } else {
    cart.push({
      line_key: key,
      product_id: product.id,
      name: product.name,
      detail: product.detail,
      unit_price: Number(product.unit_price) || 0,
      quantity,
      image_url: product.image_url,
      ...selection,
    })
  }
  writeCart(cart)
  return cart
}

export function setCartQuantity(key: string, quantity: number): StoreCartLine[] {
  let cart = readCart()
  if (quantity <= 0) {
    cart = cart.filter((l) => l.line_key !== key)
  } else {
    cart = cart.map((l) => (l.line_key === key ? { ...l, quantity } : l))
  }
  writeCart(cart)
  return cart
}

export function clearCart(): void {
  writeCart([])
}

export function cartTotal(cart: StoreCartLine[]): number {
  return cart.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
}

export function cartCount(cart: StoreCartLine[]): number {
  return cart.reduce((sum, l) => sum + l.quantity, 0)
}
