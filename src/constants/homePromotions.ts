export const YOUTUBE_TUTORIALS_URL = 'https://www.youtube.com/@Tukifacperu/playlists'
export const PROMO_WHATSAPP_URL = 'https://wa.link/4d7rjm'

export type HomePromoSlide = {
  id: number
  image: string
  alt: string
}

export const HOME_PROMO_SLIDES_DESKTOP: HomePromoSlide[] = [
  { id: 1, image: '/home/slider1.png', alt: 'Promoción 1' },
  { id: 2, image: '/home/slider2.png', alt: 'Promoción 2' },
  { id: 3, image: '/home/slider3.png', alt: 'Promoción 3' },
]

export const HOME_PROMO_SLIDES_MOBILE: HomePromoSlide[] = [
  { id: 1, image: '/home/slidermovil1.png', alt: 'Promoción móvil 1' },
  { id: 2, image: '/home/slidermovil2.png', alt: 'Promoción móvil 2' },
  { id: 3, image: '/home/slidermovil3.png', alt: 'Promoción móvil 3' },
]
