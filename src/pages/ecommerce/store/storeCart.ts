const CART_KEY = 'tukifac_ecommerce_cart'

export interface StoreCartLine {
  product_id: number
  name: string
  unit_price: number
  quantity: number
  image_url?: string
}

export function readCart(): StoreCartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCart(lines: StoreCartLine[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(lines))
}

export function addToCart(product: { id: number; name: string; sale_price: number; image_url?: string }, quantity = 1): StoreCartLine[] {
  const cart = readCart()
  const existing = cart.find((l) => l.product_id === product.id)
  if (existing) {
    existing.quantity += quantity
  } else {
    cart.push({ product_id: product.id, name: product.name, unit_price: Number(product.sale_price) || 0, quantity, image_url: product.image_url })
  }
  writeCart(cart)
  return cart
}

export function setCartQuantity(productId: number, quantity: number): StoreCartLine[] {
  let cart = readCart()
  if (quantity <= 0) {
    cart = cart.filter((l) => l.product_id !== productId)
  } else {
    cart = cart.map((l) => (l.product_id === productId ? { ...l, quantity } : l))
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
