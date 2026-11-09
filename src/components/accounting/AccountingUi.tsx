import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { AccountingTable } from '@/services/accounting.service'

/** Contenedor común de las pantallas de Contabilidad. */
export function AccountingPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white'
export const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white hover:opacity-90 disabled:opacity-40'
export const btnSecondary =
  'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40'

export function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
      <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--p600))]" />
      {text}
    </div>
  )
}

export function Warnings({ items }: { items?: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-0.5">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={14} /> Advertencias
      </p>
      <ul className="list-disc pl-5">
        {items.slice(0, 20).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
        {items.length > 20 && <li>… y {items.length - 20} más</li>}
      </ul>
    </div>
  )
}

/** Vista previa de una tabla del backend (primeras filas) con su pie de totales. */
export function TablePreview({ table, limit = 25 }: { table: AccountingTable; limit?: number }) {
  const cols = table.columns ?? []
  const rows = table.rows ?? []
  const shown = rows.slice(0, limit)
  const cell = (v: string | number | null) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('es-PE', { maximumFractionDigits: 4 }) : v)
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-xs">
          {!table.no_header && (
            <thead className="bg-gray-50">
              <tr>
                {cols.map((c, i) => (
                  <th key={i} className="text-left px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                {r.map((v, j) => (
                  <td key={j} className="px-2 py-1.5 whitespace-nowrap">
                    {cell(v)}
                  </td>
                ))}
              </tr>
            ))}
            {(table.footer ?? []).map((f, i) => (
              <tr key={`f${i}`} className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                {f.map((v, j) => (
                  <td key={j} className="px-2 py-1.5 whitespace-nowrap">
                    {cell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        {rows.length === 0 ? 'No hay registros en el periodo.' : `Vista previa: ${shown.length} de ${rows.length} fila(s). El Excel trae todas.`}
      </p>
    </div>
  )
}
