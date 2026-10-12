import type { CSSProperties } from 'react'

/**
 * Tema de la tienda virtual. Parte de los dos colores y la tipografía que el negocio ya elige en el
 * panel (primario, secundario, fuente) y calcula el resto: texto sobre el primario, tonos suaves,
 * tinta, fondo y un acento. Así cualquier combinación mantiene contraste legible.
 *
 * Valores por defecto: verde de acción + azul noche, Sora para títulos y DM Sans para el texto.
 */

export const STORE_DEFAULT_PRIMARY = '#19d07a'
export const STORE_DEFAULT_SECONDARY = '#0a1a4f'
export const STORE_DEFAULT_FONT = 'Sora'

/** Valores que el panel guardaba antes de este diseño: se tratan como "sin elegir". */
const LEGACY_PRIMARY = '#16a34a'
const LEGACY_SECONDARY = '#0f172a'
const LEGACY_FONT = 'Inter'

type RGB = [number, number, number]

function parseHex(hex: string): RGB | null {
  const clean = (hex || '').trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a) ?? [0, 0, 0]
  const cb = parseHex(b) ?? [255, 255, 255]
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t])
}

function luminance(hex: string): number {
  const c = parseHex(hex) ?? [0, 0, 0]
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Oscurece `hex` (mezclándolo con negro) hasta lograr `min` de contraste contra blanco. */
function darkenForWhite(hex: string, min: number): string {
  let out = hex
  for (let i = 0; i < 20 && contrast(out, '#ffffff') < min; i++) out = mix(out, '#000000', 0.08)
  return out
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

export interface StoreThemeInput {
  primary_color?: string
  secondary_color?: string
  font_family?: string
  card_style?: string
}

export interface StoreTheme {
  vars: CSSProperties
  /** Familias a cargar desde Google Fonts. */
  fontQuery: string
}

/** Color primario efectivo (el guardado antes de este diseño cuenta como "sin elegir"). */
export function effectivePrimary(hex?: string): string {
  const h = (hex || '').trim().toLowerCase()
  return !h || h === LEGACY_PRIMARY || !parseHex(h) ? STORE_DEFAULT_PRIMARY : h
}

export function effectiveSecondary(hex?: string): string {
  const h = (hex || '').trim().toLowerCase()
  return !h || h === LEGACY_SECONDARY || !parseHex(h) ? STORE_DEFAULT_SECONDARY : h
}

export function effectiveFont(font?: string): string {
  const f = (font || '').trim()
  return !f || f === LEGACY_FONT ? STORE_DEFAULT_FONT : f
}

/** Pares tipográficos: Sora lleva DM Sans de texto; cualquier otra fuente se usa en todo. */
function fontStacks(font: string): { head: string; body: string; query: string } {
  if (font === 'Sora') {
    return {
      head: "'Sora', system-ui, sans-serif",
      body: "'DM Sans', system-ui, sans-serif",
      query: 'family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700',
    }
  }
  const stack = `'${font}', system-ui, sans-serif`
  return { head: stack, body: stack, query: `family=${font.replace(/ /g, '+')}:wght@400;500;600;700;800` }
}

export function buildStoreTheme(input: StoreThemeInput | null | undefined): StoreTheme {
  const primary = effectivePrimary(input?.primary_color)
  const secondary = effectiveSecondary(input?.secondary_color)
  const font = effectiveFont(input?.font_family)
  const stacks = fontStacks(font)

  // Tinta: el secundario, lo bastante oscuro para leerse como texto sobre blanco.
  const ink = darkenForWhite(secondary, 7)
  // Texto sobre el primario: blanco si el contraste alcanza, si no una tinta oscura del mismo tono.
  const onPrimary = contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : mix(primary, '#000000', 0.9)
  // Primario usable como texto/borde sobre fondo claro.
  const primaryText = darkenForWhite(primary, 4.5)

  // Acento (azul por defecto): mismo tono que el secundario pero vivo; si el secundario es gris, azul fijo.
  const [h, s] = hexToHsl(secondary)
  let accent = s > 0.12 ? hslToHex(h, Math.max(s, 0.72), 0.52) : '#2f5bff'
  accent = darkenForWhite(accent, 4.5)

  const radius = input?.card_style === 'square' ? '8px' : input?.card_style === 'minimal' ? '14px' : '24px'
  const shadow = input?.card_style === 'minimal' ? 'none' : '0 6px 22px rgba(10,26,79,0.07)'

  const vars: Record<string, string> = {
    '--vs-g': primary,
    '--vs-g-ink': onPrimary,
    '--vs-g-d': primaryText,
    '--vs-g-l': mix(primary, '#ffffff', 0.84),
    '--vs-ink': ink,
    '--vs-ink2': mix(ink, '#ffffff', 0.22),
    '--vs-muted': mix(ink, '#ffffff', 0.3),
    '--vs-line': mix(ink, '#ffffff', 0.88),
    '--vs-blue': accent,
    '--vs-blue-l': mix(accent, '#ffffff', 0.88),
    '--vs-ground': mix('#f4f7f6', primary, 0.045),
    '--vs-hero': `linear-gradient(115deg, ${ink} 0%, ${mix(ink, accent, 0.55)} 55%, ${accent} 100%)`,
    '--vs-r': radius,
    '--vs-shadow': shadow,
    '--vs-fh': stacks.head,
    '--vs-fb': stacks.body,
  }
  return { vars: vars as CSSProperties, fontQuery: stacks.query }
}

/** Inserta (una sola vez por familia) la hoja de Google Fonts que pide el tema. */
export function loadStoreFonts(fontQuery: string): void {
  if (typeof document === 'undefined') return
  const id = `vs-fonts-${fontQuery.replace(/[^a-zA-Z0-9]+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`
  document.head.appendChild(link)
}
