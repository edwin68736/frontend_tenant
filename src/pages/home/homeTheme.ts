/** Paleta visual fija del HOME (excepción al branding por tenant). */

export type HomeKpiTheme = {
  card: string
  border: string
  shadow: string
  iconWrap: string
  label: string
  value: string
}

export const HOME_KPI_THEMES: Record<string, HomeKpiTheme> = {
  sales_today: {
    card: 'bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700',
    border: 'border-emerald-700/40',
    shadow: 'shadow-lg shadow-emerald-600/25',
    iconWrap: 'bg-white/20 text-white backdrop-blur-sm',
    label: 'text-emerald-50/90',
    value: 'text-white',
  },
  sales_month: {
    card: 'bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700',
    border: 'border-blue-700/40',
    shadow: 'shadow-lg shadow-blue-600/25',
    iconWrap: 'bg-white/20 text-white backdrop-blur-sm',
    label: 'text-blue-50/90',
    value: 'text-white',
  },
  purchases_today: {
    card: 'bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600',
    border: 'border-orange-600/40',
    shadow: 'shadow-lg shadow-orange-500/25',
    iconWrap: 'bg-white/20 text-white backdrop-blur-sm',
    label: 'text-orange-50/90',
    value: 'text-white',
  },
  purchases_month: {
    card: 'bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700',
    border: 'border-violet-700/40',
    shadow: 'shadow-lg shadow-violet-600/25',
    iconWrap: 'bg-white/20 text-white backdrop-blur-sm',
    label: 'text-violet-50/90',
    value: 'text-white',
  },
}

export type HomeQuickLinkTheme = {
  topBar: string
  /** Fondo pastel de la tarjeta + su borde, en el mismo tono que el icono. */
  cardBg: string
  iconBg: string
  iconText: string
  iconHoverBg: string
  borderHover: string
  shadowHover: string
  accent: string
  linkHover: string
}

export const HOME_QUICK_LINK_THEMES: Record<string, HomeQuickLinkTheme> = {
  '/sales/pos': {
    topBar: 'from-emerald-500 to-teal-500',
    cardBg: 'bg-emerald-50 border-emerald-200/70',
    iconBg: 'bg-emerald-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-emerald-700',
    borderHover: 'hover:border-emerald-300',
    shadowHover: 'hover:shadow-emerald-100/60',
    accent: 'text-emerald-600',
    linkHover: 'group-hover:text-emerald-800',
  },
  '/sales': {
    topBar: 'from-blue-500 to-sky-500',
    cardBg: 'bg-blue-50 border-blue-200/70',
    iconBg: 'bg-blue-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-blue-700',
    borderHover: 'hover:border-blue-300',
    shadowHover: 'hover:shadow-blue-100/60',
    accent: 'text-blue-600',
    linkHover: 'group-hover:text-blue-800',
  },
  '/quotations/new': {
    topBar: 'from-teal-500 to-cyan-500',
    cardBg: 'bg-teal-50 border-teal-200/70',
    iconBg: 'bg-teal-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-teal-700',
    borderHover: 'hover:border-teal-300',
    shadowHover: 'hover:shadow-teal-100/60',
    accent: 'text-teal-600',
    linkHover: 'group-hover:text-teal-800',
  },
  '/quotations': {
    topBar: 'from-teal-500 to-cyan-500',
    cardBg: 'bg-teal-50 border-teal-200/70',
    iconBg: 'bg-teal-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-teal-700',
    borderHover: 'hover:border-teal-300',
    shadowHover: 'hover:shadow-teal-100/60',
    accent: 'text-teal-600',
    linkHover: 'group-hover:text-teal-800',
  },
  '/purchases': {
    topBar: 'from-rose-500 to-pink-500',
    cardBg: 'bg-rose-50 border-rose-200/70',
    iconBg: 'bg-rose-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-rose-700',
    borderHover: 'hover:border-rose-300',
    shadowHover: 'hover:shadow-rose-100/60',
    accent: 'text-rose-600',
    linkHover: 'group-hover:text-rose-800',
  },
  '/products': {
    topBar: 'from-violet-500 to-purple-500',
    cardBg: 'bg-violet-50 border-violet-200/70',
    iconBg: 'bg-violet-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-violet-700',
    borderHover: 'hover:border-violet-300',
    shadowHover: 'hover:shadow-violet-100/60',
    accent: 'text-violet-600',
    linkHover: 'group-hover:text-violet-800',
  },
  '/cashbank/cash': {
    topBar: 'from-amber-500 to-orange-500',
    cardBg: 'bg-amber-50 border-amber-200/70',
    // Naranja en vez de ámbar: sobre `amber-500` el icono blanco queda con muy poco
    // contraste (~2:1). `orange-600` mantiene el tono cálido y sí se lee.
    iconBg: 'bg-orange-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-orange-700',
    borderHover: 'hover:border-amber-300',
    shadowHover: 'hover:shadow-amber-100/60',
    accent: 'text-amber-600',
    linkHover: 'group-hover:text-amber-800',
  },
  '/dashboard': {
    topBar: 'from-slate-500 to-slate-600',
    cardBg: 'bg-slate-50 border-slate-200/70',
    iconBg: 'bg-slate-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-slate-700',
    borderHover: 'hover:border-slate-400',
    shadowHover: 'hover:shadow-slate-200/80',
    accent: 'text-slate-600',
    linkHover: 'group-hover:text-slate-800',
  },
  '/modules': {
    topBar: 'from-indigo-500 to-indigo-600',
    cardBg: 'bg-indigo-50 border-indigo-200/70',
    iconBg: 'bg-indigo-600',
    iconText: 'text-white',
    iconHoverBg: 'group-hover:bg-indigo-700',
    borderHover: 'hover:border-indigo-300',
    shadowHover: 'hover:shadow-indigo-100/60',
    accent: 'text-indigo-600',
    linkHover: 'group-hover:text-indigo-800',
  },
}

const DEFAULT_QUICK_THEME: HomeQuickLinkTheme = HOME_QUICK_LINK_THEMES['/dashboard']

export function getQuickLinkTheme(path: string): HomeQuickLinkTheme {
  return HOME_QUICK_LINK_THEMES[path] ?? DEFAULT_QUICK_THEME
}
