import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Search, X } from 'lucide-react'
import { salesService, type Sale } from '@/services/sales.service'
import { formatSaleDocumentNumber } from '@/utils/format'
import { inputCls } from './ui'

/**
 * Buscador de facturas o boletas aceptadas por SUNAT. Al elegir una, el formulario trae su
 * cliente y sus productos (ver DespatchForm.pickSale).
 */
export function SalePicker({
  sunatCode,
  selectedLabel,
  loading,
  onPick,
  onClear,
}: {
  sunatCode: '01' | '03'
  selectedLabel: string
  loading: boolean
  onPick: (s: Sale) => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Sale[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kind = sunatCode === '01' ? 'factura' : 'boleta'

  useEffect(() => {
    if (!open || selectedLabel) return
    setLoaded(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setBusy(true)
      salesService
        .list({ q: q.trim() || undefined, sunat_code: sunatCode, billing_status: 'accepted', sale_status: 'active', per_page: 10, summary: '0' })
        .then(({ data }) => setRows(data ?? []))
        .catch(() => setRows([]))
        .finally(() => {
          setBusy(false)
          setLoaded(true)
        })
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, sunatCode, open, selectedLabel])

  if (selectedLabel) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))] px-3 py-2 text-sm text-[rgb(var(--p800))]">
        <FileText size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {loading ? 'Cargando…' : <>Comprobante <strong className="font-mono">{selectedLabel}</strong></>}
        </span>
        <button type="button" onClick={onClear} className="text-xs inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <X size={13} /> Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        className={`${inputCls} pl-9`}
        value={q}
        placeholder={`Buscar ${kind} por número o cliente`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        aria-label={`Buscar ${kind}`}
      />
      {busy && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
          {loaded && !busy && rows.length === 0 && <li className="px-3 py-3 text-xs text-gray-500">No hay {kind}s aceptadas que coincidan.</li>}
          {rows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3"
                onClick={() => {
                  setOpen(false)
                  setQ('')
                  onPick(s)
                }}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-mono text-gray-900">{formatSaleDocumentNumber(s.series, s.number)}</span>
                  <span className="block text-[11px] text-gray-500 truncate">{s.contact_name || 'Sin cliente'}</span>
                </span>
                <span className="text-xs text-gray-600 shrink-0">
                  {s.currency === 'USD' ? 'US$' : 'S/'} {Number(s.total).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
