import { useEffect, useState } from 'react'
import { X, Minus, Plus, Trash2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { type StoreCartLine, setCartQuantity, cartTotal, clearCart } from './storeCart'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import { publicEcommerceService } from '@/services/ecommerce.service'
import { getApiBaseUrl, resolvePublicAssetUrl } from '@/config/apiBaseUrl'

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

  const handleQty = (key: string, qty: number) => {
    onCartChange(setCartQuantity(key, qty))
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
      const { orderNumber, pdfToken } = await publicEcommerceService.createOrder({
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        items: cart.map((l) => ({
          product_id: l.product_id,
          name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          presentation_id: l.presentation_id,
          sale_unit_id: l.sale_unit_id,
          modifier_option_ids: l.modifier_option_ids,
        })),
      })
      const lines = cart.map((l) => `• ${l.name}${l.detail ? ` (${l.detail})` : ''} x${l.quantity} — ${formatSoles(l.quantity * l.unit_price)}`).join('\n')
      const message =
        `Hola ${storeName}, quiero hacer este pedido (N° ${orderNumber}):\n\n${lines}\n\nTotal: ${formatSoles(total)}` +
        (customerName ? `\n\nMi nombre: ${customerName}` : '') +
        (pdfToken ? `\n\nPDF del pedido: ${getApiBaseUrl()}/api/public/ecommerce/orders/${orderNumber}/pdf?t=${pdfToken}` : '')
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank')
      clearCart()
      onCartChange([])
      onClose()
      toast.success('Pedido enviado. Continúa la conversación en WhatsApp.')
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo registrar el pedido. Intenta nuevamente.')
    } finally {
      setSending(false)
    }
  }

  // Escape cierra; el fondo no se desplaza mientras el carrito está abierto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const units = cart.reduce((sum, l) => sum + l.quantity, 0)

  return (
    <div className="vs-dr" role="dialog" aria-modal="true" aria-label="Tu carrito">
      <div className="bg" onClick={onClose} />
      <div className="vs-dr-p">
        <div className="vs-dr-h">
          <div>
            <h2>Tu carrito</h2>
            <small>{units} producto{units === 1 ? '' : 's'}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar carrito" style={{ width: 42, height: 42, borderRadius: '50%', border: 0, background: 'var(--vs-ground)', display: 'grid', placeItems: 'center' }}>
            <X size={20} />
          </button>
        </div>

        <div className="vs-lines">
          {cart.length === 0 ? (
            <p className="vs-empty" style={{ margin: 0 }}>Tu carrito está vacío</p>
          ) : (
            cart.map((l) => (
              <div key={l.line_key} className="vs-ln">
                <div className="th">
                  {l.image_url ? <img src={resolvePublicAssetUrl(l.image_url)} alt="" loading="lazy" /> : l.name.charAt(0).toUpperCase()}
                </div>
                <div className="i">
                  <b>{l.name}</b>
                  {l.detail && <small>{l.detail}</small>}
                  <small>{formatSoles(l.unit_price)} c/u</small>
                  <div className="p">{formatSoles(l.unit_price * l.quantity)}</div>
                </div>
                <div className="vs-step">
                  <button type="button" aria-label="Quitar uno" onClick={() => handleQty(l.line_key, l.quantity - 1)}><Minus size={15} /></button>
                  <span aria-live="polite">{l.quantity}</span>
                  <button type="button" aria-label="Agregar uno" onClick={() => handleQty(l.line_key, l.quantity + 1)}><Plus size={15} /></button>
                </div>
                <button type="button" className="del" aria-label={`Quitar ${l.name}`} onClick={() => handleQty(l.line_key, 0)}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="vs-order">
            <label className="vs-fld">
              <small>Tu nombre *</small>
              <input
                placeholder="Ej. Rosa Quispe"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </label>
            <label className="vs-fld">
              <small>Tu celular (WhatsApp) *</small>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ej. 987 654 321"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
              />
            </label>
            <div className="vs-tot">
              <span style={{ fontWeight: 600, color: 'var(--vs-muted)' }}>Total</span>
              <b>{formatSoles(total)}</b>
            </div>
            <button
              type="button"
              className="vs-wabtn"
              onClick={() => void handleCheckout()}
              disabled={sending || !customerName.trim() || !customerPhone.trim()}
            >
              <MessageCircle size={22} aria-hidden />
              {sending ? 'Enviando...' : 'Pedir por WhatsApp'}
            </button>
            <p className="vs-note" style={{ margin: 0 }}>Registramos tu pedido y seguimos la conversación por WhatsApp.</p>
          </div>
        )}
      </div>
    </div>
  )
}
