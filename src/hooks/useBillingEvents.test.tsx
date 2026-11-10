import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const auth = { token: 't1' as string | null }
const branch = { activeBranchId: 1, resetEpoch: 0 }
const refreshAccessToken = vi.fn<() => Promise<string | null>>()

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/contexts/BranchContext', () => ({ useBranch: () => branch }))
vi.mock('@/services/api', () => ({
  BRANCH_INVALID_EVENT: 'tukifac:branch-invalid',
  SESSION_CONTEXT_STALE_EVENT: 'tukifac:session-context-stale',
  refreshAccessToken: () => refreshAccessToken(),
}))

import { useBillingEvents } from './useBillingEvents'

const enc = new TextEncoder()
const tick = (ms = 5) => new Promise<void>((r) => setTimeout(r, ms))
async function waitFor(cond: () => boolean, ms = 1000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: timeout')
    await tick(2)
  }
}

type Conn = { url: string; headers: Record<string, string>; signal: AbortSignal; push: (s: string) => void; end: () => void }
let conns: Conn[] = []
let nextStatus: Array<{ status: number; body?: unknown }> = []

function installFetch() {
  conns = []
  nextStatus = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init!.signal as AbortSignal
      const forced = nextStatus.shift()
      conns.push({ url: String(url), headers: init!.headers as Record<string, string>, signal, push: () => {}, end: () => {} })
      if (forced) return new Response(JSON.stringify(forced.body ?? {}), { status: forced.status })
      let ctrl!: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c
        },
      })
      signal.addEventListener('abort', () => {
        try {
          ctrl.error(new DOMException('aborted', 'AbortError'))
        } catch {
          /* cerrado */
        }
      })
      conns[conns.length - 1].push = (s) => ctrl.enqueue(enc.encode(s))
      conns[conns.length - 1].end = () => ctrl.close()
      return new Response(stream, { status: 200 })
    }),
  )
}

beforeEach(() => {
  auth.token = 't1'
  branch.activeBranchId = 1
  branch.resetEpoch = 0
  localStorage.clear()
  localStorage.setItem('token', 't1')
  refreshAccessToken.mockReset()
  installFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBillingEvents (fetch-stream)', () => {
  it('abre el stream con cabecera Authorization y sin token/tenant_slug en la URL', async () => {
    const { unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    expect(conns[0].url).toMatch(/\/api\/billing\/events$/)
    expect(conns[0].url).not.toMatch(/access_token|tenant_slug|token=|\?/)
    expect(conns[0].headers.Authorization).toBe('Bearer t1')
    expect(conns[0].headers.Accept).toBe('text/event-stream')
    unmount()
  })

  it('entrega billing.status.updated al callback más reciente y descarta otros eventos', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ cb }) => useBillingEvents(cb), { initialProps: { cb: first } })
    await waitFor(() => conns.length === 1)
    rerender({ cb: second })
    expect(conns).toHaveLength(1) // cambiar el callback no reabre
    conns[0].push('event: other\ndata: {"sale_id":1}\n\n')
    conns[0].push(': keepalive\n\nevent: billing.status.updated\ndata: {"sale_id":9,"status":"accepted"}\n\n')
    await waitFor(() => second.mock.calls.length === 1)
    expect(second.mock.calls[0][0]).toMatchObject({ sale_id: 9 })
    expect(first).not.toHaveBeenCalled()
    unmount()
  })

  it('no abre nada si está deshabilitado o no hay token', async () => {
    renderHook(() => useBillingEvents(() => {}, false))
    auth.token = null
    renderHook(() => useBillingEvents(() => {}, true))
    await tick(20)
    expect(conns).toHaveLength(0)
  })

  it('al desmontar aborta la conexión (AbortController) y no reconecta', async () => {
    const { unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    unmount()
    expect(conns[0].signal.aborted).toBe(true)
    await tick(30)
    expect(conns).toHaveLength(1)
  })

  it('reabre (abortando la anterior) al cambiar la sucursal activa', async () => {
    const { rerender, unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    branch.activeBranchId = 2
    rerender()
    await waitFor(() => conns.length === 2)
    expect(conns[0].signal.aborted).toBe(true)
    expect(conns[1].signal.aborted).toBe(false)
    unmount()
  })

  it('reabre al cambiar la época (resetEpoch)', async () => {
    const { rerender, unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    branch.resetEpoch = 1
    rerender()
    await waitFor(() => conns.length === 2)
    expect(conns[0].signal.aborted).toBe(true)
    unmount()
  })

  it('reabre con el token nuevo cuando cambia el token', async () => {
    const { rerender, unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    localStorage.setItem('token', 't2')
    auth.token = 't2'
    rerender()
    await waitFor(() => conns.length === 2)
    expect(conns[0].signal.aborted).toBe(true)
    expect(conns[1].headers.Authorization).toBe('Bearer t2')
    unmount()
  })

  it('cambiar token y sucursal en el mismo render abre UNA sola conexión nueva', async () => {
    const { rerender, unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 1)
    localStorage.setItem('token', 't2')
    auth.token = 't2'
    branch.activeBranchId = 2
    branch.resetEpoch = 1
    rerender()
    await waitFor(() => conns.length === 2)
    await tick(30)
    expect(conns).toHaveLength(2)
    unmount()
  })

  it('401 -> refresh -> reconexión con el token renovado; el cambio de token resultante NO provoca otra reapertura', async () => {
    nextStatus = [{ status: 401 }]
    refreshAccessToken.mockImplementation(async () => {
      localStorage.setItem('token', 't2')
      return 't2'
    })
    const { rerender, unmount } = renderHook(() => useBillingEvents(() => {}))
    await waitFor(() => conns.length === 2)
    expect(conns[0].headers.Authorization).toBe('Bearer t1')
    expect(conns[1].headers.Authorization).toBe('Bearer t2')
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // AuthContext publica el token renovado: el stream ya lo usa, no debe reabrirse de nuevo.
    auth.token = 't2'
    rerender()
    await tick(30)
    expect(conns).toHaveLength(2)
    expect(conns[1].signal.aborted).toBe(false)
    unmount()
  })

  it('llama onReconnect al reconectar tras un corte del servidor, y no en la primera conexión', async () => {
    const onReconnect = vi.fn()
    const { unmount } = renderHook(() => useBillingEvents(() => {}, true, onReconnect))
    await waitFor(() => conns.length === 1)
    expect(onReconnect).not.toHaveBeenCalled()
    conns[0].end() // el servidor cierra el stream (p. ej. venció el token)
    await waitFor(() => conns.length === 2, 3000)
    await waitFor(() => onReconnect.mock.calls.length === 1)
    unmount()
  })
})
