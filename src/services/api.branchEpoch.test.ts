import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import api, {
  SESSION_EXPIRED_EVENT,
  BRANCH_INVALID_EVENT,
  __setBaseAdapterForTests,
} from '@/services/api'
import { advanceEpoch, __resetEpochState, mutationsPending, setBranchSwitching } from '@/lib/branchScope/requestEpoch'
import { registerBranchCache, __registeredCacheNames } from '@/lib/branchScope/caches'

type Pending = {
  config: InternalAxiosRequestConfig
  resolve: (data: unknown) => void
  reject: (err: unknown) => void
}

let pending: Pending[] = []
let adapterCalls = 0

/** Adaptador falso: cada petición queda en `pending` hasta que el test la resuelva; respeta `signal` como axios. */
function installAdapter({ honorSignal = true }: { honorSignal?: boolean } = {}) {
  pending = []
  adapterCalls = 0
  __setBaseAdapterForTests((config) => {
    adapterCalls += 1
    return new Promise((resolve, reject) => {
      const entry: Pending = {
        config,
        resolve: (data) =>
          resolve({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} }),
        reject,
      }
      pending.push(entry)
      if (honorSignal) {
        (config.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
          reject(new (axios.CanceledError as unknown as new (m?: string, c?: unknown) => Error)(undefined, config)),
        )
      }
    })
  })
}

function httpError(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return new AxiosError('fail', 'ERR_BAD_REQUEST', config, {}, {
    status,
    data,
    statusText: '',
    headers: {},
    config,
  })
}

/** 'pending' si tras un margen la promesa no se resolvió ni rechazó. */
async function settle(p: Promise<unknown>): Promise<'resolved' | 'rejected' | 'pending'> {
  return Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), 40)),
  ])
}

