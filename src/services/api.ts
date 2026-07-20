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

function redirectToLogin(message?: string) {
  if (redirecting) return
  redirecting = true

  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('active_branch')
  localStorage.removeItem('can_switch_branch')
  import('sonner').then(({ toast }) => {
    if (message) toast.error(message)
  })
  if (isNativeShell()) {
    window.location.hash = '#/login'
    // El hash no recarga la app: hay que soltar el guard para futuras sesiones.
    redirecting = false
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
