import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  X,
} from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import {
  HOME_PROMO_SLIDES_DESKTOP,
  HOME_PROMO_SLIDES_MOBILE,
  PROMO_WHATSAPP_URL,
  type HomePromoSlide,
} from '@/constants/homePromotions'

const SLIDE_INTERVAL_MS = 5000
const SWIPE_THRESHOLD = 50

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.865 9.865 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function useMobileTabletSlides() {
  const [useMobileSlides, setUseMobileSlides] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e: MediaQueryListEvent) => setUseMobileSlides(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return useMobileSlides ? HOME_PROMO_SLIDES_MOBILE : HOME_PROMO_SLIDES_DESKTOP
}

function useSwipeHandlers(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStartX = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.screenX ?? 0
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const endX = e.changedTouches[0]?.screenX ?? 0
      const delta = endX - touchStartX.current
      if (delta < -SWIPE_THRESHOLD) onSwipeLeft()
      if (delta > SWIPE_THRESHOLD) onSwipeRight()
    },
    [onSwipeLeft, onSwipeRight],
  )

  return { onTouchStart, onTouchEnd }
}

function PromoSlideDots({
  count,
  current,
  onSelect,
  variant,
}: {
  count: number
  current: number
  onSelect: (index: number) => void
  variant: 'hero' | 'modal'
}) {
  return (
    <div
      className={
        variant === 'hero'
          ? 'absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20'
          : 'absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10'
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(index)
          }}
          className={
            variant === 'hero'
              ? `rounded-full transition-all shadow-sm h-2 ${
                  current === index
                    ? 'bg-green-600 w-6'
                    : 'bg-green-600/40 hover:bg-green-600/60 w-2'
                }`
              : `rounded-full h-1.5 transition-all ${
                  current === index ? 'bg-green-500 w-4' : 'bg-white/50 w-1.5 hover:bg-white/70'
                }`
          }
          aria-label={`Ir a diapositiva ${index + 1}`}
        />
      ))}
    </div>
  )
}

function PromoCarouselTrack({
  slides,
  current,
  onTouchStart,
  onTouchEnd,
}: {
  slides: HomePromoSlide[]
  current: number
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}) {
  return (
    <div
      className="relative w-full h-full flex transition-transform duration-500 ease-out"
      style={{ transform: `translateX(-${current * 100}%)` }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((slide) => (
        <div
          key={slide.id}
          className="min-w-full h-full relative flex items-center justify-center bg-slate-900 overflow-hidden"
        >
          <div className="absolute inset-0 z-0">
            <img
              src={slide.image}
              className="w-full h-full object-cover opacity-60 blur-xl scale-110"
              alt=""
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <img src={slide.image} alt={slide.alt} className="relative z-10 w-full h-full object-cover" />
        </div>
      ))}
    </div>
  )
}

function PromotionsModal({
  open,
  onClose,
  slides,
}: {
  open: boolean
  onClose: () => void
  slides: HomePromoSlide[]
}) {
  const [modalSlide, setModalSlide] = useState(0)

  useEffect(() => {
    if (open) setModalSlide(0)
  }, [open])

  const next = useCallback(
    () => setModalSlide((i) => (i + 1) % slides.length),
    [slides.length],
  )
  const prev = useCallback(
    () => setModalSlide((i) => (i - 1 + slides.length) % slides.length),
    [slides.length],
  )

  const { onTouchStart, onTouchEnd } = useSwipeHandlers(next, prev)

  return (
    <PortalModal
      open={open}
      onClose={onClose}
      overlayClassName="bg-black/60 backdrop-blur-sm items-center"
      className="max-w-md"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Promociones</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-slate-900">
          <div
            className="relative w-full aspect-[4/3] flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${modalSlide * 100}%)` }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {slides.map((slide) => (
              <div
                key={slide.id}
                className="min-w-full h-full flex-shrink-0 flex items-center justify-center bg-slate-900 p-2"
              >
                <img
                  src={slide.image}
                  alt={slide.alt}
                  className="max-w-full max-h-full w-full object-contain object-center"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/30 text-white hover:bg-black/50"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/30 text-white hover:bg-black/50"
            aria-label="Siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <PromoSlideDots
            count={slides.length}
            current={modalSlide}
            onSelect={setModalSlide}
            variant="modal"
          />
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <a
            href={PROMO_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
          >
            <WhatsAppIcon className="w-5 h-5" />
            <span>Escribir por WhatsApp</span>
          </a>
        </div>
      </div>
    </PortalModal>
  )
}

export function HomeTutorialsPromoSection() {
  const slides = useMobileTabletSlides()
  const [showPromoModal, setShowPromoModal] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)

  const nextSlide = useCallback(
    () => setCurrentSlide((i) => (i + 1) % HOME_PROMO_SLIDES_DESKTOP.length),
    [],
  )
  const prevSlide = useCallback(
    () =>
      setCurrentSlide(
        (i) => (i - 1 + HOME_PROMO_SLIDES_DESKTOP.length) % HOME_PROMO_SLIDES_DESKTOP.length,
      ),
    [],
  )

  const { onTouchStart, onTouchEnd } = useSwipeHandlers(nextSlide, prevSlide)

  useEffect(() => {
    const id = window.setInterval(nextSlide, SLIDE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [nextSlide])

  useEffect(() => {
    setCurrentSlide(0)
  }, [slides])

  return (
    <>
      {/* Móvil / tablet */}
      <div className="flex flex-col gap-2 sm:gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setShowPromoModal(true)}
          className="flex flex-row items-center justify-between gap-3 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-r from-green-600 to-green-700 text-white p-3 sm:p-4 h-[56px] sm:h-[64px] w-full hover:from-green-700 hover:to-green-800 transition-colors shadow-sm"
        >
          <span className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center">
            <WhatsAppIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
          <span className="flex-1 text-left text-xs sm:text-sm font-semibold truncate">Promociones</span>
          <span className="flex-shrink-0 text-xs sm:text-sm font-medium opacity-90">Ver →</span>
        </button>
      </div>

      {/* Desktop: sin la tarjeta de bienvenida, las promociones ocupan el ancho completo. */}
      <div className="hidden lg:block">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowPromoModal(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setShowPromoModal(true)
            }
          }}
          className="relative overflow-hidden rounded-[20px] shadow-sm block w-full h-[220px] text-left cursor-pointer p-0 border-0 bg-transparent"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-full bg-gradient-to-br from-blue-400/30 to-green-400/30 animate-ping" />
              <div className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/40 to-green-500/40 animate-pulse" />
              <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-blue-600/90 to-green-600/90 flex items-center justify-center shadow-lg backdrop-blur-sm border border-white/20">
                <MousePointerClick className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-8 text-center">
              <span className="inline-block px-3 py-1 bg-black/50 text-white text-xs font-semibold rounded-full backdrop-blur-md border border-white/10 shadow-sm animate-bounce">
                Ver Promoción
              </span>
            </div>
          </div>

          <PromoCarouselTrack
            slides={HOME_PROMO_SLIDES_DESKTOP}
            current={currentSlide}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              prevSlide()
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              nextSlide()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 transition-colors"
            aria-label="Siguiente"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <PromoSlideDots
            count={HOME_PROMO_SLIDES_DESKTOP.length}
            current={currentSlide}
            onSelect={setCurrentSlide}
            variant="hero"
          />
        </div>
      </div>

      <PromotionsModal open={showPromoModal} onClose={() => setShowPromoModal(false)} slides={slides} />
    </>
  )
}
