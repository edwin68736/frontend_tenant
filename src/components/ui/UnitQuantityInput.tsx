import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizeQuantityForUnit, unitAllowsDecimals } from '@/constants/sunatUnits'

/**
 * Input de cantidad cuya divisibilidad depende de la unidad de medida del producto
 * (regla ERP, no fiscal — el XML de SUNAT acepta decimales en cualquier unidad):
 * - Discretas (Unidades, Cajas, Docenas…): solo enteros — flechas ±1, lo tecleado se redondea
 *   y se muestra un aviso flotante para que el usuario sepa por qué cambió su valor.
 * - Medibles (Kilos, Litros, Metros… y ZZ servicio): decimales hasta 3 (decimal(15,3) en BD).
 *
 * UX: al enfocar selecciona todo para reemplazar de una; si el campo queda vacío al salir,
 * restaura el valor anterior (no lo fuerza a 0). Se selecciona todo en vez de vaciar a
 * propósito: vaciar rompería las flechas (subir desde vacío saltaría al mínimo, no a valor+1).
 *
 * Robustez: cada commit (en vivo y al salir) pasa por normalizeQuantityForUnit, y el blur lee
 * el valor directo del DOM (e.target.value), no del estado — el padre nunca puede quedarse con
 * una cantidad sin normalizar (p. ej. totales calculados con 1.5 y campo mostrando 2).
 *
 * El aviso de redondeo se renderiza en un portal (document.body) con posición fija: dentro de
 * tablas con overflow-x-auto (carrito) el badge de la última fila quedaba recortado.
 */
/**
 * Aviso flotante "se redondeó a N" en un portal con posición fija (no lo recortan tablas con
 * overflow). Reutilizable por cualquier input de cantidad (registro de ventas, POS…).
 */
export function useRoundedQuantityBadge() {
  const [rounded, setRounded] = useState<{ to: number; left: number; top: number } | null>(null)
  const hideTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), [])

  const flashRounded = (el: HTMLElement | null, to: number) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    // Debajo del campo; si el campo está pegado al borde inferior, encima.
    const badgeHeight = 26
    const gap = 5
    const top =
      window.innerHeight - r.bottom < badgeHeight + gap * 2
        ? r.top - badgeHeight - gap
        : r.bottom + gap
    setRounded({ to, left: Math.max(8, r.left), top })
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setRounded(null), 2600)
  }

  const badge =
    rounded != null
      ? createPortal(
          <span
            role="status"
            style={{ position: 'fixed', left: rounded.left, top: rounded.top }}
            className="pointer-events-none z-[99999] whitespace-nowrap rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-900 shadow-md"
          >
            Esta unidad no admite decimales: se redondeó a {rounded.to}
          </span>,
          document.body,
        )
      : null

  return { flashRounded, badge }
}

export function UnitQuantityInput({
  value,
  onChange,
  unit,
  className,
  disabled = false,
}: {
  value: number
  onChange: (value: number) => void
  /** Código de unidad SUNAT del producto (NIU, KGM…); decide si se admiten decimales. */
  unit?: string
  className?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const prevRef = useRef(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const { flashRounded, badge } = useRoundedQuantityBadge()
  const allowDecimals = unitAllowsDecimals(unit ?? '')

  /** Normaliza según la unidad, avisa si hubo redondeo (discreta) y entrega al padre. */
  const commit = (raw: number) => {
    const normalized = normalizeQuantityForUnit(raw, unit ?? '')
    if (!allowDecimals && !Number.isInteger(raw)) {
      flashRounded(inputRef.current, normalized)
    }
    onChange(normalized)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="number"
        disabled={disabled}
        min={allowDecimals ? 0.001 : 1}
        step={allowDecimals ? 'any' : 1}
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        className={className ?? 'w-full max-w-[4.5rem] border border-gray-200 rounded-lg px-2 py-1 text-sm'}
        value={draft ?? String(value)}
        onFocus={(e) => {
          prevRef.current = value
          setDraft(String(value))
          e.target.select()
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n > 0) {
            commit(n)
          }
        }}
        onBlur={(e) => {
          // Valor directo del DOM: inmune a estados obsoletos de React.
          const rawText = e.target.value.trim()
          const n = Number(rawText)
          if (rawText === '' || !Number.isFinite(n) || n <= 0) {
            onChange(prevRef.current)
          } else {
            commit(n)
          }
          setDraft(null)
        }}
      />
      {badge}
    </>
  )
}
