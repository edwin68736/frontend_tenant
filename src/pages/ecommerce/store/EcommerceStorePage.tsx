import { useEffect, useMemo, useState } from 'react'
import { ShoppingCart, Package, ChevronLeft, ChevronRight, Search, LayoutGrid, MessageCircle, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  publicEcommerceService,
  type PublicStoreSettings,
  type PublicCategory,
} from '@/services/ecommerce.service'
import type { ProductReportRow } from '@/services/products.service'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import { readCart, addToCart, cartCount, type StoreCartLine } from './storeCart'
import StoreCartDrawer from './StoreCartDrawer'
import ProductDetailModal from './ProductDetailModal'
import PriceRangeSlider from './PriceRangeSlider'

const PER_PAGE = 24

/** "#16a34a" → "22 163 74" (formato que usan las variables --p600 del resto de la app). */
function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return '22 163 74'
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `${r} ${g} ${b}`
}

function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

export default function EcommerceStorePage() {
  const [settings, setSettings] = useState<PublicStoreSettings | null>(null)
  const [categories, setCategories] = useState<PublicCategory[]>([])
  const [products, setProducts] = useState<ProductReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [minPrice, setMinPrice] = useState<number | null>(null)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number } | null>(null)
  const [showPriceFilter, setShowPriceFilter] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)
  const [slide, setSlide] = useState(0)
  const [cartOpen, setCartOpen] = useState(false)
  const [cart, setCart] = useState<StoreCartLine[]>([])
  const [detailProduct, setDetailProduct] = useState<ProductReportRow | null>(null)

  useEffect(() => {
    setCart(readCart())
  }, [])

  useEffect(() => {
    publicEcommerceService
      .getSettings()
      .then(setSettings)
      .catch((e) => {
        if (e?.response?.status === 404) setNotAvailable(true)
        else toast.error('Error cargando la tienda')
      })
    publicEcommerceService.listCategories().then(setCategories).catch(() => {})
    publicEcommerceService.getPriceBounds().then(setPriceBounds).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      publicEcommerceService
        .listProducts({ q: q || undefined, category_id: categoryId ?? undefined, min_price: minPrice ?? undefined, max_price: maxPrice ?? undefined, page: 1, per_page: PER_PAGE })
        .then(({ data, total: tot }) => {
          setProducts(data)
          setTotal(tot)
          setPage(1)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q, categoryId, minPrice, maxPrice])

  const activeSliders = useMemo(() => settings?.sliders?.filter((s) => s.active) ?? [], [settings])

  useEffect(() => {
    if (activeSliders.length < 2) return
    const t = setInterval(() => setSlide((s) => (s + 1) % activeSliders.length), 5500)
    return () => clearInterval(t)
  }, [activeSliders])

  const canLoadMore = products.length < total

  const loadMore = () => {
    if (loadingMore) return
    setLoadingMore(true)
    const next = page + 1
    publicEcommerceService
      .listProducts({ q: q || undefined, category_id: categoryId ?? undefined, min_price: minPrice ?? undefined, max_price: maxPrice ?? undefined, page: next, per_page: PER_PAGE })
      .then(({ data }) => {
        setProducts((prev) => [...prev, ...data])
        setPage(next)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  const handleAdd = (p: ProductReportRow, quantity = 1) => {
    setCart(addToCart({ id: p.id, name: p.name, sale_price: p.sale_price, image_url: p.image_url ?? undefined }, quantity))
    toast.success(`${p.name} agregado al carrito`)
    setDetailProduct(null)
  }

  const themeVars = useMemo(() => {
    if (!settings) return {}
    return {
      '--vs-primary': hexToRgbTriplet(settings.primary_color || '#16a34a'),
      '--vs-secondary': hexToRgbTriplet(settings.secondary_color || '#0f172a'),
      fontFamily: settings.font_family || 'Inter',
    } as React.CSSProperties
  }, [settings])

  const cardRadius = settings?.card_style === 'square' ? '6px' : settings?.card_style === 'minimal' ? '10px' : '16px'
  const cardShadow = settings?.card_style === 'minimal' ? 'none' : '0 2px 10px rgba(0,0,0,0.06)'
  const categoryStyle = settings?.category_style === 'pills' ? 'pills' : 'circles'

  const activeCategoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : null
  const waContact = settings?.whatsapp_number ? normalizePhoneForWhatsApp(settings.whatsapp_number) : ''
  const priceFilterActive = Boolean(minPrice || maxPrice)

  if (notAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-center p-6">
        <div>
          <Package size={40} className="mx-auto mb-3 text-gray-300" />
          <h1 className="text-lg font-semibold text-gray-700">Tienda no disponible</h1>
          <p className="text-sm text-gray-500">Este catálogo no está activo en este momento.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={themeVars}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {settings?.logo_url ? (
            <img src={resolvePublicAssetUrl(settings.logo_url)} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--vs-primary))' }}>
              <ShoppingCart size={18} className="text-white" />
            </div>
          )}
          <div className="min-w-0 shrink-0">
            <p className="font-bold text-gray-800 truncate max-w-[140px] sm:max-w-none">{settings?.store_name || 'Tienda'}</p>
            {settings?.tagline && <p className="text-xs text-gray-500 truncate max-w-[140px] sm:max-w-none">{settings.tagline}</p>}
          </div>

          <div className="order-3 sm:order-none basis-full sm:basis-auto sm:flex-1 sm:max-w-md">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Buscar producto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm bg-gray-50 focus:bg-white"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative p-2.5 rounded-xl text-white shrink-0 ml-auto"
            style={{ background: 'rgb(var(--vs-primary))' }}
          >
            <ShoppingCart size={18} />
            {cartCount(cart) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">
                {cartCount(cart)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero: carrusel contenido con texto + botón, o fondo estático si no hay sliders */}
      {activeSliders.length > 0 ? (
        <section className="max-w-6xl mx-auto px-4 mt-4">
          <div className="relative h-44 sm:h-64 lg:h-72 rounded-2xl overflow-hidden">
            {activeSliders.map((s, i) => (
              <div
                key={s.id}
                className={`absolute inset-0 transition-opacity duration-700 ${i === slide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <img src={resolvePublicAssetUrl(s.image_url)} alt="" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(90deg, rgb(var(--vs-secondary) / 0.85) 0%, rgb(var(--vs-secondary) / 0.3) 55%, transparent 100%)' }}
                />
                {(s.title || s.subtitle || s.button_text) && (
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full px-5 sm:px-8">
                      <div className="max-w-xs sm:max-w-sm text-white">
                        {s.title && <h2 className="text-lg sm:text-2xl lg:text-3xl font-extrabold leading-tight mb-1.5">{s.title}</h2>}
                        {s.subtitle && <p className="text-xs sm:text-sm text-white/90 mb-3 line-clamp-2">{s.subtitle}</p>}
                        {s.button_text && (
                          <a
                            href={s.link_url || '#productos'}
                            className="inline-block px-4 py-2 rounded-full font-semibold text-xs sm:text-sm shadow-lg"
                            style={{ background: 'rgb(var(--vs-primary))', color: '#fff' }}
                          >
                            {s.button_text}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {activeSliders.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s - 1 + activeSliders.length) % activeSliders.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white rounded-full p-1.5 shadow"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s + 1) % activeSliders.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white rounded-full p-1.5 shadow"
                >
                  <ChevronRight size={16} />
                </button>
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {activeSliders.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSlide(i)}
                      className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      ) : settings?.background_image_url ? (
        <section className="max-w-6xl mx-auto px-4 mt-4">
          <div className="relative h-40 sm:h-56 rounded-2xl overflow-hidden">
            <img src={resolvePublicAssetUrl(settings.background_image_url)} alt="" className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, rgb(var(--vs-secondary) / 0.85) 0%, rgb(var(--vs-secondary) / 0.3) 60%, transparent 100%)' }}
            />
            <div className="absolute inset-0 flex items-center">
              <div className="w-full px-5 sm:px-8">
                <div className="max-w-xs sm:max-w-sm text-white">
                  <h2 className="text-lg sm:text-2xl font-extrabold mb-1.5">{settings.store_name}</h2>
                  {settings.tagline && <p className="text-xs sm:text-sm text-white/90 mb-3">{settings.tagline}</p>}
                  <a
                    href="#productos"
                    className="inline-block px-4 py-2 rounded-full font-semibold text-xs sm:text-sm shadow-lg text-white"
                    style={{ background: 'rgb(var(--vs-primary))' }}
                  >
                    Ver productos
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Categorías: circulares o botones de texto, según diseño elegido por el tenant */}
      {categories.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 mt-5">
          {categoryStyle === 'circles' ? (
            <div className="flex gap-4 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategoryId(null)} className="flex flex-col items-center gap-1.5 shrink-0">
                <span
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white"
                  style={{ background: 'rgb(var(--vs-primary))', boxShadow: categoryId === null ? '0 0 0 3px rgb(var(--vs-primary) / 0.25)' : undefined }}
                >
                  <LayoutGrid size={20} />
                </span>
                <span className="text-[11px] text-gray-600 font-medium">Todas</span>
              </button>
              {categories.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} className="flex flex-col items-center gap-1.5 shrink-0">
                  <span
                    className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-base border"
                    style={
                      categoryId === c.id
                        ? { background: 'rgb(var(--vs-primary))', color: '#fff', borderColor: 'transparent', boxShadow: '0 0 0 3px rgb(var(--vs-primary) / 0.25)' }
                        : { background: '#fff', color: 'rgb(var(--vs-secondary))', borderColor: '#e5e7eb' }
                    }
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[11px] text-gray-600 font-medium max-w-[64px] truncate">{c.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border ${categoryId === null ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                style={categoryId === null ? { background: 'rgb(var(--vs-primary))' } : undefined}
              >
                Todas
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border ${categoryId === c.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                  style={categoryId === c.id ? { background: 'rgb(var(--vs-primary))' } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid de productos */}
      <main id="productos" className="max-w-6xl mx-auto px-4 py-6 scroll-mt-20">
        <div className="flex items-end justify-between mb-4 gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{activeCategoryName || 'Todos los productos'}</h3>
            <div className="w-10 h-1 rounded-full mt-1.5" style={{ background: 'rgb(var(--vs-primary))' }} />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {total > 0 && <span className="text-xs text-gray-400 hidden sm:inline">{total} producto{total === 1 ? '' : 's'}</span>}
            {showPriceFilter && priceBounds && priceBounds.max > priceBounds.min && (
              <PriceRangeSlider
                bounds={priceBounds}
                value={{ min: minPrice, max: maxPrice }}
                onChange={({ min, max }) => { setMinPrice(min); setMaxPrice(max) }}
              />
            )}
            <button
              type="button"
              onClick={() => setShowPriceFilter((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 ${priceFilterActive ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
              style={priceFilterActive ? { background: 'rgb(var(--vs-primary))' } : undefined}
            >
              <SlidersHorizontal size={13} /> Precio
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={32} className="mx-auto mb-3 text-gray-300" />
            No hay productos disponibles.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p) => {
                const outOfStock = Boolean(p.manage_stock) && Number(p.stock_total ?? 0) <= 0
                return (
                  <div
                    key={p.id}
                    onClick={() => setDetailProduct(p)}
                    className="bg-white overflow-hidden flex flex-col cursor-pointer transition-transform hover:-translate-y-0.5"
                    style={{ borderRadius: cardRadius, boxShadow: cardShadow }}
                  >
                    <div className="aspect-square bg-gray-100 relative">
                      {p.image_url ? (
                        <img src={resolvePublicAssetUrl(p.image_url)} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package size={28} />
                        </div>
                      )}
                      {outOfStock && (
                        <span className="absolute top-2 left-2 bg-gray-900/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                          Agotado
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      {p.category_name && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: 'rgb(var(--vs-primary))' }}>
                          {p.category_name}
                        </span>
                      )}
                      <p className="text-sm font-medium text-gray-800 line-clamp-2 flex-1">{p.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-sm" style={{ color: 'rgb(var(--vs-primary))' }}>{formatSoles(p.sale_price)}</span>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={(e) => { e.stopPropagation(); handleAdd(p) }}
                          className="text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-40"
                          style={{ background: 'rgb(var(--vs-primary))' }}
                        >
                          Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {canLoadMore && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-5 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Cargando...' : 'Ver más productos'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer de marca */}
      <footer className="mt-4 text-white" style={{ background: 'rgb(var(--vs-secondary))' }}>
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              {settings?.logo_url && (
                <img src={resolvePublicAssetUrl(settings.logo_url)} alt="" className="w-9 h-9 rounded-lg object-cover" />
              )}
              <p className="font-bold text-lg">{settings?.store_name || 'Tienda'}</p>
            </div>
            {settings?.description && <p className="text-sm text-white/70">{settings.description}</p>}
          </div>
          {categories.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Categorías</p>
              <ul className="space-y-1 text-sm text-white/80">
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCategoryId(c.id)} className="hover:text-white">
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Contáctanos</p>
            {waContact ? (
              <a
                href={`https://wa.me/${waContact}?text=${encodeURIComponent(`Hola ${settings?.store_name || ''}, quisiera hacer una consulta.`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-white"
              >
                <MessageCircle size={16} /> WhatsApp
              </a>
            ) : (
              <p className="text-sm text-white/50">Sin contacto configurado</p>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[11px] text-white/40">
          © {new Date().getFullYear()} {settings?.store_name || 'Tienda'} · Catálogo Digital
        </div>
      </footer>

      {detailProduct && (
        <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} onAdd={handleAdd} />
      )}

      <StoreCartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        whatsappNumber={settings?.whatsapp_number || ''}
        storeName={settings?.store_name || 'la tienda'}
        onCartChange={setCart}
      />
    </div>
  )
}
