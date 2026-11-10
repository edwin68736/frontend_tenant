import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// El módulo guarda estado (guard de redirección, refresh en vuelo): cada test usa una instancia nueva.
type ApiMod = typeof import('@/services/api')
type EpochMod = typeof import('@/lib/branchScope/requestEpoch')
let M: ApiMod
let E: EpochMod

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown }
let handler: Handler
let calls: InternalAxiosRequestConfig[] = []

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: '', headers: {}, config, request: {} } as AxiosResponse
  if (status >= 200 && status < 300) return Promise.resolve(response)
  return Promise.reject(new AxiosError('fail', 'ERR_BAD_REQUEST', config, {}, response))
}

const callsTo = (path: string) => calls.filter((c) => String(c.url).includes(path))
const settle = (p: Promise<unknown>) =>
  Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), 60)),
  ])

beforeEach(async () => {
  vi.resetModules()
  M = await import('@/services/api')
  E = await import('@/lib/branchScope/requestEpoch')
  E.__resetEpochState()
  localStorage.clear()
  localStorage.setItem('token', 'tok-old')
  localStorage.setItem('refresh_token', 'refresh-1')
  calls = []
  M.__setBaseAdapterForTests(async (config) => {
    calls.push(config)
    const r = handler(config)
    return respond(config, r.status, r.data ?? {})
  })
})

afterEach(() => {
  M.__setBaseAdapterForTests(null)
})

/** Servidor simulado: el endpoint de datos responde 409 con el token viejo y 200 con el nuevo. */
function revokedUntilRefreshed(newToken = 'tok-new', refreshStatus = 200): Handler {
  return (config) => {
    const url = String(config.url)
    if (url.includes('/api/session/refresh')) {
      return refreshStatus === 200 ? { status: 200, data: { token: newToken } } : { status: refreshStatus, data: { code: 'REFRESH_INVALID' } }
    }
    const auth = String((config.headers as Record<string, unknown>).Authorization ?? '')
    if (auth === `Bearer ${newToken}`) return { status: 200, data: { ok: true } }
    return { status: 409, data: { code: 'SESSION_UPDATED' } }
  }
}

