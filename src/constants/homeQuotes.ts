export type HomeInspirationalQuote = {
  /** Título principal del hero, alineado con la frase */
  headline: string
  quote: string
  author: string
}

export const HOME_INSPIRATIONAL_QUOTES: HomeInspirationalQuote[] = [
  {
    headline: 'El éxito se construye cada día',
    quote: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.',
    author: 'Robert Collier',
  },
  {
    headline: 'Actúa sin esperar el momento perfecto',
    quote: 'No esperes. El momento perfecto nunca llegará.',
    author: 'Napoleon Hill',
  },
  {
    headline: 'Aprende de cada cliente',
    quote: 'Tu cliente más insatisfecho es tu mayor fuente de aprendizaje.',
    author: 'Bill Gates',
  },
  {
    headline: 'Persiste en cada oportunidad',
    quote: 'La venta empieza cuando el cliente dice no.',
    author: 'Zig Ziglar',
  },
  {
    headline: 'Vende valor, no solo precio',
    quote: 'El precio es lo que pagas. El valor es lo que obtienes.',
    author: 'Warren Buffett',
  },
]

export function pickRandomHomeQuote(): HomeInspirationalQuote {
  const i = Math.floor(Math.random() * HOME_INSPIRATIONAL_QUOTES.length)
  return HOME_INSPIRATIONAL_QUOTES[i]
}
