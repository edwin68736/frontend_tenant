/**
 * Cliente SSE sobre `fetch` + `ReadableStream` (reemplaza a `EventSource`).
 *
 * Motivo: `EventSource` no permite cabeceras, así que el JWT viajaba en la URL (`?access_token=`), con lo que
 * quedaba en logs de proxy/CDN, historial y capturas. Aquí el token va en `Authorization`, como el resto de la API.
 *
 * Contrato:
 *  - Parser SSE propio (`SseParser`): eventos partidos en varios chunks, `\n`/`\r\n`/`\r`, comentarios/keepalive
 *    (`:`), `event:`, `data:` (multilínea), `id:` y `retry:`.
 *  - Reconexión con backoff exponencial con jitter (1 s -> 30 s). Se reinicia al lograr conectar.
 *  - 401: llama `refreshToken()` y reabre UNA vez; si el refresh falla (o vuelve a dar 401), se detiene.
 *  - 403 BRANCH_* / 409 SESSION_UPDATED: llama `onContextInvalid(code)` (refresca token/contexto) y reabre; si el
 *    mismo código se repite sin haber conectado entre medias, se detiene (sin bucle).
 *  - Otros 4xx: se detiene (reintentar no sirve). 5xx / red / fin del stream: backoff y reconexión.
 *  - Sin `Last-Event-ID`: los eventos son notificaciones de cambio, no un log reproducible; al RE-conectar se
 *    llama `onReconnect()` para que el consumidor vuelva a pedir su lista/estado.
 *  - `close()` aborta la conexión (AbortController) y detiene todo; `reconnect()` aborta la conexión actual y
 *    abre otra enseguida (p. ej. porque cambió el token).
 */

export interface SseMessage {
  /** Nombre del evento (`message` si no vino `event:`). */
  event: string
  data: string
  id?: string
}

/** Parser incremental del formato `text/event-stream`. */
export class SseParser {
  private buffer = ''
  private started = false
  private eventName = ''
  private dataLines: string[] = []
  private lastId: string | undefined
  /** Último valor de `retry:` recibido (ms), si vino. */
  retry: number | undefined

  /** Procesa un trozo de texto y devuelve los eventos completos que contiene. */
  push(chunk: string): SseMessage[] {
    let text = this.buffer + chunk
    this.buffer = ''
    if (!this.started && text.length > 0) {
      this.started = true
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // BOM
    }
    const out: SseMessage[] = []
    // Un '\r' al final puede ser la primera mitad de un '\r\n' partido entre chunks: se retiene.
    let hold = ''
    if (text.endsWith('\r')) {
      hold = '\r'
      text = text.slice(0, -1)
    }
    const lines = text.split(/\r\n|\n|\r/)
    // La última "línea" no terminó todavía: se guarda para el siguiente chunk.
    this.buffer = lines.pop()! + hold
    for (const line of lines) this.processLine(line, out)
    return out
  }

  private processLine(line: string, out: SseMessage[]): void {
    if (line === '') {
      if (this.dataLines.length > 0) {
        out.push({ event: this.eventName || 'message', data: this.dataLines.join('\n'), id: this.lastId })
      }
      this.eventName = ''
      this.dataLines = []
      return
    }
    if (line.startsWith(':')) return // comentario / keepalive
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    switch (field) {
      case 'event':
        this.eventName = value
        break
      case 'data':
        this.dataLines.push(value)
        break
      case 'id':
        if (!value.includes('\0')) this.lastId = value
        break
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value)
        break
      default:
        break
    }
  }
}

export interface EventStreamOptions {
  /** URL del stream. NUNCA debe llevar token ni tenant_slug: van en cabeceras. */
  url: string
  /** Cabeceras de la conexión; se evalúa en CADA (re)conexión para tomar el token vigente. */
  getHeaders: () => Record<string, string>
  onMessage: (msg: SseMessage) => void
  /** Renueva el access token (un solo refresh en vuelo, compartido con axios). null si no se pudo. */
  refreshToken: () => Promise<string | null>
  /** 403 BRANCH_* / 409 SESSION_UPDATED: refrescar token/contexto antes de reabrir. */
  onContextInvalid?: (code: string) => void | Promise<void>
  /** Conexión abierta (cada vez). `reconnected` es true si antes ya hubo una conexión o un corte. */
  onOpen?: (info: { reconnected: boolean }) => void
  /** Se reabrió tras un corte: el consumidor debe volver a pedir su lista/estado. */
  onReconnect?: () => void
  /** La conexión se cayó y se reintentará en `delayMs`. */
  onRetry?: (info: { delayMs: number; reason: string }) => void
  /** Se detuvo definitivamente (refresh fallido, error no recuperable, bucle evitado). */
  onStop?: (reason: string) => void
  fetchImpl?: typeof fetch
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

export interface EventStreamHandle {
  close: () => void
  reconnect: () => void
}

const DEFAULT_BASE_MS = 1000
const DEFAULT_MAX_MS = 30000

/** Backoff exponencial con jitter ("equal jitter": entre 50 % y 100 % del tope exponencial). */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt))
  return Math.round(exp / 2 + (exp / 2) * random())
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

