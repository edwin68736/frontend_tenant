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
    iconBg: 'bg-gradient-to-br from-emerald-100 to-teal-100',
    iconText: 'text-emerald-700',
    iconHoverBg: 'group-hover:from-emerald-600 group-hover:to-teal-600',
    borderHover: 'hover:border-emerald-200',
    shadowHover: 'hover:shadow-emerald-100/60',
    accent: 'text-emerald-600',
    linkHover: 'group-hover:text-emerald-800',
  },
  '/sales': {
    topBar: 'from-blue-500 to-sky-500',
    iconBg: 'bg-gradient-to-br from-blue-100 to-sky-100',
    iconText: 'text-blue-700',
    iconHoverBg: 'group-hover:from-blue-600 group-hover:to-sky-600',
    borderHover: 'hover:border-blue-200',
    shadowHover: 'hover:shadow-blue-100/60',
    accent: 'text-blue-600',
    linkHover: 'group-hover:text-blue-800',
  },
  '/products': {
    topBar: 'from-violet-500 to-purple-500',
    iconBg: 'bg-gradient-to-br from-violet-100 to-purple-100',
    iconText: 'text-violet-700',
    iconHoverBg: 'group-hover:from-violet-600 group-hover:to-purple-600',
    borderHover: 'hover:border-violet-200',
    shadowHover: 'hover:shadow-violet-100/60',
    accent: 'text-violet-600',
    linkHover: 'group-hover:text-violet-800',
  },
  '/cashbank/cash': {
    topBar: 'from-amber-500 to-orange-500',
    iconBg: 'bg-gradient-to-br from-amber-100 to-orange-100',
    iconText: 'text-amber-700',
    iconHoverBg: 'group-hover:from-amber-500 group-hover:to-orange-500',
    borderHover: 'hover:border-amber-200',
    shadowHover: 'hover:shadow-amber-100/60',
    accent: 'text-amber-600',
    linkHover: 'group-hover:text-amber-800',
  },
  '/dashboard': {
    topBar: 'from-slate-500 to-slate-600',
    iconBg: 'bg-gradient-to-br from-slate-100 to-slate-200',
    iconText: 'text-slate-700',
    iconHoverBg: 'group-hover:from-slate-600 group-hover:to-slate-700',
    borderHover: 'hover:border-slate-300',
    shadowHover: 'hover:shadow-slate-200/80',
    accent: 'text-slate-600',
    linkHover: 'group-hover:text-slate-800',
  },
  '/modules': {
    topBar: 'from-indigo-500 to-indigo-600',
    iconBg: 'bg-gradient-to-br from-indigo-100 to-blue-100',
    iconText: 'text-indigo-700',
    iconHoverBg: 'group-hover:from-indigo-600 group-hover:to-indigo-700',
    borderHover: 'hover:border-indigo-200',
    shadowHover: 'hover:shadow-indigo-100/60',
    accent: 'text-indigo-600',
    linkHover: 'group-hover:text-indigo-800',
  },
}

const DEFAULT_QUICK_THEME: HomeQuickLinkTheme = HOME_QUICK_LINK_THEMES['/dashboard']

export function getQuickLinkTheme(path: string): HomeQuickLinkTheme {
  return HOME_QUICK_LINK_THEMES[path] ?? DEFAULT_QUICK_THEME
}