/** El pipeline de axios es asíncrono (cadena de interceptores): deja que la petición llegue al adaptador. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  __resetEpochState()
  localStorage.clear()
  localStorage.setItem('token', 'tok-old')
  installAdapter()
})

afterEach(() => {
  __setBaseAdapterForTests(null)
})

describe('interceptor de axios: época de sucursal', () => {
  it('aborta las lecturas en vuelo al cambiar de sucursal y NO las muestra como error (la promesa no se rechaza)', async () => {
    const onThen = vi.fn()
    const onCatch = vi.fn()
    api.get('/api/sales').then(onThen, onCatch)
    await tick()
    expect(pending).toHaveLength(1)
    expect(pending[0].config.signal?.aborted).toBe(false)

    advanceEpoch()
    expect(pending[0].config.signal?.aborted).toBe(true)

    await new Promise((r) => setTimeout(r, 40))
    expect(onThen).not.toHaveBeenCalled()
    expect(onCatch).not.toHaveBeenCalled() // ningún toast.error de pantalla ajena
  })

  it('descarta la respuesta de una lectura de otra época aunque el adaptador no respete la señal', async () => {
    installAdapter({ honorSignal: false })
    const p = api.get('/api/products')
    await tick()
    advanceEpoch()
    pending[0].resolve({ rows: ['de la sucursal anterior'] })
    expect(await settle(p)).toBe('pending')
  })

  it('las lecturas de la época nueva funcionan con normalidad', async () => {
    advanceEpoch()
    const p = api.get('/api/products')
    await tick()
    pending[0].resolve({ ok: 1 })
    const res = await p
    expect(res.data).toEqual({ ok: 1 })
  })

  it('las llamadas globales (context/switch-branch/refresh/login) no se abortan por el cambio de época', async () => {
    const p1 = api.get('/api/session/context')
    const p2 = api.post('/api/session/switch-branch', { branch_id: 2 })
    await tick()
    expect(pending[0].config.signal?.aborted ?? false).toBe(false)
    advanceEpoch()
    pending[0].resolve({ ctx: 1 })
    pending[1].resolve({ token: 't' })
    expect((await p1).data).toEqual({ ctx: 1 })
    expect((await p2).data).toEqual({ token: 't' })
  })

  it('una petición marcada __global tampoco se aborta', async () => {
    const p = api.get('/api/company/config', { __global: true } as never)
    await tick()
    advanceEpoch()
    pending[0].resolve({ cfg: 1 })
    expect((await p).data).toEqual({ cfg: 1 })
  })

  it('no reintenta una lectura de la sucursal anterior ante un 503 (no viajaría con el token nuevo)', async () => {
    installAdapter({ honorSignal: false })
    const p = api.get('/api/reports/sales')
    await tick()
    advanceEpoch()
    pending[0].reject(httpError(pending[0].config, 503, {}))
    expect(await settle(p)).toBe('pending')
    expect(adapterCalls).toBe(1)
  })

  it('respeta la señal propia del llamador además de la de la época', async () => {
    const own = new AbortController()
    const onCatch = vi.fn()
    api.get('/api/x', { signal: own.signal }).catch(onCatch)
    await tick()
    own.abort() // cancelación del propio llamador, misma época: sí se propaga como error normal
    await new Promise((r) => setTimeout(r, 20))
    expect(onCatch).toHaveBeenCalledTimes(1)
  })
})

describe('escrituras en vuelo', () => {
  it('un POST no se aborta al cambiar de época y su respuesta SÍ se entrega', async () => {
    const p = api.post('/api/sales', { total: 10 })
    await tick()
    expect(mutationsPending()).toBe(1)
    advanceEpoch()
    expect(pending[0].config.signal).toBeUndefined()
    pending[0].resolve({ id: 99 })
    expect((await p).data).toEqual({ id: 99 })
    expect(mutationsPending()).toBe(0)
  })
})

describe('SESSION_UPDATED provocado por el propio cambio de sucursal', () => {
  it('una lectura en vuelo que recibe 409 durante el cambio NO cierra sesión', async () => {
    installAdapter({ honorSignal: false })
    const onExpired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    setBranchSwitching(true)
    const p = api.get('/api/inventory/stock')
    await tick()
    pending[0].reject(httpError(pending[0].config, 409, { code: 'SESSION_UPDATED' }))
    expect(await settle(p)).toBe('pending')
    expect(onExpired).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('tok-old')
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  })

  it('un 409 de una lectura de la época vieja llegado después del cambio tampoco cierra sesión', async () => {
    installAdapter({ honorSignal: false })
    const onExpired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    const p = api.get('/api/inventory/stock')
    await tick()
    advanceEpoch()
    pending[0].reject(httpError(pending[0].config, 409, { code: 'SESSION_UPDATED' }))
    expect(await settle(p)).toBe('pending')
    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  })

  it('control: un SESSION_UPDATED real (sin cambio de sucursal) SÍ cierra sesión y vacía las cachés', async () => {
    const clear = vi.fn()
    registerBranchCache('test-control', clear)
    const onExpired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    const p = api.get('/api/inventory/stock')
    await tick()
    pending[0].reject(httpError(pending[0].config, 409, { code: 'SESSION_UPDATED' }))
    await settle(p)
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
    expect(clear).toHaveBeenCalled() // redirectToLogin llama a clearAllCaches (Tauri/Capacitor sin recarga)
    expect(__registeredCacheNames().branch).toContain('test-control')
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  })
})

describe('BRANCH_REQUIRED / BRANCH_FORBIDDEN', () => {
  it.each(['BRANCH_REQUIRED', 'BRANCH_FORBIDDEN'])('%s emite el evento para refrescar el contexto y no cierra sesión', async (code) => {
    const onInvalid = vi.fn()
    window.addEventListener(BRANCH_INVALID_EVENT, onInvalid)
    const p = api.get('/api/sales')
    await tick()
    pending[0].reject(httpError(pending[0].config, 403, { code }))
    await settle(p)
    expect(onInvalid).toHaveBeenCalledTimes(1)
    expect((onInvalid.mock.calls[0][0] as CustomEvent).detail.code).toBe(code)
    expect(localStorage.getItem('token')).toBe('tok-old')
    window.removeEventListener(BRANCH_INVALID_EVENT, onInvalid)
  })
})
