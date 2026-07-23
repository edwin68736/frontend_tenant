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

function redirectToLogin(message?: string) {
  if (redirecting) return
  redirecting = true

  localStorage.removeItem('token')
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
  (error) => {
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
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? '')
      if (url.includes('/api/login')) {
        return Promise.reject(error)
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