describe('409 SESSION_UPDATED: refresh + un reintento', () => {
  it('lectura: refresca el token, reintenta UNA vez con el token nuevo y resuelve', async () => {
    handler = revokedUntilRefreshed()
    const onRefreshed = vi.fn()
    const onStale = vi.fn()
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_REFRESHED_EVENT, onRefreshed)
    window.addEventListener(M.SESSION_CONTEXT_STALE_EVENT, onStale)
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)

    const res = await M.default.get('/api/inventory/stock')

    expect(res.data).toEqual({ ok: true })
    expect(callsTo('/api/inventory/stock')).toHaveLength(2)
    expect(callsTo('/api/session/refresh')).toHaveLength(1)
    expect((callsTo('/api/inventory/stock')[1].headers as Record<string, unknown>).Authorization).toBe('Bearer tok-new')
    expect(localStorage.getItem('token')).toBe('tok-new')
    expect(onRefreshed).toHaveBeenCalledTimes(1) // AuthContext actualiza token/permisos
    expect((onRefreshed.mock.calls[0][0] as CustomEvent).detail.token).toBe('tok-new')
    expect(onStale).toHaveBeenCalledTimes(1) // BranchContext relee el contexto de sucursal
    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener(M.SESSION_REFRESHED_EVENT, onRefreshed)
    window.removeEventListener(M.SESSION_CONTEXT_STALE_EVENT, onStale)
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('escritura: se reintenta una vez con el MISMO body (idempotency_key incluida): no duplica el cobro', async () => {
    handler = revokedUntilRefreshed()
    const body = { total: 10, idempotency_key: 'key-abc' }
    const res = await M.default.post('/api/sales', body)
    expect(res.data).toEqual({ ok: true })
    const sales = callsTo('/api/sales')
    expect(sales).toHaveLength(2)
    expect(sales[0].data).toBe(sales[1].data)
    expect(String(sales[1].data)).toContain('key-abc')
  })

  it('refresh fallido: cierra sesión (evento + token borrado) y rechaza', async () => {
    handler = revokedUntilRefreshed('tok-new', 401)
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
    await expect(M.default.get('/api/inventory/stock')).rejects.toBeTruthy()
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
    expect(callsTo('/api/inventory/stock')).toHaveLength(1) // sin reintento
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('sin refresh_token: cierra sesión sin intentar refrescar', async () => {
    localStorage.removeItem('refresh_token')
    handler = revokedUntilRefreshed()
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
    await expect(M.default.get('/api/inventory/stock')).rejects.toBeTruthy()
    expect(callsTo('/api/session/refresh')).toHaveLength(0)
    expect(onExpired).toHaveBeenCalledTimes(1)
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('sin bucle: si tras refrescar el servidor SIGUE dando 409, cierra sesión (1 refresh, 2 intentos en total)', async () => {
    handler = (config) =>
      String(config.url).includes('/api/session/refresh')
        ? { status: 200, data: { token: 'tok-new' } }
        : { status: 409, data: { code: 'SESSION_UPDATED' } }
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
    await expect(M.default.get('/api/inventory/stock')).rejects.toBeTruthy()
    expect(callsTo('/api/inventory/stock')).toHaveLength(2)
    expect(callsTo('/api/session/refresh')).toHaveLength(1)
    expect(onExpired).toHaveBeenCalledTimes(1)
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('varias peticiones con 409 a la vez comparten UN solo refresh y todas se reintentan', async () => {
    handler = revokedUntilRefreshed()
    const results = await Promise.all([
      M.default.get('/api/a'),
      M.default.get('/api/b'),
      M.default.post('/api/c', { x: 1 }),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    expect(callsTo('/api/session/refresh')).toHaveLength(1)
  })

  it('refreshAccessToken() exportado comparte el refresh en vuelo (lo usa también el SSE)', async () => {
    handler = revokedUntilRefreshed()
    const [a, b] = await Promise.all([M.refreshAccessToken(), M.refreshAccessToken()])
    expect(a).toBe('tok-new')
    expect(b).toBe('tok-new')
    expect(callsTo('/api/session/refresh')).toHaveLength(1)
  })

  it('el cambio de sucursal propio (ventana de gracia) NO refresca ni cierra sesión: conserva el comportamiento de la Fase 4', async () => {
    handler = revokedUntilRefreshed()
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
    E.setBranchSwitching(true)
    const p = M.default.get('/api/inventory/stock')
    expect(await settle(p)).toBe('pending') // lectura descartada en silencio
    expect(callsTo('/api/session/refresh')).toHaveLength(0)
    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('escritura cuya sucursal cambia tras el refresh: NO se reenvía (y no cierra sesión)', async () => {
    const oldTok = jwt({ active_branch_id: 1 })
    const newTok = jwt({ active_branch_id: 2 })
    localStorage.setItem('token', oldTok)
    handler = revokedUntilRefreshed(newTok)
    const onExpired = vi.fn()
    window.addEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
    await expect(M.default.post('/api/sales', { total: 1 })).rejects.toBeTruthy()
    expect(callsTo('/api/sales')).toHaveLength(1)
    expect(onExpired).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe(newTok)
    window.removeEventListener(M.SESSION_EXPIRED_EVENT, onExpired)
  })

  it('lectura con la misma sucursal tras el refresh sí se reintenta', async () => {
    const oldTok = jwt({ active_branch_id: 1 })
    const newTok = jwt({ active_branch_id: 1, iat: 2 })
    localStorage.setItem('token', oldTok)
    handler = revokedUntilRefreshed(newTok)
    const res = await M.default.get('/api/inventory/stock')
    expect(res.status).toBe(200)
  })
})
