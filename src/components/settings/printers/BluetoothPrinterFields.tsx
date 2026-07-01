import { useCallback, useEffect, useState } from 'react'
import { Bluetooth, Loader2, Radio, ShieldCheck, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { isCapacitorAndroid } from '@/lib/platform/detect'
import type { BluetoothDeviceInfo, PrinterConfig } from '@/services/printers.service'
import {
  checkBluetoothPermissions,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  ensureBluetoothPermissions,
  getBluetoothConnectionStatus,
  listPairedBluetoothPrinters,
  requestBluetoothPermissions,
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
  const [requestingPerm, setRequestingPerm] = useState(false)
  const [btPermission, setBtPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [status, setStatus] = useState<{ connected: boolean; name?: string; address?: string }>({
    connected: false,
  })

  const refreshPermission = useCallback(async () => {
    if (!isCapacitorAndroid()) {
      setBtPermission('denied')
      return
    }
    const ok = await checkBluetoothPermissions()
    setBtPermission(ok ? 'granted' : 'denied')
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getBluetoothConnectionStatus()
      setStatus(s)
    } catch {
      setStatus({ connected: false })
    }
  }, [])

  useEffect(() => {
    void refreshPermission()
    void refreshStatus()
  }, [refreshPermission, refreshStatus, cfg.bluetoothMac])

  useEffect(() => {
    if (!isCapacitorAndroid()) return
    void (async () => {
      try {
        await ensureBluetoothPermissions()
        setBtPermission('granted')
      } catch {
        setBtPermission('denied')
      }
    })()
  }, [])

  const onRequestPermission = async () => {
    setRequestingPerm(true)
    try {
      const ok = await requestBluetoothPermissions()
      setBtPermission(ok ? 'granted' : 'denied')
      if (ok) toast.success('Permiso de Bluetooth concedido')
      else toast.error('Permiso denegado. Actívalo en Ajustes → Aplicaciones → Tukifac → Permisos.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo solicitar el permiso')
      setBtPermission('denied')
    } finally {
      setRequestingPerm(false)
    }
  }

  const loadPaired = async () => {
    try {
      const list = await listPairedBluetoothPrinters()
      setDevices(list)
      setBtPermission('granted')
      if (list.length === 0) toast.message('No hay dispositivos vinculados. Usa «Buscar dispositivos».')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo listar Bluetooth'
      if (msg.toLowerCase().includes('permiso')) setBtPermission('denied')
      toast.error(msg)
    }
  }

  const onScan = async () => {
    setScanning(true)
    try {
      toast.message('Buscando impresoras Bluetooth… (unos 8 segundos)')
      const list = await scanBluetoothPrinters()
      setDevices(list)
      setBtPermission('granted')
      if (list.length === 0) toast.error('No se encontraron dispositivos')
      else toast.success(`${list.length} dispositivo(s) encontrado(s)`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al escanear'
      if (msg.toLowerCase().includes('permiso')) setBtPermission('denied')
      toast.error(msg)
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
      setBtPermission('granted')
      toast.success(`Conectado a ${device.name}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo conectar'
      if (msg.toLowerCase().includes('permiso')) setBtPermission('denied')
      toast.error(msg)
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
  const permissionBlocked = isCapacitorAndroid() && btPermission !== 'granted'

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <Bluetooth size={18} className="text-primary-600" />
          Impresión Bluetooth
        </p>
        <p className="text-xs text-stone-500 mt-0.5">
          Solo Android. Vincula la ticketera en Ajustes del teléfono si no aparece.
        </p>
      </div>

      {permissionBlocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 space-y-2">
          <p className="flex items-start gap-2">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-amber-700" />
            <span>
              Para buscar y conectar la impresora, la app necesita permiso de{' '}
              <strong>Bluetooth cercano</strong> (Android 12+) o ubicación en versiones anteriores.
            </span>
          </p>
          <button
            type="button"
            disabled={requestingPerm}
            onClick={() => void onRequestPermission()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {requestingPerm ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {requestingPerm ? 'Solicitando…' : 'Permitir Bluetooth'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadPaired()}
          disabled={permissionBlocked && btPermission === 'unknown'}
          className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Ver vinculados
        </button>
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={scanning || (permissionBlocked && btPermission === 'unknown')}
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
            isConnectedToSelected
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-900 border border-amber-200',
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
