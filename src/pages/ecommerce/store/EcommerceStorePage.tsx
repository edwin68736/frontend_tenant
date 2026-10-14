import { useEffect, useMemo, useState } from 'react'
import {
  ShoppingBag,
  Package,
  ChevronLeft,
  ChevronRight,
  Search,
  MessageCircle,
  SlidersHorizontal,
  ArrowRight,
  Check,
  Plus,
  Minus,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  publicEcommerceService,
  type PublicStoreSettings,
  type PublicCategory,
} from '@/services/ecommerce.service'
import type { ProductReportRow } from '@/services/products.service'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import { readCart, addToCart, setCartQuantity, lineKey, cartCount, cartTotal, type StoreCartLine } from './storeCart'
import StoreCartDrawer from './StoreCartDrawer'
import ProductDetailModal, { productNeedsOptions, type ChosenLine } from './ProductDetailModal'
import PriceRangeSlider from './PriceRangeSlider'
import { buildStoreTheme, loadStoreFonts } from './storeTheme'
import './store.css'

const PER_PAGE = 24

function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

/** Entero tal cual; con decimales (ej. productos por peso) recorta ceros de más. */
function formatStockQty(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString()
}

/** Pocas unidades: avisa desde 5 hacia abajo. */
const LOW_STOCK = 5

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

  const theme = useMemo(() => buildStoreTheme(settings), [settings])

  // Las tipografías de la plantilla se descargan de verdad (antes solo estaba Inter y el resto caía a la del sistema).
  useEffect(() => {
    loadStoreFonts(theme.fontQuery)
  }, [theme.fontQuery])

  // Pestaña del navegador con la marca del tenant en vez de "Tukifac" — solo mientras se navega
  // esta tienda pública; se restaura al salir. El preview de bots (WhatsApp/Facebook) usa un
  // endpoint server-side aparte porque esos crawlers no ejecutan JS (ver ecommerce_handler.go).
  useEffect(() => {
    if (!settings) return
    const prevTitle = document.title
    document.title = settings.store_name?.trim() || 'Tienda online'

    const iconHref = resolvePublicAssetUrl(settings.logo_url)
    const iconLink = iconHref ? document.querySelector<HTMLLinkElement>('link[rel="icon"]') : null
    const prevIconHref = iconLink?.getAttribute('href') ?? null
    if (iconLink && iconHref) iconLink.setAttribute('href', iconHref)

    return () => {
      document.title = prevTitle
      if (iconLink && prevIconHref != null) iconLink.setAttribute('href', prevIconHref)
    }
  }, [settings])

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

  const handleAdd = (p: ProductReportRow, quantity = 1, chosen?: ChosenLine) => {
    // Con opciones (presentación, unidad de venta, extras) se elige primero en el detalle.
    if (!chosen && productNeedsOptions(p)) {
      setDetailProduct(p)
      return
    }
    setCart(
      addToCart(
        {
          id: p.id,
          name: p.name,
          unit_price: chosen?.unit_price ?? p.sale_price,
          detail: chosen?.detail,
          image_url: p.image_url ?? undefined,
        },
        quantity,
        chosen?.selection,
      ),
    )
    toast.success(`${p.name} agregado al carrito`)
    setDetailProduct(null)
  }

  const activeCategoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : null
  const waContact = settings?.whatsapp_number ? normalizePhoneForWhatsApp(settings.whatsapp_number) : ''
  const priceFilterActive = Boolean(minPrice || maxPrice)
  const showStockOn = settings?.show_stock !== false
  const categoryStyle = settings?.category_style === 'pills' ? 'pills' : 'tiles'
  const itemCount = cartCount(cart)
  const cartSum = cartTotal(cart)
  const storeName = settings?.store_name || 'Tienda'
  const logoSrc = settings?.logo_url ? resolvePublicAssetUrl(settings.logo_url) : ''

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

  const current = activeSliders.length > 0 ? activeSliders[slide % activeSliders.length] : null
  const currentHasText = Boolean(current && (current.title || current.subtitle || current.button_text))
  const staticImage = settings?.background_image_url ? resolvePublicAssetUrl(settings.background_image_url) : ''
  // "Solo imagen": el tenant lo elige para toda la tienda, o se da solo en un banner sin textos.
  // Sin imágenes no hay qué mostrar y se cae al hero con texto.
  const heroImageOnly = (settings?.hero_style === 'image' && (activeSliders.length > 0 || Boolean(staticImage))) || Boolean(current && !currentHasText)
  const soloSlides = activeSliders.length > 0
    ? activeSliders.map((s) => ({ key: s.id, src: resolvePublicAssetUrl(s.image_url), link: s.link_url }))
    : [{ key: 0, src: staticImage, link: '' }]
  const slideIdx = activeSliders.length > 0 ? slide % activeSliders.length : 0

  /** Control de compra de una tarjeta: agregar, elegir opciones, agotado o cantidad si ya está en el carrito. */
  const renderBuy = (p: ProductReportRow, outOfStock: boolean, stockQty: number, capped: boolean) => {
    if (outOfStock) return <button type="button" className="vs-add off" disabled>Agotado</button>
    if (productNeedsOptions(p)) {
      return (
        <button type="button" className="vs-add opt" onClick={(e) => { e.stopPropagation(); setDetailProduct(p) }}>
          Elegir
        </button>
      )
    }
    const key = lineKey(p.id)
    const line = cart.find((l) => l.line_key === key)
    if (line) {
      const atMax = capped && line.quantity >= stockQty
      return (
        <div className="vs-step" onClick={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Quitar uno" onClick={() => setCart(setCartQuantity(key, line.quantity - 1))}>
            <Minus size={16} />
          </button>
          <span aria-live="polite">{line.quantity}</span>
          <button type="button" aria-label="Agregar uno" disabled={atMax} onClick={() => setCart(setCartQuantity(key, line.quantity + 1))}>
            <Plus size={16} />
          </button>
        </div>
      )
    }
    return (
      <button type="button" className="vs-add sq" aria-label={`Agregar ${p.name} al carrito`} onClick={(e) => { e.stopPropagation(); handleAdd(p) }}>
        <Plus size={20} strokeWidth={2.6} />
      </button>
    )
  }

  return (
    <div className="vs-shop" style={theme.vars}>
      {waContact && (
        <div className="vs-ann">
          Pide por WhatsApp y coordinamos la entrega · <b>respuesta directa</b>
        </div>
      )}

      {/* Cabecera */}
      <header className="vs-hdr">
        <div className="vs-wrap vs-hdr-in">
          <div className="vs-logo">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="vs-logo-mark" />
            ) : (
              <span className="vs-logo-mark" aria-hidden>{storeName.charAt(0).toUpperCase()}</span>
            )}
            <div>
              <b>{storeName}</b>
              {settings?.tagline && <small>{settings.tagline}</small>}
            </div>
          </div>

          <label className="vs-search">
            <Search size={19} aria-hidden />
            <input type="search" placeholder="Buscar producto..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
          </label>

          <button type="button" className="vs-cartbtn" onClick={() => setCartOpen(true)} aria-label={`Abrir carrito, ${itemCount} productos`}>
            <ShoppingBag size={22} aria-hidden />
            <span className="lbl">
              <small>Mi carrito</small>
              <strong>{formatSoles(cartSum)}</strong>
            </span>
            {itemCount > 0 && <span className="vs-badge-n">{itemCount}</span>}
          </button>
        </div>
      </header>

      <main className="vs-wrap">
        {/* Hero: carrusel con texto + botón, o panel de marca si no hay sliders */}
        {heroImageOnly ? (
          <section className="vs-hero solo" aria-label="Destacado">
            <div className="vs-solo-stack">
              {soloSlides.map((s, i) =>
                s.link ? (
                  <a key={s.key} href={s.link} className={`vs-solo-slide ${i === slideIdx ? 'on' : ''}`} aria-hidden={i !== slideIdx} tabIndex={i === slideIdx ? 0 : -1}>
                    <img src={s.src} alt="" />
                  </a>
                ) : (
                  <div key={s.key} className={`vs-solo-slide ${i === slideIdx ? 'on' : ''}`} aria-hidden={i !== slideIdx}>
                    <img src={s.src} alt="" />
                  </div>
                ),
              )}
            </div>
            {activeSliders.length > 1 && (
              <>
                <div className="vs-dots">
                  {activeSliders.map((s, i) => (
                    <button key={s.id} type="button" aria-label={`Ir al banner ${i + 1}`} className={i === slideIdx ? 'on' : ''} onClick={() => setSlide(i)} />
                  ))}
                </div>
                <div className="vs-arrows">
                  <button type="button" aria-label="Anterior" onClick={() => setSlide((s) => (s - 1 + activeSliders.length) % activeSliders.length)}>
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" aria-label="Siguiente" onClick={() => setSlide((s) => (s + 1) % activeSliders.length)}>
                    <ChevronRight size={20} />
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="vs-hero" aria-label="Destacado">
            <div className="vs-hero-t">
              <span className="vs-eyebrow">
                <Tag size={14} aria-hidden /> {current ? 'Destacado' : 'Catálogo digital'}
              </span>
              <h1 key={current?.id ?? 'static'} className="vs-fade">
                {current?.title || storeName}
              </h1>
              {(current?.subtitle || (!current && settings?.tagline)) && (
                <p className="vs-fade">{current?.subtitle || settings?.tagline}</p>
              )}
              {(current ? current.button_text : 'Ver productos') && (
                <a className="vs-btn" href={current?.link_url || '#productos'}>
                  {current ? current.button_text : 'Ver productos'} <ArrowRight size={19} aria-hidden />
                </a>
              )}
              {activeSliders.length > 1 && (
                <div className="vs-dots">
                  {activeSliders.map((s, i) => (
                    <button key={s.id} type="button" aria-label={`Ir al banner ${i + 1}`} className={i === slide % activeSliders.length ? 'on' : ''} onClick={() => setSlide(i)} />
                  ))}
                </div>
              )}
            </div>
            <div className={`vs-hero-art ${current?.image_url || staticImage ? "img" : ""}`} aria-hidden={!current}>
              {current?.image_url ? (
                <img key={current.id} className="vs-fade" src={resolvePublicAssetUrl(current.image_url)} alt="" />
              ) : staticImage ? (
                <img src={staticImage} alt="" />
              ) : (
                <>
                  <div className="vs-blob" style={{ width: 320, height: 320, right: -70, top: -70, background: 'radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--vs-g) 55%, #fff), var(--vs-g) 62%)' }} />
                  <div className="vs-blob" style={{ width: 130, height: 130, left: 36, bottom: 24, border: '2px solid rgb(255 255 255 / .35)', background: 'rgb(255 255 255 / .1)' }} />
                </>
              )}
            </div>
            {activeSliders.length > 1 && (
              <div className="vs-arrows">
                <button type="button" aria-label="Anterior" onClick={() => setSlide((s) => (s - 1 + activeSliders.length) % activeSliders.length)}>
                  <ChevronLeft size={20} />
                </button>
                <button type="button" aria-label="Siguiente" onClick={() => setSlide((s) => (s + 1) % activeSliders.length)}>
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Cómo comprar */}
        <section className="vs-perks" aria-label="Cómo comprar">
          <div className="vs-perk">
            <span className="ic"><MessageCircle size={22} aria-hidden /></span>
            <div><b>Pedido por WhatsApp</b><span>Se arma solo, tú solo envías</span></div>
          </div>
          <div className="vs-perk g">
            <span className="ic"><Check size={22} aria-hidden /></span>
            <div><b>{showStockOn ? 'Stock al día' : 'Catálogo al día'}</b><span>{showStockOn ? 'Ves lo que realmente hay' : 'Precios y productos actualizados'}</span></div>
          </div>
          <div className="vs-perk">
            <span className="ic"><ShoppingBag size={22} aria-hidden /></span>
            <div><b>Sin registros</b><span>Eliges, pides y listo</span></div>
          </div>
        </section>

        {/* Categorías */}
        {categories.length > 0 && (
          <>
            <div className="vs-sech">
              <div>
                <h2>Explora por categoría</h2>
                <small>Toca una para filtrar el catálogo</small>
              </div>
            </div>
            {categoryStyle === 'tiles' ? (
              <nav className="vs-cats vs-scroll" aria-label="Categorías">
                <button type="button" className={`vs-cat ${categoryId === null ? 'on' : ''}`} onClick={() => setCategoryId(null)}>
                  <span className="c"><Package size={24} aria-hidden /></span>
                  <span className="n">Todas</span>
                </button>
                {categories.map((c) => (
                  <button key={c.id} type="button" className={`vs-cat ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                    <span className="c">
                      {c.image_url ? <img src={resolvePublicAssetUrl(c.image_url)} alt="" loading="lazy" /> : c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="n">{c.name}</span>
                  </button>
                ))}
              </nav>
            ) : (
              <nav className="vs-pills vs-scroll" aria-label="Categorías">
                <button type="button" className={`vs-pill ${categoryId === null ? 'on' : ''}`} onClick={() => setCategoryId(null)}>Todas</button>
                {categories.map((c) => (
                  <button key={c.id} type="button" className={`vs-pill ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                    {c.image_url && <img src={resolvePublicAssetUrl(c.image_url)} alt="" loading="lazy" />}
                    {c.name}
                  </button>
                ))}
              </nav>
            )}
          </>
        )}

        {/* Productos */}
        <div className="vs-sech" id="productos" style={{ scrollMarginTop: 120 }}>
          <div>
            <h2>{activeCategoryName || 'Todos los productos'}</h2>
            {total > 0 && <small>{total} producto{total === 1 ? '' : 's'}</small>}
          </div>
          <div className="vs-bar">
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
              className={`vs-pill ${priceFilterActive || showPriceFilter ? 'on' : ''}`}
              aria-pressed={showPriceFilter}
            >
              <SlidersHorizontal size={15} aria-hidden /> Precio
            </button>
          </div>
        </div>

        {loading ? (
          <div className="vs-empty">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : products.length === 0 ? (
          <div className="vs-empty">
            <Package size={34} className="mx-auto mb-3" style={{ opacity: 0.4 }} />
            No hay productos disponibles.
          </div>
        ) : (
          <>
            <div className="vs-grid">
              {products.map((p) => {
                // Con show_stock=false el backend ya no manda stock_total real; además de eso, acá
                // se apaga del todo la condición para no mostrar "Agotado" ni bloquear "Agregar".
                const managed = showStockOn && Boolean(p.manage_stock)
                const stockQty = Number(p.stock_total ?? 0)
                const outOfStock = managed && stockQty <= 0
                const low = managed && stockQty > 0 && stockQty <= LOW_STOCK
                return (
                  <article
                    key={p.id}
                    className="vs-card"
                    onClick={() => setDetailProduct(p)}
                  >
                    <div className="vs-ph">
                      {p.image_url ? (
                        <img src={resolvePublicAssetUrl(p.image_url)} alt={p.name} loading="lazy" />
                      ) : (
                        <Package size={40} aria-hidden />
                      )}
                      {outOfStock && <span className="vs-tag">Agotado</span>}
                    </div>
                    <div className="bd">
                      <h3 className="nm">{p.name}</h3>
                      {managed && !outOfStock ? (
                        <span className={`vs-stock ${low ? 'low' : ''}`}>
                          {low ? `Quedan ${formatStockQty(stockQty)}` : 'En stock'}
                        </span>
                      ) : (
                        <span className="vs-stock" style={{ visibility: 'hidden' }} aria-hidden>.</span>
                      )}
                      <div className="vs-prr">
                        <span className="vs-price">
                          {p.has_variants && p.min_presentation_price !== undefined && !(Number(p.sale_price) > 0) ? (
                            <>
                              <small>Desde</small>
                              {formatSoles(p.min_presentation_price)}
                            </>
                          ) : (
                            formatSoles(p.sale_price)
                          )}
                        </span>
                        {renderBuy(p, outOfStock, stockQty, managed)}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {canLoadMore && (
              <div className="vs-more">
                <span>Mostrando {products.length} de {total}</span>
                <div className="vs-prog"><i style={{ width: `${Math.min(100, (products.length / Math.max(total, 1)) * 100)}%` }} /></div>
                <button type="button" className="vs-btn line" onClick={loadMore} disabled={loadingMore} style={{ alignSelf: 'center', marginTop: 6 }}>
                  {loadingMore ? 'Cargando...' : 'Ver más productos'}
                </button>
              </div>
            )}
          </>
        )}

        {waContact && (
          <section className="vs-cta">
            <div>
              <h2>¿No encuentras lo que buscas?</h2>
              <p>Escríbenos y te ayudamos a elegir, con stock y precio al momento.</p>
            </div>
            <a
              className="vs-btn dark"
              href={`https://wa.me/${waContact}?text=${encodeURIComponent(`Hola ${storeName}, quisiera hacer una consulta.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={20} aria-hidden /> Escribir por WhatsApp
            </a>
          </section>
        )}
      </main>

      {/* Pie */}
      <footer className="vs-foot">
        <div className="vs-wrap">
          <div className="vs-foot-cols">
            <div>
              <div className="vs-logo">
                {logoSrc ? <img src={logoSrc} alt="" className="vs-logo-mark" /> : <span className="vs-logo-mark" aria-hidden>{storeName.charAt(0).toUpperCase()}</span>}
                <h3>{storeName}</h3>
              </div>
              {settings?.description && <p>{settings.description}</p>}
            </div>
            {categories.length > 0 && (
              <div>
                <p className="k">Categorías</p>
                <ul>
                  {categories.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => { setCategoryId(c.id); document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }) }}>
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="k">Contáctanos</p>
              {waContact ? (
                <a
                  href={`https://wa.me/${waContact}?text=${encodeURIComponent(`Hola ${storeName}, quisiera hacer una consulta.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="vs-wa"
                >
                  <MessageCircle size={18} aria-hidden /> WhatsApp
                </a>
              ) : (
                <p style={{ margin: 0 }}>Sin contacto configurado</p>
              )}
            </div>
          </div>
          <div className="copy">© {new Date().getFullYear()} {storeName} · Catálogo Digital</div>
        </div>
      </footer>

      {itemCount > 0 && !cartOpen && !detailProduct && (
        <>
          <div className="vs-pad" />
          <button type="button" className="vs-mbar" onClick={() => setCartOpen(true)}>
            <span>
              <small>{itemCount} producto{itemCount === 1 ? '' : 's'}</small>
              <b>{formatSoles(cartSum)}</b>
            </span>
            <span className="go">Ver carrito <ArrowRight size={18} aria-hidden /></span>
          </button>
        </>
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onAdd={handleAdd}
          showStock={settings?.show_stock !== false}
        />
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
