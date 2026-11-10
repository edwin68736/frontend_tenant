import { describe, expect, it, vi } from 'vitest'
import { SseParser, backoffDelay, openEventStream, type SseMessage } from './fetchEventStream'

const enc = new TextEncoder()
const tick = (ms = 5) => new Promise<void>((r) => setTimeout(r, ms))

async function waitFor(cond: () => boolean, ms = 1000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: timeout')
    await tick(2)
  }
}

/** Respuesta SSE controlable; el abort del `signal` falla la lectura como haría fetch real. */
function sseResponse(signal?: AbortSignal | null) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c
    },
  })
  signal?.addEventListener('abort', () => {
    try {
      ctrl.error(new DOMException('aborted', 'AbortError'))
    } catch {
      /* ya cerrado */
    }
  })
  return {
    res: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    end: () => ctrl.close(),
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Step = (init: RequestInit) => Response | Promise<Response>

/** fetch simulado: cada llamada consume el siguiente paso; rechaza si el signal ya está abortado. */
function makeFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const step = steps.shift()
    if (!step) return new Promise<Response>(() => {}) // colgado hasta el abort
    return step(init ?? {})
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

const base = {
  url: 'http://api.test/api/billing/events',
  getHeaders: () => ({ Authorization: 'Bearer tok', 'X-Tenant-Slug': 'demo' }),
  baseDelayMs: 1,
  maxDelayMs: 4,
  random: () => 0,
}

describe('SseParser', () => {
  it('entrega un evento completo con event/data', () => {
    const p = new SseParser()
    const out = p.push('event: billing.status.updated\ndata: {"sale_id":1}\n\n')
    expect(out).toEqual([{ event: 'billing.status.updated', data: '{"sale_id":1}', id: undefined }])
  })

  it('une eventos partidos en varios chunks (incluso en medio de una palabra y del separador)', () => {
    const p = new SseParser()
    expect(p.push('event: billing.sta')).toEqual([])
    expect(p.push('tus.updated\nda')).toEqual([])
    expect(p.push('ta: {"sale_id":')).toEqual([])
    expect(p.push('7}\n')).toEqual([]) // aún sin línea en blanco
    const out = p.push('\n')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ event: 'billing.status.updated', data: '{"sale_id":7}' })
  })

  it('maneja CRLF y un \\r\\n partido entre chunks', () => {
    const p = new SseParser()
    expect(p.push('data: a\r')).toEqual([])
    expect(p.push('\n\r')).toEqual([])
    const out = p.push('\ndata: b\r\n\r\n')
    expect(out.map((m) => m.data)).toEqual(['a', 'b'])
  })

  it('ignora comentarios/keepalive y varios eventos en un mismo chunk', () => {
    const p = new SseParser()
    const out = p.push(': keepalive\n\nretry: 3000\n\nevent: a\ndata: 1\n\n: otro\nevent: b\ndata: 2\n\n')
    expect(out.map((m) => [m.event, m.data])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(p.retry).toBe(3000)
  })

  it('data multilínea se une con \\n; sin event el nombre es "message"; id se conserva', () => {
    const p = new SseParser()
    const out = p.push('id: 9\ndata: l1\ndata: l2\n\n')
    expect(out).toEqual([{ event: 'message', data: 'l1\nl2', id: '9' }])
  })

  it('un keepalive entre dos chunks de un evento no lo rompe', () => {
    const p = new SseParser()
    expect(p.push('event: x\n')).toEqual([])
    expect(p.push(': ping\n')).toEqual([])
    expect(p.push('data: ok\n\n')).toHaveLength(1)
  })

  it('un bloque sin data no emite evento', () => {
    const p = new SseParser()
    expect(p.push('event: x\n\n')).toEqual([])
  })
})

describe('backoffDelay', () => {
  it('crece exponencialmente con tope y aplica jitter (50-100 %)', () => {
    expect(backoffDelay(0, 1000, 30000, () => 0)).toBe(500)
    expect(backoffDelay(0, 1000, 30000, () => 1)).toBe(1000)
    expect(backoffDelay(3, 1000, 30000, () => 1)).toBe(8000)
    expect(backoffDelay(10, 1000, 30000, () => 1)).toBe(30000)
  })
})

