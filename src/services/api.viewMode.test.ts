import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import api, { BRANCH_READ_ONLY_EVENT, __setBaseAdapterForTests } from '@/services/api'
import { __resetEpochState } from '@/lib/branchScope/requestEpoch'
import { clearAllCaches } from '@/lib/branchScope/caches'
import { BRANCH_MODE_HEADER, setViewMode, viewModeStorageKey, getViewMode } from '@/lib/branchScope/viewMode'

let calls: InternalAxiosRequestConfig[] = []
let nextStatus = 200
let nextData: unknown = {}

function installAdapter() {
  calls = []
  __setBaseAdapterForTests((config) => {
    calls.push(config)
    if (nextStatus >= 400) {
      return Promise.reject(
        new AxiosError('fail', 'ERR_BAD_REQUEST', config, {}, {
          status: nextStatus,
          statusText: '',
          headers: {},
          config,
          data: nextData,
        }),
      )
    }
    return Promise.resolve({ data: nextData, status: nextStatus, statusText: 'OK', headers: {}, config, request: {} })
  })
}

const headerOf = (c: InternalAxiosRequestConfig) =>
  (c.headers as unknown as { get(n: string): unknown }).get(BRANCH_MODE_HEADER)

beforeEach(() => {
  __resetEpochState()
  localStorage.clear()
  localStorage.setItem('token', 'tok')
  setViewMode('single')
  nextStatus = 200
  nextData = {}
  installAdapter()
})

afterEach(() => {
  __setBaseAdapterForTests(null)
  setViewMode('single')
})

describe('interceptor: cabecera X-Branch-Mode', () => {
  it('NO envía la cabecera en modo sucursal', async () => {
    await api.get('/api/sales')
    expect(calls).toHaveLength(1)
    expect(headerOf(calls[0])).toBeFalsy()
  })

  it('envía X-Branch-Mode: all en GET y HEAD cuando el modo es "todas"', async () => {
    setViewMode('all')
    await api.get('/api/sales')
    await api.head('/api/sales')
    expect(calls).toHaveLength(2)
    expect(headerOf(calls[0])).toBe('all')
    expect(headerOf(calls[1])).toBe('all')
  })

  it('en modo "todas" las escrituras (POST/PUT/PATCH/DELETE) NO salen: se cortan con BRANCH_READ_ONLY y sin cabecera', async () => {
    setViewMode('all')
    const onReadOnly = vi.fn()
    window.addEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
    for (const call of [
      () => api.post('/api/sales', {}),
      () => api.put('/api/sales/1', {}),
      () => api.patch('/api/sales/1', {}),
      () => api.delete('/api/sales/1'),
    ]) {
      await expect(call()).rejects.toMatchObject({
        response: { status: 403, data: { code: 'BRANCH_READ_ONLY' } },
      })
    }
    expect(calls).toHaveLength(0) // nada llegó al servidor
    expect(onReadOnly).toHaveBeenCalledTimes(4)
    window.removeEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
  })

  it('las llamadas globales (login, cambio de sucursal, refresh) no se cortan ni llevan la cabecera', async () => {
    setViewMode('all')
    await api.post('/api/session/switch-branch', { branch_id: 2 })
    await api.post('/api/logout')
    await api.get('/api/session/context')
    expect(calls).toHaveLength(3)
    calls.forEach((c) => expect(headerOf(c)).toBeFalsy())
  })

  it('un 403 BRANCH_READ_ONLY del servidor se propaga y avisa a la UI (toast) sin tratarlo como sesión caída', async () => {
    nextStatus = 403
    nextData = { code: 'BRANCH_READ_ONLY', error: 'solo lectura' }
    const onReadOnly = vi.fn()
    const onExpired = vi.fn()
    window.addEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
    window.addEventListener('tukifac:session-expired', onExpired)
    await expect(api.get('/api/sales')).rejects.toMatchObject({ response: { status: 403 } })
    expect(onReadOnly).toHaveBeenCalledTimes(1)
    expect(onExpired).not.toHaveBeenCalled()
    window.removeEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
    window.removeEventListener('tukifac:session-expired', onExpired)
  })
})

describe('modo de vista persistido', () => {
  it('se guarda por tenant en localStorage y se limpia al cerrar sesión (registro de cachés)', () => {
    setViewMode('all')
    expect(localStorage.getItem(viewModeStorageKey())).toBe('all')
    expect(getViewMode()).toBe('all')
    clearAllCaches()
    expect(getViewMode()).toBe('single')
    expect(localStorage.getItem(viewModeStorageKey())).toBeNull()
  })
})
