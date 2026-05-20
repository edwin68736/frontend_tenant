import api from './api'

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthUser {
  id: number
  name: string
  email: string
  role: string
}

export interface SubscriptionInfo {
  plan_name: string
  status: string
  start_date: string
  end_date: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
  modules: string[]
  permissions?: string[]
  subscription: SubscriptionInfo | null
}

// Decodifica el payload del JWT sin verificar firma (solo lectura cliente).
export function decodeJWT<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded) as T
  } catch {
    return null
  }
}

export interface JWTPayload {
  user_id: number
  email: string
  role_id: number
  role_name: string
  tenant_slug: string
  tenant_db: string
  tenant_id: number
  plan_id: number
  modules: string[]
  permissions?: string[]
  status: string
  type: string
  exp: number
  iat: number
}

export const authService = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/api/login', payload)
    return data
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('modules')
    localStorage.removeItem('tenantSlug')
  },
}
