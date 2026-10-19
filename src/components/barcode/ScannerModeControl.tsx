import { clsx } from 'clsx'
import { Camera, Keyboard, ScanBarcode } from 'lucide-react'
import type { ScannerMode } from '@/lib/scanner/scannerMode'

type Props = {
  /** El escáner está activo en esta pantalla. */
  active: boolean
  /** Modo efectivo en este equipo. */
  mode: ScannerMode
  /** Hay cámara de escaneo disponible (app Capacitor). Sin ella solo existe el lector. */
  canUseCamera: boolean
  onSelect: (mode: ScannerMode) => void
  disabled?: boolean
  /** `icon`: botones cuadrados (POS, formulario); `labeled`: con texto (registro de venta). */
  variant?: 'icon' | 'labeled'
  /** Teclado en pantalla a pedido (modo lector, campo con inputMode="none"). */
  softKeyboard?: boolean
  onToggleSoftKeyboard?: () => void
}

/** Un solo control cámara ⇄ lector físico, que reemplaza al par de botones sueltos. */
export function ScannerModeControl({
  active,
  mode,
  canUseCamera,
  onSelect,
  disabled,
  variant = 'icon',
  softKeyboard = false,
  onToggleSoftKeyboard,
}: Props) {
  const labeled = variant === 'labeled'
  const btn = (on: boolean, extra?: string) =>
    clsx(
      'inline-flex items-center justify-center gap-1.5 border transition-colors touch-manipulation disabled:opacity-60',
      labeled ? 'px-3 py-2 text-sm font-medium' : 'p-2',
      on
        ? 'border-primary-300 bg-primary-50 text-primary-700'
        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100',
      extra,
    )

  if (!canUseCamera) {
    return (
      <div className="inline-flex shrink-0 items-center gap-1.5" data-testid="scanner-mode-control">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('reader')}
          className={btn(active, 'rounded-xl')}
          title={active ? 'Modo escáner activo: Enter agrega el código' : 'Activar escáner de código de barras'}
          aria-label="Escáner de código de barras"
          aria-pressed={active}
        >
          <ScanBarcode size={18} aria-hidden />
          {labeled && (active ? 'Escáner activo' : 'Escanear')}
        </button>
      </div>
    )
  }

  const cameraOn = active && mode === 'camera'
  const readerOn = active && mode === 'reader'
  return (
    <div className="inline-flex shrink-0 items-center gap-1.5" data-testid="scanner-mode-control">
      <div role="group" aria-label="Modo de escaneo" className="inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('camera')}
          className={btn(cameraOn, 'rounded-l-xl')}
          title="Escanear con la cámara"
          aria-label="Escanear con la cámara"
          aria-pressed={cameraOn}
        >
          <Camera size={18} aria-hidden />
          {labeled && 'Cámara'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('reader')}
          className={btn(readerOn, 'rounded-r-xl border-l-0')}
          title="Usar lector físico (pistola USB/Bluetooth) en vez de la cámara"
          aria-label="Usar lector físico de código de barras"
          aria-pressed={readerOn}
        >
          <Keyboard size={18} aria-hidden />
          {labeled && 'Lector'}
        </button>
      </div>
      {readerOn && onToggleSoftKeyboard && (
        <button
          type="button"
          onClick={onToggleSoftKeyboard}
          className={btn(softKeyboard, 'rounded-xl')}
          title={softKeyboard ? 'Ocultar teclado en pantalla' : 'Teclear el código a mano (mostrar teclado)'}
          aria-label="Alternar teclado en pantalla"
          aria-pressed={softKeyboard}
        >
          <span className="text-xs font-semibold leading-none">Aa</span>
        </button>
      )}
    </div>
  )
}