async function errorCode(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { code?: unknown }
    return typeof j?.code === 'string' ? j.code : ''
  } catch {
    return ''
  }
}

export function openEventStream(opts: EventStreamOptions): EventStreamHandle {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const baseMs = opts.baseDelayMs ?? DEFAULT_BASE_MS
  const maxMs = opts.maxDelayMs ?? DEFAULT_MAX_MS
  const random = opts.random ?? Math.random

  const master = new AbortController()
  let conn: AbortController | null = null
  let reconnectNow = false

  const run = async () => {
    let attempt = 0
    let everConnected = false
    let needReconnectCb = false
    let serverRetry: number | undefined
    /** Códigos de contexto ya intentados sin haber conectado entre medias (evita bucles). */
    const triedSinceOpen = new Set<string>()

    const stop = (reason: string) => {
      if (!master.signal.aborted) opts.onStop?.(reason)
    }
    const backoff = async (reason: string) => {
      const base = serverRetry ? Math.min(maxMs, Math.max(baseMs, serverRetry)) : baseMs
      const delayMs = backoffDelay(attempt, base, maxMs, random)
      attempt += 1
      needReconnectCb = true
      opts.onRetry?.({ delayMs, reason })
      // La espera se corta si se cierra (master) o si piden reconectar ya (aborta la conexión vigente).
      await sleep(delayMs, (conn ?? master).signal)
    }

    while (!master.signal.aborted) {
      const c = new AbortController()
      conn = c
      const onMasterAbort = () => c.abort()
      master.signal.addEventListener('abort', onMasterAbort, { once: true })
      reconnectNow = false
      try {
        const res = await doFetch(opts.url, {
          method: 'GET',
          headers: { ...opts.getHeaders(), Accept: 'text/event-stream' },
          signal: c.signal,
          cache: 'no-store',
        })

        if (res.status === 401) {
          void res.body?.cancel().catch(() => {})
          if (triedSinceOpen.has('401')) return stop('401 repetido tras refrescar el token')
          triedSinceOpen.add('401')
          const tok = await opts.refreshToken()
          if (!tok) return stop('no se pudo renovar el token')
          continue // reabre ya, con el token nuevo
        }
        if (res.status === 403 || res.status === 409) {
          const code = await errorCode(res)
          const recoverable = code.startsWith('BRANCH_') || code === 'SESSION_UPDATED'
          if (!recoverable) return stop(`HTTP ${res.status}${code ? ' ' + code : ''}`)
          if (triedSinceOpen.has(code)) return stop(`${code} repetido sin conectar`)
          triedSinceOpen.add(code)
          if (code === 'SESSION_UPDATED') {
            const tok = await opts.refreshToken()
            if (!tok) return stop('no se pudo renovar el token')
          }
          await opts.onContextInvalid?.(code)
          needReconnectCb = true
          continue
        }
        if (!res.ok || !res.body) {
          void res.body?.cancel().catch(() => {})
          // 4xx distinto de 408/429: reintentar no sirve.
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            return stop(`HTTP ${res.status}`)
          }
          await backoff(`HTTP ${res.status}`)
          continue
        }

        // Conectado.
        const reconnected = everConnected || needReconnectCb
        everConnected = true
        attempt = 0
        triedSinceOpen.clear()
        opts.onOpen?.({ reconnected })
        if (reconnected) opts.onReconnect?.()
        needReconnectCb = false

        const parser = new SseParser()
        const decoder = new TextDecoder()
        const reader = res.body.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            for (const msg of parser.push(text)) {
              try {
                opts.onMessage(msg)
              } catch {
                /* un consumidor que falla no debe tumbar el stream */
              }
            }
            if (parser.retry !== undefined) serverRetry = parser.retry
          }
        } finally {
          try {
            await reader.cancel()
          } catch {
            /* ignore */
          }
        }
        // El servidor cerró el stream (p. ej. venció el token): se reconecta.
        if (master.signal.aborted) return
        if (reconnectNow) {
          needReconnectCb = true
          continue
        }
        await backoff('stream cerrado')
      } catch (e) {
        if (master.signal.aborted) return
        if (reconnectNow) {
          // reconnect() abortó esta conexión a propósito: reabrir sin demora.
          needReconnectCb = true
          attempt = 0
          triedSinceOpen.clear()
          continue
        }
        await backoff(e instanceof Error ? e.message : 'error de red')
      } finally {
        master.signal.removeEventListener('abort', onMasterAbort)
      }
    }
  }

  void run()

  return {
    close: () => master.abort(),
    reconnect: () => {
      if (master.signal.aborted) return
      reconnectNow = true
      conn?.abort()
    },
  }
}
