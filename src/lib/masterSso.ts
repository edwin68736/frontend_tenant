import { decodeJWT, type AuthUser, type JWTPayload } from '@/services/auth.service'
import { isNativeShell } from '@/lib/platform/detect'

export const MASTER_SSO_PARAM = 'master_sso'

/** Lee token de acceso maestro desde la URL (solo ERP web). */
export function readMasterSsoTokenFromUrl(): string | null {
  if (typeof window === 'undefined' || isNativeShell()) return null

  const params = new URLSearchParams(window.location.search)
  const fromMaster = params.get(MASTER_SSO_PARAM)?.trim()
  if (fromMaster) return fromMaster

  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === '/auth/sso') {
    return params.get('token')?.trim() || null
  }
  return null
}

/** Limpia query SSO y deja la URL en la raíz del tenant (igual que el enlace slug). */
export function clearMasterSsoFromUrl(): void {
  window.history.replaceState({}, document.title, '/')
}

export function buildUserFromMasterToken(token: string): AuthUser | null {
  const payload = decodeJWT<JWTPayload>(token)
  if (!payload?.user_id || payload.type !== 'tenant') return null
  return {
    id: payload.user_id,
    name: payload.role_name === 'Administrador' ? 'Administrador' : payload.email,
    email: payload.email,
    role: payload.role_name,
    home_branch_id: payload.active_branch_id,
  }
}

export function persistMasterSsoSession(token: string, user: AuthUser): void {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}
