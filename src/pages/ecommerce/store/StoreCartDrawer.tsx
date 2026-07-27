import { useState } from 'react'
import { X, Minus, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { type StoreCartLine, setCartQuantity, cartTotal, clearCart } from './storeCart'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import { publicEcommerceService } from '@/services/ecommerce.service'

function formatSoles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

export default function StoreCartDrawer({
  open,
  onClose,
  cart,
  whatsappNumber,
  storeName,
  onCartChange,
}: {
  open: boolean
  onClose: () => void
  cart: StoreCartLine[]
  whatsappNumber: string
  storeName: string
  onCartChange: (cart: StoreCartLine[]) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [sending, setSending] = useState(false)

  const total = cartTotal(cart)

  const handleQty = (productId: number, qty: number) => {
    onCartChange(setCartQuantity(productId, qty))
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (!customerName.trim()) {
      toast.error('Ingresa tu nombre para continuar')
      return
    }
    if (!normalizePhoneForWhatsApp(customerPhone)) {
      toast.error('Ingresa un número de celular válido para continuar')
      return
    }
    const waNumber = normalizePhoneForWhatsApp(whatsappNumber)
    if (!waNumber) {
      toast.error('La tienda no tiene un WhatsApp configurado. Contacta al negocio por otro medio.')
      return
    }
    setSending(true)
    try {
      const orderNumber = await publicEcommerceService.createOrder({
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        items: cart.map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity, unit_price: l.unit_price })),
      })
      const lines = cart.map((l) => `• ${l.name} x${l.quantity} — ${formatSoles(l.quantity * l.unit_price)}`).join('\n')
      const message =
        `Hola ${storeName}, quiero hacer este pedido (N° ${orderNumber}):\n\n${lines}\n\nTotal: ${formatSoles(total)}` +
        (customerName ? `\n\nMi nombre: ${customerName}` : '')
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank')
      clearCart()
      onCartChange([])
      onClose()
      toast.success('Pedido enviado. Continúa la conversación en WhatsApp.')
    } catch {
      toast.error('No se pudo registrar el pedido. Intenta nuevamente.')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[300] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Tu carrito</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">Tu carrito está vacío</p>
          ) : (
            cart.map((l) => (
              <div key={l.product_id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{l.name}</p>
                  <p className="text-xs text-gray-500">{formatSoles(l.unit_price)} c/u</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => handleQty(l.product_id, l.quantity - 1)} className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm">{l.quantity}</span>
                  <button type="button" onClick={() => handleQty(l.product_id, l.quantity + 1)} className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    <Plus size={12} />
                  </button>
                  <button type="button" onClick={() => handleQty(l.product_id, 0)} className="p-1 rounded-lg text-red-400 hover:bg-red-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Tu nombre *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
            <input
              type="tel"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Tu celular (WhatsApp) *"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
            <div className="flex justify-between font-bold text-gray-800">
              <span>Total</span>
              <span>{formatSoles(total)}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={sending || !customerName.trim() || !customerPhone.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: 'rgb(var(--vs-primary))' }}
            >
              {sending ? 'Enviando...' : 'Pedir por WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
