import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  getApiBaseUrl,
  getTenantApiOriginForSlug,
  getTenantSlug,
  shouldUseDevApiProxy,
} from '@/config/apiBaseUrl'
import { getResolvedTenantApiUrl, getTenantBinding } from '@/lib/tenantBinding/store'
import { normalizeBindingApiUrl } from '@/lib/tenantBinding/types'
import { isNativeShell } from '@/lib/platform/detect'
import { clearIdleActivity } from '@/lib/idleSession'
import { clearAllCaches } from '@/lib/branchScope/caches'
import {
  BRANCH_MODE_HEADER,
  BRANCH_READ_ONLY_CODE,
  BRANCH_READ_ONLY_MESSAGE,
  isAllBranchesMode,
} from '@/lib/branchScope/viewMode'
import {
  advanceEpoch,
  currentEpoch,
  currentEpochSignal,
  isEpochStale,
  isGlobalRequestUrl,
  isWithinSwitchGrace,
  trackMutationEnd,
  trackMutationStart,
} from '@/lib/branchScope/requestEpoch'

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
  // Techo de espera del cliente = WriteTimeout del server (120s): evita que una petición quede
  // colgada indefinidamente (antes era 0 = infinito, causa de "la vista se queda cargando"), sin
  // cortar operaciones largas legítimas como emisión/facturación (que el server ya acota).
  timeout: 120000,
})

/**
 * Campos propios que viajan en el config de axios:
 *  - __epoch: época de sucursal con la que nació la petición (ver lib/branchScope/requestEpoch).
 *  - __global: true para llamadas que no dependen de la sucursal (nunca se abortan por cambio de sucursal).
 */
type BranchAwareConfig = InternalAxiosRequestConfig & {
  __epoch?: number
  __global?: boolean
  __retryCount?: number
  __retriedAfterRefresh?: boolean
  __skipAuthRefresh?: boolean
}

/** Respuesta que NUNCA se resuelve: la pantalla que la pidió ya se desmontó con el cambio de sucursal,
 * y así ninguno de sus `catch` (toast de error) ni `then` (datos de otra sucursal) llega a ejecutarse. */
function neverSettles<T = never>(): Promise<T> {
  return new Promise<T>(() => {})
}

export const EPOCH_CANCEL_MESSAGE = 'branch-epoch-changed'

function isReadMethod(method: string | undefined): boolean {
  const m = String(method ?? 'get').toLowerCase()
  return m === 'get' || m === 'head'
}

function isGlobalConfig(cfg: BranchAwareConfig | undefined): boolean {
  return Boolean(cfg?.__global) || isGlobalRequestUrl(cfg?.url)
}

/** Une la señal del llamador (si trae una) con la de la época vigente. */
function mergeSignals(own: AbortSignal | null | undefined, epochSignal: AbortSignal): AbortSignal {
  if (!own || own === epochSignal) return epochSignal
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  if (own.aborted || epochSignal.aborted) {
    ctrl.abort()
    return ctrl.signal
  }
  own.addEventListener('abort', abort, { once: true })
  epochSignal.addEventListener('abort', abort, { once: true })
  return ctrl.signal
}

/** Adaptador real (xhr/http/fetch de axios); sustituible en tests. */
let baseAdapter: AxiosAdapter | null = null
export function __setBaseAdapterForTests(adapter: AxiosAdapter | null): void {
  baseAdapter = adapter
}

/** Cuenta las escrituras en vuelo (POST/PUT/PATCH/DELETE): el cambio de sucursal espera a que terminen. */
api.defaults.adapter = async (config) => {
  const adapter = baseAdapter ?? axios.getAdapter(axios.defaults.adapter)
  const write = !isReadMethod(config.method)
  if (write) trackMutationStart()
  try {
    return await adapter(config)
  } finally {
    if (write) trackMutationEnd()
  }
}

/** Evento para que la UI (toast) avise que se intentó escribir en modo consulta. */
export const BRANCH_READ_ONLY_EVENT = 'tukifac:branch-read-only'

/**
 * Error equivalente al 403 BRANCH_READ_ONLY del servidor, pero generado en el cliente: en modo
 * "todas las sucursales" la cabecera X-Branch-Mode solo viaja en lecturas, así que una escritura que
 * se escapara de la UI iría al servidor SIN el modo y se ejecutaría en la sucursal activa. Se corta aquí.
 */
function readOnlyError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(BRANCH_READ_ONLY_MESSAGE, 'ERR_BAD_REQUEST', config, undefined, {
    status: 403,
    statusText: 'Forbidden',
    headers: {},
    config,
    data: { code: BRANCH_READ_ONLY_CODE, error: BRANCH_READ_ONLY_MESSAGE },
  })
}

