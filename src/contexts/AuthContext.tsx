import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { authService, decodeJWT, type AuthUser, type LoginPayload, type JWTPayload } from '@/services/auth.service'
import { hasTenantPermission } from '@/lib/permissions'
import {
  buildUserFromMasterToken,
  clearMasterSsoFromUrl,
  exchangeMasterCode,
  hasMasterSsoInUrl,
  persistMasterSsoSession,
  readMasterCodeFromUrl,
  readMasterSsoTokenFromUrl,
} from '@/lib/masterSso'
import { toast } from 'sonner'
import { isNativeShell } from '@/lib/platform/detect'
import { clearCompanyCaches } from '@/lib/companyConfig/store'
import { SESSION_EXPIRED_EVENT, SESSION_REFRESHED_EVENT, refreshAccessToken } from '@/services/api'
import { hasStaleProductPermissions } from '@/lib/staleTokenPermissions'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { markIdleActivity, clearIdleActivity } from '@/lib/idleSession'
import { clearAllCaches } from '@/lib/branchScope/caches'
import { advanceEpoch } from '@/lib/branchScope/requestEpoch'

interface AuthState {
  user: AuthUser | null
  token: string | null
  modules: string[]
  permissions: string[]
  tenantStatus: string
  isImpersonated: boolean
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

function extractImpersonatedFromToken(token: string): boolean {
  const decoded = decodeJWT<JWTPayload>(token)
  return decoded?.impersonated === true
}

/**
 * Sesión guardada en localStorage, lista desde el PRIMER render.
 *
 * Antes el estado arrancaba "no autenticado" y un efecto lo corregía después: durante ese primer
 * render los providers hijos (BranchProvider, etc.) veían un usuario sin sesión, borraban la sucursal
 * activa y esperaban a /api/session/context para recuperarla, con lo que todas las vistas dependientes
 * de la sucursal (POS incluido) arrancaban sus peticiones ~1 s tarde.
 *
 * Es el mismo dato que ya leía el efecto (token + user del propio navegador), sin ninguna validación
 * nueva: si el token venció, la primera petición devuelve 401 y el interceptor cierra la sesión igual
 * que antes. Devuelve null cuando hay que resolverla en el efecto: acceso maestro en la URL
 * (?master_sso=...), sesión corrupta o inexistente.
 */
function readStoredSession(): AuthState | null {
  try {
    if (hasMasterSsoInUrl()) return null
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (!token || !userStr) return null
    const user = JSON.parse(userStr) as AuthUser
    return {
      user,
      token,
      modules: extractModulesFromToken(token),
      permissions: extractPermissionsFromToken(token),
      tenantStatus: extractStatusFromToken(token),
      isImpersonated: extractImpersonatedFromToken(token),
      isAuthenticated: true,
      isLoading: false,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    () =>
      readStoredSession() ?? {
        user: null,
        token: null,
        modules: [],
        permissions: [],
        tenantStatus: '',
        isImpersonated: false,
        isAuthenticated: false,
        isLoading: true,
      },
  )

  // Cierre de sesión automático por inactividad (3h) — ver hooks/useIdleLogout.ts.
  useIdleLogout(state.isAuthenticated)

  // Token anterior a un permiso nuevo (V177): renovar una vez por carga para que la interfaz refleje los permisos del rol.
  const staleRefreshTried = useRef(false)
  useEffect(() => {
    if (!state.isAuthenticated || state.isImpersonated || staleRefreshTried.current) return
    if (!hasStaleProductPermissions(state.permissions)) return
    staleRefreshTried.current = true
    void refreshAccessToken()
  }, [state.isAuthenticated, state.isImpersonated, state.permissions])

  // Restaurar sesión o acceso maestro (/?master_sso=...) — sin recarga de página
  useEffect(() => {
    // Acceso maestro con código de UN SOLO USO: se quita de la URL de inmediato (no queda en el historial) y se canjea por
    // POST; el JWT nunca viaja en una URL. El enlace heredado ?master_sso=<jwt> sigue funcionando como puente.
    const masterCode = readMasterCodeFromUrl()
    if (masterCode) {
      clearMasterSsoFromUrl()
      void exchangeMasterCode(masterCode).then((tok) => {
        const user = tok ? buildUserFromMasterToken(tok) : null
        if (tok && user) {
          persistMasterSsoSession(tok, user)
          markIdleActivity()
          setState({
            user,
            token: tok,
            modules: extractModulesFromToken(tok),
            permissions: extractPermissionsFromToken(tok),
            tenantStatus: extractStatusFromToken(tok),
            isImpersonated: extractImpersonatedFromToken(tok),
            isAuthenticated: true,
            isLoading: false,
          })
          return
        }
        toast.error('Enlace de acceso maestro inválido o expirado')
        setState((prev) => ({ ...prev, isLoading: false }))
      })
      return
    }

    const masterToken = readMasterSsoTokenFromUrl()
    if (masterToken) {
      const user = buildUserFromMasterToken(masterToken)
      if (user) {
        persistMasterSsoSession(masterToken, user)
        clearMasterSsoFromUrl()
        markIdleActivity()
        setState({
          user,
          token: masterToken,
          modules: extractModulesFromToken(masterToken),
          permissions: extractPermissionsFromToken(masterToken),
          tenantStatus: extractStatusFromToken(masterToken),
          isImpersonated: extractImpersonatedFromToken(masterToken),
          isAuthenticated: true,
          isLoading: false,
        })
        return
      }
      toast.error('Enlace de acceso maestro inválido o expirado')
      clearMasterSsoFromUrl()
    }

    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser
        const modules = extractModulesFromToken(token)
        const permissions = extractPermissionsFromToken(token)
        const tenantStatus = extractStatusFromToken(token)
        const isImpersonated = extractImpersonatedFromToken(token)
        // Ya se resolvió de forma síncrona al montar (readStoredSession): no se vuelve a crear el estado.
        setState((s) =>
          s.isAuthenticated && s.token === token
            ? s
            : { user, token, modules, permissions, tenantStatus, isImpersonated, isAuthenticated: true, isLoading: false },
        )
      } catch {
        localStorage.clear()
        setState({ user: null, token: null, modules: [], permissions: [], tenantStatus: '', isImpersonated: false, isAuthenticated: false, isLoading: false })
      }
    } else {
      setState(s => ({ ...s, isLoading: false }))
    }
  }, [])

