import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Monitor, Smartphone } from 'lucide-react'
import {
  getPrinterPlatformCapabilities,
  isNativePrintAvailable,
  listInstalledPrinters,
  loadStoredPrinterSettings,
  normalizeSlot,
  saveStoredPrinterSettings,
  testPrint,
  type PrinterConfig,
  type StoredPrinterSettings,
} from '@/services/printers.service'
import { isCapacitorAndroid, isTauriDesktop } from '@/lib/platform/detect'
import { PrinterKindCard } from './printers/PrinterKindCard'
import { NotaVentaPrintSettings } from './printers/NotaVentaPrintSettings'
import { LogoPrintSizeSettings } from './printers/LogoPrintSizeSettings'

/** Configuración de impresora térmica para comprobantes POS (solo slot documentos). */
export function PosPrintersSettings() {
  const [printers, setPrinters] = useState<string[]>([])
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [settings, setSettings] = useState<StoredPrinterSettings>(() => loadStoredPrinterSettings())
  const [testing, setTesting] = useState(false)

  const caps = getPrinterPlatformCapabilities()

  const printerOptions = useMemo(() => {
    const opts = printers.map((p) => ({ value: p, label: p }))
    return [{ value: '', label: 'Sin asignar' }, ...opts]
  }, [printers])

  const paperOptions = useMemo(
    () => [
      { value: 80, label: '80 mm' },
      { value: 58, label: '58 mm' },
    ],
    [],
  )

  const refreshPrinters = () => {
    if (!isTauriDesktop()) return
    setLoadingPrinters(true)
    listInstalledPrinters()
      .then((list) => setPrinters(list))
      .catch(() => {
        setPrinters([])
        toast.error('No se pudo cargar la lista de impresoras')
      })
      .finally(() => setLoadingPrinters(false))
  }

  useEffect(() => {
    if (isTauriDesktop()) refreshPrinters()
  }, [])

  useEffect(() => {
    saveStoredPrinterSettings(settings)
  }, [settings])

  const patchDocumentos = (patch: Partial<PrinterConfig>) => {
    setSettings((prev) => ({
      ...prev,
      documentos: normalizeSlot({ ...prev.documentos, ...patch }),
    }))
  }

  const onTest = async () => {
    const cfg = settings.documentos
    setTesting(true)
    try {
      const msg = await testPrint({
        kind: 'documentos',
        connection: cfg.connection,
        printerName: cfg.printerName,
        tcpHost: cfg.tcpHost,
        tcpPort: cfg.tcpPort,
        paperWidthMm: cfg.paperWidthMm,
        bluetoothMac: cfg.bluetoothMac,
        bluetoothName: cfg.bluetoothName,
      })
      toast.success(msg || 'Prueba enviada')
    } catch (e) {
      console.error('[printer test documentos]', e)
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir la prueba')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-stone-600">
        {isTauriDesktop() && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1">
            <Monitor size={14} /> Windows
          </span>
        )}
        {isCapacitorAndroid() && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1">
            <Smartphone size={14} /> Android
          </span>
        )}
        {!isNativePrintAvailable() && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
            En navegador web solo PDF; use la app de escritorio o Android para impresión directa.
          </span>
        )}
      </div>

      {!isNativePrintAvailable() && (
        <p className="text-xs text-stone-500 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          Capacidades: USB Windows={caps.windowsUsb ? 'sí' : 'no'}, red={caps.network ? 'sí' : 'no'}, Bluetooth=
          {caps.bluetooth ? 'sí' : 'no'}.
        </p>
      )}

      <PrinterKindCard
        kind="documentos"
        cfg={settings.documentos}
        printerOptions={printerOptions}
        paperOptions={paperOptions}
        loadingPrinters={loadingPrinters}
        onRefreshPrinters={refreshPrinters}
        onChange={patchDocumentos}
        onTest={onTest}
        testing={testing}
      />

      <LogoPrintSizeSettings />
      <NotaVentaPrintSettings />
    </div>
  )
}
