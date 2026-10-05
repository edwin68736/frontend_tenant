import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plug, PlugZap, Unplug } from 'lucide-react'
import {
  PRINT_SERVER_CHANGED_EVENT,
  PRINT_SERVER_DEFAULT_PORT,
  forgetPrintServer,
  getPrintServerStatus,
  isPrintServerPaired,
  pairPrintServer,
  type PrintServerStatus,
} from '@/services/printers/printServer'

/** Se vuelve a leer cuando cambia la vinculación (esta u otra pestaña). */
export function usePrintServerPaired(): boolean {
  const [paired, setPaired] = useState(() => isPrintServerPaired())
  useEffect(() => {
    const sync = () => setPaired(isPrintServerPaired())
    window.addEventListener(PRINT_SERVER_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PRINT_SERVER_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return paired
}

/**
 * Conexión con el Servidor de impresión (solo navegador). Con él vinculado, el comprobante se
 * imprime directo en la ticketera con la fuente propia de la impresora (nítido, sin el diálogo de
 * impresión de Chrome); el ancho de papel se elige abajo, en los ajustes de Tukifac.
 */
export function PrintServerCard() {
  const paired = usePrintServerPaired()
  const [status, setStatus] = useState<PrintServerStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await getPrintServerStatus())
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 8_000)
    return () => window.clearInterval(id)
  }, [refresh, paired])

  const connect = async () => {
    setBusy(true)
    try {
      await pairPrintServer(PRINT_SERVER_DEFAULT_PORT)
      toast.success('Servidor de impresión conectado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const disconnect = () => {
    forgetPrintServer()
    toast.success('Servidor de impresión desconectado de este navegador')
    void refresh()
  }

  const reachable = status?.reachable ?? false
  const connected = paired && status?.paired === true

  let badge = { text: 'Comprobando…', cls: 'bg-stone-100 text-stone-600' }
  if (status) {
    if (connected) badge = { text: 'Conectado', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
    else if (paired && !reachable)
      badge = { text: 'Vinculado, pero el programa no responde', cls: 'bg-amber-50 text-amber-800 border border-amber-200' }
    else if (reachable) badge = { text: 'Programa detectado, sin vincular', cls: 'bg-sky-50 text-sky-700 border border-sky-200' }
    else badge = { text: 'No detectado en este equipo', cls: 'bg-stone-100 text-stone-600' }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Servidor de impresión (navegador)</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            Programa para Windows que imprime directo en la ticketera desde el navegador. No hace falta si usas la app
            de escritorio o Android.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {!paired ? (
          <button
            type="button"
            disabled={busy || !reachable}
            onClick={() => void connect()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
            Conectar
          </button>
        ) : (
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Unplug size={14} />
            Desconectar
          </button>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          <Plug size={14} />
          Comprobar
        </button>
      </div>

      {busy ? (
        <p className="text-xs text-amber-700">
          Acepta el aviso que apareció en Windows (puede estar detrás de esta ventana) para autorizar este sitio.
        </p>
      ) : null}
      {status && !reachable && !paired ? (
        <p className="text-xs text-stone-500">
          Instala el «Servidor de impresión Tukifac» en este equipo y déjalo abierto (ícono en la bandeja de Windows);
          luego pulsa Comprobar.
        </p>
      ) : null}
    </div>
  )
}