  // Sesión caducada detectada por el interceptor del API (401): este ya limpió localStorage,
  // pero el estado del contexto vive en memoria. En Tauri/Capacitor no hay recarga de página,
  // así que sin este listener el contexto seguía "autenticado" y LoginPage rebotaba a /home
  // en bucle (varios toasts de sesión expirada y pantalla en blanco sin llegar al login).
  useEffect(() => {
    const onSessionExpired = () => {
      setState({
        user: null,
        token: null,
        modules: [],
        permissions: [],
        tenantStatus: '',
        isImpersonated: false,
        isAuthenticated: false,
        isLoading: false,
      })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [])

  // Access token renovado por el interceptor (refresh token): actualiza el estado EN MEMORIA con
  // los claims frescos del nuevo token (módulos/permisos/estado), sin recargar la página. Clave en
  // Tauri/Capacitor y en la SPA: la sesión continúa sin parpadeo ni relogin.
  useEffect(() => {
    const onSessionRefreshed = (e: Event) => {
      const token = (e as CustomEvent<{ token?: string }>).detail?.token
      if (!token) return
      setState((s) => ({
        ...s,
        token,
        modules: extractModulesFromToken(token),
        permissions: extractPermissionsFromToken(token),
        tenantStatus: extractStatusFromToken(token),
        isImpersonated: extractImpersonatedFromToken(token),
        isAuthenticated: true,
        isLoading: false,
      }))
    }
    window.addEventListener(SESSION_REFRESHED_EVENT, onSessionRefreshed)
    return () => window.removeEventListener(SESSION_REFRESHED_EVENT, onSessionRefreshed)
  }, [])

  const login = async (payload: LoginPayload) => {
    const data = await authService.login(payload)

    const modules = data.modules ?? extractModulesFromToken(data.token)
    const permissions = data.permissions ?? extractPermissionsFromToken(data.token)
    const tenantStatus = extractStatusFromToken(data.token)
    const isImpersonated = extractImpersonatedFromToken(data.token)

    localStorage.setItem('token', data.token)
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    if (data.active_branch) {
      localStorage.setItem('active_branch', JSON.stringify(data.active_branch))
    }
    localStorage.setItem('can_switch_branch', data.can_switch_branch ? 'true' : 'false')
    if (data.allowed_branches?.length) {
      localStorage.setItem('allowed_branches', JSON.stringify(data.allowed_branches))
    } else {
      localStorage.removeItem('allowed_branches')
    }
    // Reloj de inactividad fresco: un login nuevo no debe heredar el conteo de una sesión
    // anterior que haya dejado la llave sin limpiar.
    markIdleActivity()

    setState({
      user: data.user,
      token: data.token,
      modules,
      permissions,
      tenantStatus,
      isImpersonated,
      isAuthenticated: true,
      isLoading: false,
    })

    toast.success(`Bienvenido, ${data.user.name}`)
  }

  const logout = () => {
    authService.logout()
    // Registro único de cachés (identidad de sucursal, unidades, claves de idempotencia, logo, tipo de
    // cambio...) + aborta lo que siga en vuelo. Imprescindible en Tauri/Capacitor, donde no hay recarga.
    clearAllCaches()
    advanceEpoch()
    clearCompanyCaches()
    localStorage.removeItem('active_branch')
    localStorage.removeItem('can_switch_branch')
    localStorage.removeItem('allowed_branches')
    clearIdleActivity()
    setState({ user: null, token: null, modules: [], permissions: [], tenantStatus: '', isImpersonated: false, isAuthenticated: false, isLoading: false })
    toast.info('Sesión cerrada')
    if (isNativeShell()) {
      window.location.hash = '#/login'
    } else {
      window.location.href = '/login'
    }
  }

  const updateSessionUser = (user: AuthUser) => {
    localStorage.setItem('user', JSON.stringify(user))
    setState((s) => ({ ...s, user }))
  }

  const hasModule = (key: string): boolean => state.modules.includes(key)
  const hasPermission = (permission: string): boolean => hasTenantPermission(state.permissions, permission)

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