describe('openEventStream', () => {
  it('conecta con cabeceras (Authorization, X-Tenant-Slug, Accept) y SIN token ni tenant_slug en la URL', async () => {
    const s = sseResponse()
    const { fetchImpl, calls } = makeFetch([() => s.res])
    const got: SseMessage[] = []
    const h = openEventStream({ ...base, fetchImpl, onMessage: (m) => got.push(m), refreshToken: async () => null })
    await waitFor(() => calls.length === 1)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['X-Tenant-Slug']).toBe('demo')
    expect(headers.Accept).toBe('text/event-stream')
    expect(calls[0].url).not.toMatch(/access_token|tenant_slug|\?/)

    s.push(': keepalive\n\nevent: billing.status.updated\nda')
    s.push('ta: {"sale_id":5,"status":"accepted"}\n\n')
    await waitFor(() => got.length === 1)
    expect(got[0].event).toBe('billing.status.updated')
    h.close()
  })

  it('401 -> refreshToken -> reconexión inmediata con el token nuevo (y NO avisa onReconnect)', async () => {
    let token = 'old'
    const s = sseResponse()
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(401, { error: 'expired' }), () => s.res])
    const refresh = vi.fn(async () => {
      token = 'new'
      return 'new'
    })
    const onReconnect = vi.fn()
    const onStop = vi.fn()
    const h = openEventStream({
      ...base,
      getHeaders: () => ({ Authorization: `Bearer ${token}` }),
      fetchImpl,
      onMessage: () => {},
      refreshToken: refresh,
      onReconnect,
      onStop,
    })
    await waitFor(() => calls.length === 2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer old')
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer new')
    expect(onStop).not.toHaveBeenCalled()
    h.close()
  })

  it('401 con refresh fallido: se detiene (sin reintentos)', async () => {
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(401, {}), () => jsonResponse(401, {})])
    const onStop = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null, onStop })
    await waitFor(() => onStop.mock.calls.length === 1)
    await tick(20)
    expect(calls).toHaveLength(1)
    h.close()
  })

  it('401 repetido tras un refresh exitoso: reabre una sola vez y se detiene (sin bucle)', async () => {
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(401, {}), () => jsonResponse(401, {}), () => jsonResponse(401, {})])
    const refresh = vi.fn(async () => 'new')
    const onStop = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: refresh, onStop })
    await waitFor(() => onStop.mock.calls.length === 1)
    await tick(20)
    expect(calls).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    h.close()
  })

  it('403 BRANCH_FORBIDDEN: avisa onContextInvalid y reabre; si se repite sin conectar, se detiene', async () => {
    const s = sseResponse()
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(403, { code: 'BRANCH_FORBIDDEN' }), () => s.res])
    const onContextInvalid = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null, onContextInvalid })
    await waitFor(() => calls.length === 2)
    expect(onContextInvalid).toHaveBeenCalledWith('BRANCH_FORBIDDEN')
    h.close()

    const m = makeFetch([() => jsonResponse(403, { code: 'BRANCH_REQUIRED' }), () => jsonResponse(403, { code: 'BRANCH_REQUIRED' })])
    const onStop = vi.fn()
    const h2 = openEventStream({ ...base, fetchImpl: m.fetchImpl, onMessage: () => {}, refreshToken: async () => null, onStop })
    await waitFor(() => onStop.mock.calls.length === 1)
    expect(m.calls).toHaveLength(2)
    h2.close()
  })

  it('409 SESSION_UPDATED: refresca el token, avisa al contexto y reabre', async () => {
    const s = sseResponse()
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(409, { code: 'SESSION_UPDATED' }), () => s.res])
    const refresh = vi.fn(async () => 'new')
    const onContextInvalid = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: refresh, onContextInvalid })
    await waitFor(() => calls.length === 2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onContextInvalid).toHaveBeenCalledWith('SESSION_UPDATED')
    h.close()
  })

  it('otros 4xx (p. ej. 403 sin código) detienen sin reintentar', async () => {
    const { fetchImpl, calls } = makeFetch([() => jsonResponse(403, { error: 'sin permiso' })])
    const onStop = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null, onStop })
    await waitFor(() => onStop.mock.calls.length === 1)
    await tick(15)
    expect(calls).toHaveLength(1)
    h.close()
  })

  it('5xx y errores de red reintentan con backoff; al reconectar llama onReconnect', async () => {
    const s = sseResponse()
    const { fetchImpl, calls } = makeFetch([
      () => new Response('boom', { status: 503 }),
      () => {
        throw new TypeError('Failed to fetch')
      },
      () => s.res,
    ])
    const onReconnect = vi.fn()
    const onRetry = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null, onReconnect, onRetry })
    await waitFor(() => calls.length === 3)
    await waitFor(() => onReconnect.mock.calls.length === 1)
    expect(onRetry).toHaveBeenCalledTimes(2)
    h.close()
  })

  it('si el servidor cierra el stream, reconecta y avisa onReconnect (no en la primera conexión)', async () => {
    const s1 = sseResponse()
    const s2 = sseResponse()
    const { fetchImpl, calls } = makeFetch([() => s1.res, () => s2.res])
    const onReconnect = vi.fn()
    const onOpen = vi.fn()
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null, onReconnect, onOpen })
    await waitFor(() => onOpen.mock.calls.length === 1)
    expect(onReconnect).not.toHaveBeenCalled()
    s1.end()
    await waitFor(() => calls.length === 2)
    await waitFor(() => onReconnect.mock.calls.length === 1)
    h.close()
  })

  it('close() aborta la conexión en curso (signal abortado) y no reconecta', async () => {
    const holder: { signal?: AbortSignal | null } = {}
    const { fetchImpl, calls } = makeFetch([
      (init) => {
        holder.signal = init.signal
        return sseResponse(init.signal).res
      },
    ])
    const h = openEventStream({ ...base, fetchImpl, onMessage: () => {}, refreshToken: async () => null })
    await waitFor(() => calls.length === 1)
    await tick(5)
    h.close()
    expect(holder.signal?.aborted).toBe(true)
    await tick(20)
    expect(calls).toHaveLength(1)
  })

  it('reconnect() aborta la conexión vigente y abre otra enseguida con las cabeceras actuales', async () => {
    let token = 'a'
    const holder: { signal?: AbortSignal | null } = {}
    const { fetchImpl, calls } = makeFetch([
      (init) => {
        holder.signal = init.signal
        return sseResponse(init.signal).res
      },
      (init) => sseResponse(init.signal).res,
    ])
    const h = openEventStream({
      ...base,
      getHeaders: () => ({ Authorization: `Bearer ${token}` }),
      fetchImpl,
      onMessage: () => {},
      refreshToken: async () => null,
    })
    await waitFor(() => calls.length === 1)
    await tick(5)
    token = 'b'
    h.reconnect()
    await waitFor(() => calls.length === 2)
    expect(holder.signal?.aborted).toBe(true)
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer b')
    h.close()
  })
})
