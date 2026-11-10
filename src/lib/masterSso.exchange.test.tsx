import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/hooks/useIdleLogout', () => ({ useIdleLogout: () => undefined }))

const post = vi.fn()
vi.mock('@/services/api', () => ({
  default: { post: (...a: unknown[]) => post(...a), get: vi.fn() },
  SESSION_EXPIRED_EVENT: 'session-expired',
  SESSION_REFRESHED_EVENT: 'session-refreshed',
}))

import { toast } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { exchangeMasterCode, hasMasterSsoInUrl, readMasterCodeFromUrl } from '@/lib/masterSso'

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}
const TOKEN = jwt({
  user_id: 9, type: 'tenant', email: 'owner@acme.pe', role_name: 'Administrador', active_branch_id: 1,
  modules: ['sales'], permissions: ['sales.view'], impersonated: true, auth_method: 'master_access', exp: 4102444800,
})

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`)
}

let auth!: ReturnType<typeof useAuth>
function Capture() {
  auth = useAuth()
  return null
}

beforeEach(() => {
  localStorage.clear()
  post.mockReset()
  vi.mocked(toast.error).mockReset()
  setUrl('')
})
afterEach(() => cleanup())

describe('acceso maestro con código de un solo uso', () => {
  it('lee el código de la URL y reconoce también el token heredado', () => {
    setUrl('?master_code=abc')
    expect(readMasterCodeFromUrl()).toBe('abc')
    expect(hasMasterSsoInUrl()).toBe(true)
    setUrl('?master_sso=eyJ.x.y')
    expect(readMasterCodeFromUrl()).toBeNull()
    expect(hasMasterSsoInUrl()).toBe(true)
    setUrl('')
    expect(hasMasterSsoInUrl()).toBe(false)
  })

  it('exchangeMasterCode envía el código por POST (cuerpo) y devuelve el token; ante error devuelve null', async () => {
    post.mockResolvedValueOnce({ data: { token: 'jwt' } })
    expect(await exchangeMasterCode('abc')).toBe('jwt')
    expect(post).toHaveBeenCalledWith('/api/auth/master-exchange', { code: 'abc' }, expect.anything())
    post.mockRejectedValueOnce(new Error('401'))
    expect(await exchangeMasterCode('abc')).toBeNull()
  })

  it('AuthProvider: quita el código de la URL de inmediato, lo canjea y deja la sesión iniciada (impersonada)', async () => {
    setUrl('?master_code=codigo-unico')
    post.mockResolvedValueOnce({ data: { token: TOKEN } })
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    )
    // La URL queda limpia sin esperar al canje: el código nunca permanece en el historial.
    expect(window.location.search).toBe('')
    await waitFor(() => expect(auth.isAuthenticated).toBe(true))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][1]).toEqual({ code: 'codigo-unico' })
    expect(localStorage.getItem('token')).toBe(TOKEN)
    expect(auth.isImpersonated).toBe(true)
  })

  it('AuthProvider: un código inválido o vencido muestra el aviso y no inicia sesión', async () => {
    setUrl('?master_code=vencido')
    post.mockRejectedValueOnce(new Error('401'))
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    )
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isLoading).toBe(false)
    expect(localStorage.getItem('token')).toBeNull()
    await act(async () => {})
  })

  it('el enlace heredado ?master_sso=<jwt> sigue funcionando (puente) y NO llama al canje', async () => {
    setUrl(`?master_sso=${encodeURIComponent(TOKEN)}`)
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    )
    await waitFor(() => expect(auth.isAuthenticated).toBe(true))
    expect(post).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})
