import axios from 'axios'
import { getApiBaseUrl, getTenantSlug } from '@/config/apiBaseUrl'

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

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

export { getApiBaseUrl, getApiPrefixUrl, getTenantSlug } from '@/config/apiBaseUrl'
export default api
