/**
 * Telemetría de rendimiento real (RUM), mínima y sin datos personales.
 *
 * Mide en el navegador del usuario: tiempos de la carga de página (DNS, conexión, TLS, TTFB, carga), cuánto tarda
 * cada vista en terminar de cargar sus datos y cuánto tardan las llamadas API (agrupadas por ruta normalizada).
 * Se envía a POST /api/public/rum, que añade del lado servidor la familia de IP (v4/v6), el datacenter de
 * Cloudflare y el país — datos que el navegador no puede ver de su propia conexión.
 *
 * Qué NO se envía: IP, user-agent, usuario, ids de recursos, query strings, contenido de respuestas.
 * Respeta "Do Not Track". No lanza nunca: cualquier error se ignora para no afectar a la app.
 *
 * Objetivo: saber con clientes reales si los atascos de conexión IPv6 que medimos en una red concreta ocurren
 * también en producción, y cuánto pesa cada vista/llamada. Ver docs/RUM-TELEMETRY.md.
 */
import { getApiPrefixUrl, isLocalDevHost } from '@/config/apiBaseUrl'

const FLUSH_MS = 60_000
const MAX_VALUES_PER_ROUTE = 60
const SETTLE_QUIET_MS = 800
const SETTLE_MAX_MS = 15_000

type RouteAgg = { durations: number[]; ttfbs: number[]; kb: number[]; n: number; max: number }

const apiAgg = new Map<string, RouteAgg>()
const views: { route: string; settle_ms: number; api_calls: number; first?: boolean }[] = []
let navSent = false
let started = false

/** /api/products/123?x=1 → /api/products/:id (sin query ni identificadores). */
export function normalizeRoute(pathOrUrl: string): string {
  let p = pathOrUrl
  try {
    p = new URL(pathOrUrl, 'http://x').pathname
  } catch {
    /* se usa tal cual */
  }
  return (
    p
      .split('/')
      .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || seg.length > 40 ? ':id' : seg))
      .join('/')
      .slice(0, 80) || '/'
  )
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function isApiEntry(e: PerformanceResourceTiming): boolean {
  return (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch') && e.name.includes('/api/') && !e.name.includes('/api/public/rum')
}

function recordApi(e: PerformanceResourceTiming) {
  const route = normalizeRoute(e.name)
  let a = apiAgg.get(route)
  if (!a) {
    if (apiAgg.size >= 60) return
    a = { durations: [], ttfbs: [], kb: [], n: 0, max: 0 }
    apiAgg.set(route, a)
  }
  const dur = Math.max(0, e.responseEnd - e.startTime)
  a.n++
  a.max = Math.max(a.max, dur)
  if (a.durations.length < MAX_VALUES_PER_ROUTE) {
    a.durations.push(dur)
    a.ttfbs.push(Math.max(0, e.responseStart - e.requestStart))
    a.kb.push((e.transferSize || 0) / 1024)
  }
}

function navPayload() {
  const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (!n || n.loadEventEnd <= 0) return null
  const tls = n.secureConnectionStart > 0 ? n.connectEnd - n.secureConnectionStart : 0
  return {
    nav: {
      dns: n.domainLookupEnd - n.domainLookupStart,
      connect: n.connectEnd - n.connectStart,
      tls,
      ttfb: n.responseStart - n.requestStart,
      load: n.loadEventEnd,
    },
    protocol: n.nextHopProtocol || '',
  }
}

function buildBody(): string | null {
  const body: Record<string, unknown> = { app: 'tenant' }
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
  if (conn?.effectiveType) body.net_type = conn.effectiveType
  body.mobile = /Mobi|Android/i.test(navigator.userAgent)
  if (!navSent) {
    const np = navPayload()
    if (np) {
      Object.assign(body, np)
      navSent = true
    }
  }
  if (views.length > 0) body.views = views.splice(0, views.length)
  const api: unknown[] = []
  for (const [route, a] of apiAgg) {
    const d = [...a.durations].sort((x, y) => x - y)
    const t = [...a.ttfbs].sort((x, y) => x - y)
    api.push({
      route,
      n: a.n,
      p50: percentile(d, 0.5),
      p95: percentile(d, 0.95),
      max: a.max,
      ttfb_p50: percentile(t, 0.5),
      kb_avg: a.kb.length ? a.kb.reduce((s, v) => s + v, 0) / a.kb.length : 0,
    })
  }
  apiAgg.clear()
  if (api.length > 0) body.api = api
  return body.nav || body.views || body.api ? JSON.stringify(body) : null
}

function flush(useKeepalive = false) {
  try {
    const payload = buildBody()
    if (!payload) return
    const url = `${getApiPrefixUrl()}/public/rum`
    const slug = localStorage.getItem('tenantSlug') || ''
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(slug ? { 'X-Tenant-Slug': slug } : {}) },
      body: payload,
      keepalive: useKeepalive,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    /* nunca debe afectar a la app */
  }
}

/** Arranca la telemetría (idempotente). Llamar una vez tras montar la app. */
export function startRum() {
  if (started || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return
  started = true
  try {
    if (navigator.doNotTrack === '1') return
    // En desarrollo no se mide (ensuciaría los datos), salvo que se fuerce con localStorage.tukifac_rum_force = '1'.
    const forced = localStorage.getItem('tukifac_rum_force') === '1'
    if (isLocalDevHost(window.location.hostname) && !forced) return

    // Llamadas API ya hechas y las que vengan.
    performance.getEntriesByType('resource').forEach((e) => isApiEntry(e as PerformanceResourceTiming) && recordApi(e as PerformanceResourceTiming))
    new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => isApiEntry(e as PerformanceResourceTiming) && recordApi(e as PerformanceResourceTiming))
    }).observe({ type: 'resource', buffered: false })

    window.setInterval(() => flush(false), FLUSH_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true)
    })
    window.addEventListener('pagehide', () => flush(true))
    // Primer envío poco después de cargar la página (incluye la pantalla de login).
    window.setTimeout(() => flush(false), 8_000)
  } catch {
    /* ignorar */
  }
}

/**
 * Mide cuánto tarda una vista en "asentarse": desde que se navega hasta que dejan de llegar respuestas API
 * (800 ms de silencio, máximo 15 s). `first` = carga completa de página (t0 = inicio de la navegación); si no,
 * navegación interna. Es una aproximación: una petición aún en vuelo no figura en la línea de tiempo.
 */
export function trackViewSettle(pathname: string, first: boolean): () => void {
  if (!started || typeof performance === 'undefined') return () => {}
  const route = normalizeRoute(pathname)
  const t0 = first ? 0 : performance.now()
  const timer = window.setInterval(() => {
    const now = performance.now()
    const apis = performance
      .getEntriesByType('resource')
      .filter((e) => isApiEntry(e as PerformanceResourceTiming) && (e as PerformanceResourceTiming).startTime >= t0) as PerformanceResourceTiming[]
    const lastEnd = apis.reduce((m, e) => Math.max(m, e.responseEnd), 0)
    const quiet = apis.length > 0 ? now > lastEnd + SETTLE_QUIET_MS : now - t0 > 1500
    const timedOut = now - t0 > SETTLE_MAX_MS
    if (quiet || timedOut) {
      window.clearInterval(timer)
      const end = apis.length > 0 && !timedOut ? lastEnd : now
      views.push({ route, settle_ms: Math.max(0, end - t0), api_calls: apis.length, ...(first ? { first: true } : {}) })
    }
  }, 200)
  return () => window.clearInterval(timer)
}
