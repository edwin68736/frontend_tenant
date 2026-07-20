import { useEffect, useState } from 'react'

/** Suscripción a una media query. Útil cuando el ajuste no se puede hacer solo con CSS. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** ≥1024px. Mismo corte que usa el carrusel de promociones del home. */
export function useDesktopViewport(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/** <768px: teléfonos. Coincide con el breakpoint `md` de Tukifac. */
export function useNarrowViewport(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
