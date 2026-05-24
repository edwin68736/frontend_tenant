import axios from 'axios'

// URL base de la API. En producción debe ser https://api.tukifac.cloud.
// Se resuelve en cada petición para usar siempre el host actual (así no queda localhost en producción).
function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  if (typeof window === 'undefined') return 'http://localhost:3000'
  const host = window.location.hostname
  if (host === 'localhost' || host.endsWith('.localhost')) return 'http://localhost:3000'
  return 'https://api.tukifac.cloud'
}

export const API_BASE_URL = getApiBaseUrl()

// Detectar el slug del tenant (alineado con backend ExtractSubdomain):
// 1. Subdominio producción: demo.app.tukifac.cloud → demo
// 2. Desarrollo: angel.localhost → angel
// 3. localhost plano: .env o localStorage
function getTenantSlug(): string {
  if (typeof window === 'undefined') return ''
  const hostname = window.location.hostname
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/i, '')
    if (sub && sub !== 'localhost') return sub
  }
  const parts = hostname.split('.')
  if (parts.length > 2 && parts[0] !== 'www' && parts[0] !== 'api') return parts[0]
  return import.meta.env.VITE_TENANT_SLUG || localStorage.getItem('tenantSlug') || ''
}

const api = axios.create({
  baseURL: 'http://localhost:3000', // se sobrescribe en el interceptor
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// Request interceptor — URL base según entorno y tenant slug
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()
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

// Response interceptor — redirigir a login si 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 409 && error.response?.data?.code === 'SESSION_UPDATED') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('active_branch')
      localStorage.removeItem('can_switch_branch')
      import('sonner').then(({ toast }) => {
        toast.error('Tu acceso fue actualizado. Vuelve a iniciar sesión.')
      })
      window.location.href = '/login'
      return Promise.reject(error)
    }
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? '')
      // No recargar en fallo de login (mostrar toast en LoginPage)
      if (url.includes('/api/login')) {
        return Promise.reject(error)
      }
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export { getApiBaseUrl, getTenantSlug }
export default api
