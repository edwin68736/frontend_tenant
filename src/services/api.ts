import axios from 'axios'
import {
  getApiBaseUrl,
  getTenantApiOriginForSlug,
  getTenantSlug,
  shouldUseDevApiProxy,
} from '@/config/apiBaseUrl'
import { getResolvedTenantApiUrl, getTenantBinding } from '@/lib/tenantBinding/store'
import { normalizeBindingApiUrl } from '@/lib/tenantBinding/types'
import { isNativeShell } from '@/lib/platform/detect'

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
  // Techo de espera del cliente = WriteTimeout del server (120s): evita que una petición quede
  // colgada indefinidamente (antes era 0 = infinito, causa de "la vista se queda cargando"), sin
  // cortar operaciones largas legítimas como emisión/facturación (que el server ya acota).
  timeout: 120000,
})

api.interceptors.request.use((config) => {
  if (shouldUseDevApiProxy()) {
    config.baseURL = ''
    let tenantOrigin = ''
    if (isNativeShell()) {
      tenantOrigin = getResolvedTenantApiUrl()
    } else {
      const slug = getTenantSlug()
      if (slug) tenantOrigin = getTenantApiOriginForSlug(slug)
    }
    if (tenantOrigin) {
      config.headers['X-Tenant-Api-Origin'] = normalizeBindingApiUrl(tenantOrigin)
    }
  } else {
    config.baseURL = getApiBaseUrl()
  }

  if (isNativeShell() && !getTenantBinding()?.apiUrl && !config.url?.includes('/api/public/')) {
    console.warn('[Tukifac] Sin URL de tenant: vincule el RUC primero.')
  }

  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const slug = getTenantSlug()
  if (slug) {
    config.headers['X-Tenant-Slug'] = slug
  }
  return config
})

/**
 * Una sesión caída hace fallar a la vez todas las peticiones de arranque (capabilities,
 * context, notification-counts, subscription…). Sin este guard, cada 401 reasignaba
 * window.location y lanzaba su propio toast: media docena de navegaciones pisándose que
 * podían dejar la app en blanco sin llegar al login.
 */
let redirecting = false

/**
 * Evento que AuthContext escucha para desloguear su estado EN MEMORIA. Clave en Tauri/
 * Capacitor: ahí no hay recarga de página, así que sin esto el contexto seguía con
 * isAuthenticated=true, LoginPage rebotaba a /home, sus peticiones volvían a dar 401 y el
 * ciclo dejaba varios toasts y la pantalla rota sin llegar nunca al login.
 */
export const SESSION_EXPIRED_EVENT = 'tukifac:session-expired'

/** Emitido tras renovar el access token: AuthContext actualiza token/módulos/permisos en memoria. */
export const SESSION_REFRESHED_EVENT = 'tukifac:session-refreshed'

/**
 * 402 emitido por `SubscriptionGate` (backend) cuando `can_operate=false` (plan vencido fuera
 * de gracia, suspendido o bloqueado). No es un error de sesión: no desloguea, solo avisa para
 * que `SubscriptionStatusContext` refresque el hub y la UI bloquee con el motivo real en vez de
 * dejar que cada pantalla falle en silencio con su propio catch genérico.
 */
export const SUBSCRIPTION_BLOCKED_EVENT = 'tukifac:subscription-blocked'

/**
 * Un solo refresh en vuelo: si varias peticiones caen en 401 a la vez (típico burst de arranque),
 * todas esperan el MISMO refresh en lugar de disparar N renovaciones simultáneas.
 */
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null
  try {
    const resp = await api.post<{ token?: string }>(
      '/api/session/refresh',
      { refresh_token: refreshToken },
      // __skipAuthRefresh: que un 401 de este mismo endpoint NO dispare otro refresh (evita bucle).
      { __skipAuthRefresh: true } as import('axios').AxiosRequestConfig & { __skipAuthRefresh?: boolean },
    )
    const newToken = resp?.data?.token
    if (!newToken) return null
    localStorage.setItem('token', newToken)
    window.dispatchEvent(new CustomEvent(SESSION_REFRESHED_EVENT, { detail: { token: newToken } }))
    return newToken
  } catch {
    return null
  }
}

/**
 * Rutas públicas (sin login) que viven fuera de RequireAuth/MainLayout pero siguen dentro del
 * mismo árbol de providers (BranchCheckoutSeriesProvider, FeatureProvider, etc.). Si el navegador
 * tiene una sesión de administrador vencida en el mismo origen, esos providers igual disparan
 * llamadas autenticadas de fondo; un 401 de esas llamadas NO debe expulsar a /login a alguien que
 * está viendo la tienda pública.
 */
