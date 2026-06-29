import { Search } from 'lucide-react'
import { BILLING_STATUS_FILTER_OPTIONS } from '@/constants/billingStatus'
import type { FiscalAuxListParams } from '@/services/billing.service'

type Props = {
  filters: FiscalAuxListParams
  onChange: (next: FiscalAuxListParams) => void
  onSearch: () => void
  showBillingStatus?: boolean
  showSerieCorrelativo?: boolean
}

export function FiscalAuxFiltersBar({
  filters,
  onChange,
  onSearch,
  showBillingStatus = true,
  showSerieCorrelativo = true,
}: Props) {
  const set = (patch: Partial<FiscalAuxListParams>) => onChange({ ...filters, ...patch })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2 items-end">
      <label className="flex flex-col gap-0.5 min-w-[140px] flex-1">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">Buscar</span>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filters.q ?? ''}
            onChange={(e) => set({ q: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="Serie, RUC, razón social…"
            className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
      </label>
      {showSerieCorrelativo && (
        <>
          <label className="flex flex-col gap-0.5 w-24">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Serie</span>
            <input
              type="text"
              value={filters.serie ?? ''}
              onChange={(e) => set({ serie: e.target.value.toUpperCase() })}
              className="py-1.5 px-2 text-sm border border-gray-200 rounded-lg font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5 w-28">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Correlativo</span>
            <input
              type="text"
              value={filters.correlativo ?? ''}
              onChange={(e) => set({ correlativo: e.target.value })}
              className="py-1.5 px-2 text-sm border border-gray-200 rounded-lg font-mono"
            />
          </label>
        </>
      )}
      {showBillingStatus && (
        <label className="flex flex-col gap-0.5 min-w-[120px]">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Estado SUNAT</span>
          <select
            value={filters.billing_status ?? ''}
            onChange={(e) => set({ billing_status: e.target.value })}
            className="py-1.5 px-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="">Todos</option>
            {BILLING_STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">Desde</span>
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => set({ from: e.target.value })}
          className="py-1.5 px-2 text-sm border border-gray-200 rounded-lg"
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">Hasta</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => set({ to: e.target.value })}
          className="py-1.5 px-2 text-sm border border-gray-200 rounded-lg"
        />
      </label>
      <button
        type="button"
        onClick={onSearch}
        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[rgb(var(--p600))] text-white hover:opacity-90"
      >
        Filtrar
      </button>
    </div>
  )
}
