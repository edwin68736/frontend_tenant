// Imágenes importadas (no desde /public): Vite les pone hash en el nombre y se sirven desde /assets con caché
// inmutable de 1 año, y Cloudflare las guarda en el edge. Los PNG originales (~10 MB cada uno) están en
// design-assets/landing-originals/.
import slider1 from '@/assets/landing/slider1.webp'
import slider2 from '@/assets/landing/slider2.webp'
import slider3 from '@/assets/landing/slider3.webp'
import slidermovil1 from '@/assets/landing/slidermovil1.webp'
import slidermovil2 from '@/assets/landing/slidermovil2.webp'
import slidermovil3 from '@/assets/landing/slidermovil3.webp'

export const YOUTUBE_TUTORIALS_URL = 'https://www.youtube.com/playlist?list=PLfgZGm1_pXQI'
export const PROMO_WHATSAPP_URL = 'https://wa.link/4d7rjm'

export type HomePromoSlide = {
  id: number
  image: string
  alt: string
}

export const HOME_PROMO_SLIDES_DESKTOP: HomePromoSlide[] = [
  { id: 1, image: slider1, alt: 'Promoción 1' },
  { id: 2, image: slider2, alt: 'Promoción 2' },
  { id: 3, image: slider3, alt: 'Promoción 3' },
]

export const HOME_PROMO_SLIDES_MOBILE: HomePromoSlide[] = [
  { id: 1, image: slidermovil1, alt: 'Promoción móvil 1' },
  { id: 2, image: slidermovil2, alt: 'Promoción móvil 2' },
  { id: 3, image: slidermovil3, alt: 'Promoción móvil 3' },
]
