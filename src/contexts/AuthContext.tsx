import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authService, decodeJWT, type AuthUser, type LoginPayload, type JWTPayload } from '@/services/auth.service'
import { toast } from 'sonner'

interface AuthState {
  user: AuthUser | null
  token: string | null
  modules: string[]
  permissions: string[]
  tenantStatus: string
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (payload: LoginPayload) => Promise<void>
  logout: () => void
  updateSessionUser: (user: AuthUser) => void
  hasModule: (key: string) => boolean
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function extractModulesFromToken(token: string): string[] {
  const decoded = decodeJWT<JWTPayload>(token)
  return decoded?.modules ?? []
}

function extractPermissionsFromToken(token: string): string[] {
  const decoded = decodeJWT<JWTPayload>(token)
  return decoded?.permissions ?? []
}

function extractStatusFromToken(token: string): string {
  const decoded = decodeJWT<JWTPayload>(token)
  return decoded?.status ?? ''
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    modules: [],
    permissions: [],
    tenantStatus: '',
    isAuthenticated: false,
    isLoading: true,
  })

  // Restaurar sesión desde localStorage al cargar — leer módulos del JWT almacenado
  useEffect(() => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser
        const modules = extractModulesFromToken(token)
        const permissions = extractPermissionsFromToken(token)
        const tenantStatus = extractStatusFromToken(token)
        setState({ user, token, modules, permissions, tenantStatus, isAuthenticated: true, isLoading: false })
      } catch {
        localStorage.clear()
        setState({ user: null, token: null, modules: [], permissions: [], tenantStatus: '', isAuthenticated: false, isLoading: false })
      }
    } else {
      setState(s => ({ ...s, isLoading: false }))
    }
  }, [])

  const login = async (payload: LoginPayload) => {
    const data = await authService.login(payload)

    const modules = data.modules ?? extractModulesFromToken(data.token)
    const permissions = data.permissions ?? extractPermissionsFromToken(data.token)
    const tenantStatus = extractStatusFromToken(data.token)

    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))

    setState({
      user: data.user,
      token: data.token,
      modules,
      permissions,
      tenantStatus,
      isAuthenticated: true,
      isLoading: false,
    })

    toast.success(`Bienvenido, ${data.user.name}`)
  }

  const logout = () => {
    authService.logout()
    setState({ user: null, token: null, modules: [], permissions: [], tenantStatus: '', isAuthenticated: false, isLoading: false })
    toast.info('Sesión cerrada')
    window.location.href = '/login'
  }

  const updateSessionUser = (user: AuthUser) => {
    localStorage.setItem('user', JSON.stringify(user))
    setState((s) => ({ ...s, user }))
  }

  const hasModule = (key: string): boolean => state.modules.includes(key)
  const hasPermission = (permission: string): boolean => state.permissions.includes(permission)

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateSessionUser, hasModule, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
