// Arqueo de caja (conteo de efectivo por denominación) — compartido entre CashPage.tsx (registrar/
// corregir apertura, arqueo con caja abierta, arqueo del historial) y CashSessionDetailPage.tsx
// (mostrarlo de solo lectura dentro del detalle completo de una sesión).

// Denominaciones para arqueo (PEN): centavos con dos decimales (0.50 … 0.01)
export const ARQUEO_DENOMINATIONS: { value: string; label: string }[] = [
  { value: '200', label: 'S/ 200' },
  { value: '100', label: 'S/ 100' },
  { value: '50', label: 'S/ 50' },
  { value: '20', label: 'S/ 20' },
  { value: '10', label: 'S/ 10' },
  { value: '5', label: 'S/ 5' },
  { value: '2', label: 'S/ 2' },
  { value: '1', label: 'S/ 1' },
  { value: '0.5', label: 'S/ 0.50' },
  { value: '0.2', label: 'S/ 0.20' },
  { value: '0.1', label: 'S/ 0.10' },
  { value: '0.05', label: 'S/ 0.05' },
  { value: '0.01', label: 'S/ 0.01' },
]

export function sumArqueo(arqueo: Record<string, number>): number {
  return ARQUEO_DENOMINATIONS.reduce((s, d) => s + Number(d.value) * (arqueo[d.value] ?? 0), 0)
}

/** Clase de color para la suma del arqueo según el saldo esperado: verde = igual, naranja = mayor, rojo = menor */
export function arqueoSumColorClass(sum: number, expectedBalance: number): string {
  const diff = sum - expectedBalance
  if (Math.abs(diff) < 0.01) return 'text-green-600 font-semibold'
  if (diff > 0) return 'text-orange-600 font-semibold'
  return 'text-red-600 font-semibold'
}

export function emptyArqueo(): Record<string, number> {
  return ARQUEO_DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.value]: 0 }), {} as Record<string, number>)
}

export function parseArqueoJson(json: string | null | undefined): Record<string, number> {
  if (!json) return emptyArqueo()
  try {
    const o = JSON.parse(json) as Record<string, number>
    const out = emptyArqueo()
    ARQUEO_DENOMINATIONS.forEach(d => { out[d.value] = Number(o[d.value]) || 0 })
    return out
  } catch {
    return emptyArqueo()
  }
}

/** Tabla de arqueo: I- EFECTIVO ARQUEADO con columnas Descripción, Cantidad, Denominación (S/), Importe */
export function ArqueoTable({
  arqueo,
  editable,
  onChange,
  totalColorClass,
}: {
  arqueo: Record<string, number>
  editable: boolean
  onChange?: (arqueo: Record<string, number>) => void
  totalColorClass?: string
}) {
  const total = sumArqueo(arqueo)
  const cellClass = 'px-2 py-1.5 text-sm border-b border-gray-100'
  const headerClass = 'px-2 py-2 text-xs font-semibold text-gray-700 uppercase bg-amber-50/80 border-b border-amber-100'

  const renderRow = (d: { value: string; label: string }) => {
    const qty = arqueo[d.value] ?? 0
    const denom = Number(d.value)
    const importe = qty * denom
    const denomDisplay = denom < 1 ? denom.toFixed(2) : d.value
    return (
      <tr key={d.value}>
        <td className={`${cellClass} text-gray-600`}>{d.label}</td>
        <td className={cellClass}>
          {editable && onChange ? (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-sm text-right"
              value={qty === 0 ? '' : qty}
              placeholder="0"
              onChange={e => onChange({ ...arqueo, [d.value]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          ) : (
            <span className="text-right block">{qty}</span>
          )}
        </td>
        <td className={`${cellClass} text-gray-600`}>{denomDisplay}</td>
        <td className={`${cellClass} text-right font-medium`}>{importe.toFixed(2)}</td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <p className="text-sm font-semibold text-gray-800 mb-2 text-center">I- EFECTIVO ARQUEADO</p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={`${headerClass} text-left`}>Descripción</th>
            <th className={`${headerClass} text-right w-24`}>Cantidad</th>
            <th className={`${headerClass} text-left`}>Denominación (S/)</th>
            <th className={`${headerClass} text-right`}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {ARQUEO_DENOMINATIONS.map(renderRow)}
          <tr>
            <td colSpan={3} className="px-2 py-2 font-semibold border-t border-gray-200 bg-amber-50/80 text-gray-800">TOTAL EFECTIVO</td>
            <td className={`px-2 py-2 text-right border-t border-gray-200 bg-amber-50/80 font-semibold ${totalColorClass ?? 'text-gray-800'}`}>{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
