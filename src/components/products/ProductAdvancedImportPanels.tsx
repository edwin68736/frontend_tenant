import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { AdvancedParseResult, AdvancedTotals } from '@/utils/catalogProductAdvancedImport'

/** Resumen previo a importar (importación avanzada): errores por hoja/fila, o conteo de lo que se hará. */
export function AdvancedSummary({
  adv,
  preview,
  previewing,
  branchName,
}: {
  adv: AdvancedParseResult
  preview: AdvancedTotals | null
  previewing: boolean
  branchName: string
}) {
  if (adv.errors.length > 0) {
    const bySheet = new Map<string, typeof adv.errors>()
    for (const e of adv.errors) bySheet.set(e.sheet, [...(bySheet.get(e.sheet) ?? []), e])
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>
            <strong>{adv.errors.length}</strong> error(es). Corrige el Excel y vuelve a elegirlo.
          </p>
        </div>
        <div className="max-h-56 overflow-y-auto border border-red-100 rounded-xl p-2 space-y-2 text-xs text-red-700">
          {[...bySheet.entries()].map(([sheet, list]) => (
            <div key={sheet}>
              <p className="font-semibold text-red-800">Hoja {sheet}</p>
              <ul className="space-y-0.5">
                {list.slice(0, 40).map((e, i) => (
                  <li key={i}>
                    {e.row > 0 ? `Fila ${e.row}: ` : ''}
                    {e.message}
                  </li>
                ))}
                {list.length > 40 && <li>… y {list.length - 40} más</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (adv.items.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p>No hay productos para importar.</p>
      </div>
    )
  }
  if (previewing || !preview) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--p600))]" />
        Calculando resumen con el servidor (no se guarda nada)…
      </div>
    )
  }
  if (preview.failed.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>
            El servidor detectó <strong>{preview.failed.length}</strong> producto(s) con error. Corrige el Excel y
            vuelve a elegirlo (todavía no se guardó nada).
          </p>
        </div>
        <ul className="text-xs text-red-700 max-h-56 overflow-y-auto border border-red-100 rounded-xl p-2 space-y-1">
          {preview.failed.slice(0, 40).map((f, i) => (
            <li key={i}>
              Producto de la fila {f.row} ({f.name}): {f.error}
            </li>
          ))}
          {preview.failed.length > 40 && <li>… y {preview.failed.length - 40} más</li>}
        </ul>
      </div>
    )
  }
  const deactivated =
    preview.presentations.deactivated + preview.saleUnits.deactivated + preview.branchPrices.deactivated
  const lines: { label: string; rows: number; c: number; u: number; d: number }[] = [
    { label: 'Presentaciones', rows: adv.counts.presentations, ...short(preview.presentations) },
    { label: 'Unidades de venta', rows: adv.counts.saleUnits, ...short(preview.saleUnits) },
    { label: 'Precios por sucursal', rows: adv.counts.branchPrices, ...short(preview.branchPrices) },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold">Resumen antes de importar (sucursal {branchName})</p>
          <p className="mt-0.5">
            Se crean <strong>{preview.created}</strong> producto(s), se modifican <strong>{preview.updated}</strong>
            {deactivated > 0 ? (
              <>
                {' '}
                y se desactivarán <strong>{deactivated}</strong> elemento(s) hijo(s) que ya no aparecen en el Excel.
              </>
            ) : (
              <>; no se desactiva ningún hijo.</>
            )}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['', 'Filas en Excel', 'Se crean', 'Se modifican', 'Se desactivan'].map((h) => (
                <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="px-2 py-1.5 font-medium">Productos</td>
              <td className="px-2 py-1.5">{adv.counts.products}</td>
              <td className="px-2 py-1.5">{preview.created}</td>
              <td className="px-2 py-1.5">{preview.updated}</td>
              <td className="px-2 py-1.5">—</td>
            </tr>
            {lines.map((l) => (
              <tr key={l.label} className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-medium">{l.label}</td>
                <td className="px-2 py-1.5">{l.rows}</td>
                <td className="px-2 py-1.5">{l.c}</td>
                <td className="px-2 py-1.5">{l.u}</td>
                <td className={`px-2 py-1.5 ${l.d > 0 ? 'text-amber-700 font-semibold' : ''}`}>{l.d}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-100">
              <td className="px-2 py-1.5 font-medium">Stock por sucursal</td>
              <td className="px-2 py-1.5">{adv.counts.branchStocks}</td>
              <td className="px-2 py-1.5" colSpan={3}>
                {preview.branchStocksSet} ajuste(s) / entrada(s) de stock
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Lo desactivado no se borra: sigue existiendo para el historial de ventas. Si el resumen no es lo que esperabas,
        cierra sin importar.
      </p>
    </div>
  )
}

function short(t: { created: number; updated: number; deactivated: number }) {
  return { c: t.created, u: t.updated, d: t.deactivated }
}

/** Resultado final de la importación avanzada. */
export function AdvancedDone({ result }: { result: AdvancedTotals }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm">
      <p className="font-medium text-emerald-800">
        {result.created} producto(s) creado(s), {result.updated} actualizado(s)
        {result.failed.length > 0 && `, ${result.failed.length} con error`}.
      </p>
      <p className="text-xs text-emerald-800 mt-1">
        Presentaciones: {result.presentations.created} nuevas / {result.presentations.updated} modificadas /{' '}
        {result.presentations.deactivated} desactivadas · Unidades de venta: {result.saleUnits.created} /{' '}
        {result.saleUnits.updated} / {result.saleUnits.deactivated} · Precios por sucursal: {result.branchPrices.created}{' '}
        / {result.branchPrices.updated} / {result.branchPrices.deactivated} · Stock por sucursal:{' '}
        {result.branchStocksSet}
      </p>
      {result.failed.length > 0 && (
        <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-red-700 space-y-1">
          {result.failed.map((f, i) => (
            <li key={i}>
              Fila {f.row} ({f.name}): {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