function isOnPublicRoute(): boolean {
  const path = isNativeShell() ? window.location.hash.replace(/^#/, '') : window.location.pathname
  return path.startsWith('/ecommerce')
}

function redirectToLogin(message?: string) {
  if (isOnPublicRoute()) return
  if (redirecting) return
  redirecting = true

  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('active_branch')
  localStorage.removeItem('can_switch_branch')
  import('sonner').then(({ toast }) => {
    // id fijo: si por cualquier motivo se dispara otra vez, sonner REEMPLAZA el toast en
    // lugar de apilar varios (mismo patrón que el front de restaurante).
    if (message) toast.error(message, { id: 'session-expired' })
  })
  // Desloguear también el estado en memoria del AuthContext (ver SESSION_EXPIRED_EVENT).
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  if (isNativeShell()) {
    window.location.hash = '#/login'
    // Cooldown en vez de soltar el guard al instante: los 401 en paralelo de la MISMA sesión
    // caída no deben repetir el toast. Se libera después para futuras sesiones expiradas.
    window.setTimeout(() => {
      redirecting = false
    }, 4000)
  } else {
    window.location.href = '/login'
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Reintento de fallos transitorios SOLO en peticiones idempotentes (GET/HEAD): red caída o
    // 502/503/504 (incluye el 503 DB_TRANSIENT del backend cuando el pool del tenant está saturado).
    // Así un tropiezo momentáneo de la BD se reintenta en vez de expulsar al login. El timeout del
    // cliente NO se reintenta: volver a intentarlo solo lo colgaría otra vez.
    const rConfig = error.config
    const rStatus = error.response?.status as number | undefined
    const rMethod = String(rConfig?.method ?? 'get').toLowerCase()
    const rIdempotent = rMethod === 'get' || rMethod === 'head'
    const rIsTimeout = error.code === 'ECONNABORTED'
    const rTransient =
      (!error.response && !rIsTimeout) || rStatus === 502 || rStatus === 503 || rStatus === 504
    if (rConfig && rIdempotent && rTransient) {
      const rAttempt = (rConfig.__retryCount ?? 0) + 1
      if (rAttempt <= 2) {
        rConfig.__retryCount = rAttempt
        await new Promise((resolve) => setTimeout(resolve, 400 * rAttempt))
        return api(rConfig)
      }
    }

    const code = error.response?.data?.code as string | undefined
    if (error.response?.status === 403 && code === 'TENANT_ISOLATION_VIOLATION') {
      redirectToLogin('Sesión inválida para esta empresa. Vuelva a vincular el RUC e iniciar sesión.')
      return Promise.reject(error)
    }
    if (error.response?.status === 401 && code === 'TOKEN_TENANT_INVALID') {
      redirectToLogin('Su sesión expiró o es obsoleta. Inicie sesión nuevamente.')
      return Promise.reject(error)
    }
    if (error.response?.status === 409 && error.response?.data?.code === 'SESSION_UPDATED') {
      redirectToLogin('Tu acceso fue actualizado. Vuelve a iniciar sesión.')
      return Promise.reject(error)
    }
    if (error.response?.status === 402 && (code === 'SUBSCRIPTION_REQUIRED' || code === 'TENANT_BLOCKED')) {
      window.dispatchEvent(new CustomEvent(SUBSCRIPTION_BLOCKED_EVENT))
      return Promise.reject(error)
    }
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? '')
      if (url.includes('/api/login')) {
        return Promise.reject(error)
      }
      // El propio endpoint de refresh no debe reintentar refrescar (evita bucle).
      if (error.config?.__skipAuthRefresh || url.includes('/api/session/refresh')) {
        return Promise.reject(error)
      }
      // Access token expirado: intentar renovarlo UNA vez con el refresh token y reintentar la
      // petición original. Solo si no hay refresh token (o el refresh falla) se cierra la sesión.
      if (!error.config?.__retriedAfterRefresh && localStorage.getItem('refresh_token')) {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }
        const newToken = await refreshPromise
        if (newToken && error.config) {
          error.config.__retriedAfterRefresh = true
          return api(error.config)
        }
      }
      redirectToLogin('Sesión expirada. Inicie sesión nuevamente.')
    }
    return Promise.reject(error)
  },
)

export {
  getApiBaseUrl,
  getApiPrefixUrl,
  getCentralApiOrigin,
  getTenantSlug,
} from '@/config/apiBaseUrl'
export default api