api.interceptors.request.use((rawConfig) => {
  const config = rawConfig as BranchAwareConfig
  // Modo "todas las sucursales": la cabecera viaja SOLO en lecturas; toda escritura se corta aquí
  // (el toast lo emite el interceptor de respuesta al ver BRANCH_READ_ONLY).
  if (isAllBranchesMode() && !isGlobalConfig(config)) {
    if (isReadMethod(config.method)) {
      config.headers[BRANCH_MODE_HEADER] = 'all'
    } else {
      throw readOnlyError(config)
    }
  }
  if (!isGlobalConfig(config)) {
    if (config.__epoch === undefined) {
      config.__epoch = currentEpoch()
    } else if (isEpochStale(config.__epoch) && isReadMethod(config.method)) {
      // Reintento de una lectura de la sucursal anterior: no debe viajar con el token nuevo.
      // Constructor real de axios: (message, config, request); los typings heredan el de AxiosError.
      const CanceledCtor = axios.CanceledError as unknown as new (m: string, c: unknown) => Error
      throw new CanceledCtor(EPOCH_CANCEL_MESSAGE, config)
    }
    // Solo las lecturas se abortan: una escritura ya enviada la procesa el servidor igual y el usuario
    // debe ver su resultado (el cambio de sucursal espera a que terminen, ver waitForMutationsIdle).
    if (isReadMethod(config.method)) {
      config.signal = mergeSignals(config.signal as AbortSignal | undefined, currentEpochSignal())
    }
  }
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

/** Sucursal con la que el usuario viene operando: el servidor la conserva al renovar el token si le corresponde. */
function storedActiveBranchId(): number | undefined {
  try {
    const id = Number(JSON.parse(localStorage.getItem('active_branch') || 'null')?.id)
    return id > 0 ? id : undefined
  } catch {
    return undefined
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null
  try {
    const resp = await api.post<{ token?: string }>(
      '/api/session/refresh',
      { refresh_token: refreshToken, active_branch_id: storedActiveBranchId() },
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

/** Exportada para que useIdleLogout dispare el mismo camino de "sesión caída" que ya usa este
 * interceptor ante un 401/409 — mismo cleanup, mismo evento, misma navegación. */
export function redirectToLogin(message?: string) {
  if (isOnPublicRoute()) return
  if (redirecting) return
  redirecting = true

  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('active_branch')
  localStorage.removeItem('can_switch_branch')
  localStorage.removeItem('allowed_branches')
  clearIdleActivity()
  // Cachés de módulo (identidad de sucursal, unidades, claves de idempotencia, logo...) y peticiones en
  // vuelo: en Tauri/Capacitor no hay recarga de página, así que deben vaciarse aquí.
  clearAllCaches()
  advanceEpoch()
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

/** Emitido ante BRANCH_REQUIRED / BRANCH_FORBIDDEN: BranchContext refresca el contexto de sucursal. */
export const BRANCH_INVALID_EVENT = 'tukifac:branch-invalid'

api.interceptors.response.use(
  (response) => {
    // Una lectura de otra época que igual alcanzó a completarse: se descarta.
    const cfg = response.config as BranchAwareConfig
    if (!isGlobalConfig(cfg) && isReadMethod(cfg.method) && isEpochStale(cfg.__epoch)) {
      return neverSettles()
    }
    return response
  },
  async (error) => {
    const eCfg = error?.config as BranchAwareConfig | undefined
    // Lecturas de la sucursal anterior (abortadas, con error de red/5xx/401/409 tardío...): se ignoran en
    // silencio. Nunca se reintentan (viajarían con el token nuevo) ni se muestran como error.
    if (eCfg && !isGlobalConfig(eCfg) && isReadMethod(eCfg.method) && isEpochStale(eCfg.__epoch)) {
      return neverSettles()
    }
    // Reintento de fallos transitorios SOLO en peticiones idempotentes (GET/HEAD): red caída o
    // 502/503/504 (incluye el 503 DB_TRANSIENT del backend cuando el pool del tenant está saturado).
    // Así un tropiezo momentáneo de la BD se reintenta en vez de expulsar al login. El timeout del
    // cliente NO se reintenta: volver a intentarlo solo lo colgaría otra vez.
    const rConfig = error.config
    const rStatus = error.response?.status as number | undefined
    const rMethod = String(rConfig?.method ?? 'get').toLowerCase()
    const rIdempotent = rMethod === 'get' || rMethod === 'head'
    const rIsTimeout = error.code === 'ECONNABORTED'
    // Una petición cancelada a propósito (AbortController del llamador) nunca se reintenta.
    const rTransient =
      (!error.response && !rIsTimeout && !axios.isCancel(error)) || rStatus === 502 || rStatus === 503 || rStatus === 504
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
      // El propio cambio de sucursal sube la versión de sesión: una petición que iba en vuelo con el token
      // anterior recibe este 409. No es una sesión caída: no se cierra sesión.
      if (isWithinSwitchGrace()) {
        return isReadMethod(eCfg?.method) ? neverSettles() : Promise.reject(error)
      }
      redirectToLogin('Tu acceso fue actualizado. Vuelve a iniciar sesión.')
      return Promise.reject(error)
    }
    if (error.response?.status === 403 && code === BRANCH_READ_ONLY_CODE) {
      // Escritura rechazada por modo consulta (cortada en el cliente o respondida por el servidor).
      window.dispatchEvent(new CustomEvent(BRANCH_READ_ONLY_EVENT))
      return Promise.reject(error)
    }
    if (code === 'BRANCH_REQUIRED' || code === 'BRANCH_FORBIDDEN') {
      window.dispatchEvent(new CustomEvent(BRANCH_INVALID_EVENT, { detail: { code } }))
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
