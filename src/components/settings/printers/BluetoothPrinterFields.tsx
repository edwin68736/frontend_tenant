import { useCallback, useEffect, useState } from 'react'
import { Bluetooth, Loader2, Radio, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import type { BluetoothDeviceInfo, PrinterConfig } from '@/services/printers.service'
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getBluetoothConnectionStatus,
  listPairedBluetoothPrinters,
  scanBluetoothPrinters,
} from '@/services/printers.service'

type Props = {
  cfg: PrinterConfig
  onChange: (patch: Partial<PrinterConfig>) => void
}

export function BluetoothPrinterFields({ cfg, onChange }: Props) {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<{ connected: boolean; name?: string; address?: string }>({
    connected: false,
  })

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getBluetoothConnectionStatus()
      setStatus(s)
    } catch {
      setStatus({ connected: false })
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus, cfg.bluetoothMac])

  const loadPaired = async () => {
    try {
      const list = await listPairedBluetoothPrinters()
      setDevices(list)
      if (list.length === 0) toast.message('No hay dispositivos vinculados. Usa «Buscar dispositivos».')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo listar Bluetooth')
    }
  }

  const onScan = async () => {
    setScanning(true)
    try {
      toast.message('Buscando impresoras Bluetooth… (unos 8 segundos)')
      const list = await scanBluetoothPrinters()
      setDevices(list)
      if (list.length === 0) toast.error('No se encontraron dispositivos')
      else toast.success(`${list.length} dispositivo(s) encontrado(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al escanear')
    } finally {
      setScanning(false)
    }
  }

  const onConnect = async (device: BluetoothDeviceInfo) => {
    setConnecting(true)
    try {
      await connectBluetoothPrinter(device.address)
      onChange({ bluetoothMac: device.address, bluetoothName: device.name })
      await refreshStatus()
      toast.success(`Conectado a ${device.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setConnecting(false)
    }
  }

  const onDisconnect = async () => {
    try {
      await disconnectBluetoothPrinter()
      await refreshStatus()
      toast.message('Desconectado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al desconectar')
    }
  }

  const selectedMac = cfg.bluetoothMac?.trim()
  const isConnectedToSelected = status.connected && status.address === selectedMac

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <Bluetooth size={18} className="text-primary-600" />
          Impresión Bluetooth
        </p>
        <p className="text-xs text-stone-500 mt-0.5">Solo Android. Vincula la ticketera en Ajustes del teléfono si no aparece.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadPaired()}
          className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Ver vinculados
        </button>
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
        >
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
          {scanning ? 'Buscando…' : 'Buscar dispositivos'}
        </button>
        {status.connected && (
          <button
            type="button"
            onClick={() => void onDisconnect()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Unplug size={14} />
            Desconectar
          </button>
        )}
      </div>

      {selectedMac && (
        <div
          className={clsx(
            'rounded-lg px-3 py-2 text-xs',
            isConnectedToSelected ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200',
          )}
        >
          {isConnectedToSelected ? (
            <>
              <span className="font-semibold">Conectado:</span> {status.name || cfg.bluetoothName} · {selectedMac}
            </>
          ) : (
            <>
              <span className="font-semibold">Guardado:</span> {cfg.bluetoothName || 'Impresora'} · {selectedMac}
              {' — '}pulsa el dispositivo abajo para conectar antes de imprimir.
            </>
          )}
        </div>
      )}

      {devices.length > 0 && (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {devices.map((d) => {
            const selected = d.address === selectedMac
            return (
              <li key={d.address}>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void onConnect(d)}
                  className={clsx(
                    'w-full text-left rounded-xl border px-3 py-2.5 transition-colors',
                    selected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-stone-200 bg-white hover:border-primary-300 hover:bg-stone-50',
                  )}
                >
                  <div className="text-sm font-semibold text-stone-900">{d.name || 'Sin nombre'}</div>
                  <div className="text-xs text-stone-500 font-mono">{d.address}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
