import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import type { InventoryDocumentStatus } from '@/services/inventory.service'

interface Branch {
  id: number
  name: string
}

interface Props {
  basePath: string
  title: string
  subtitle: string
  canCreate: boolean
  branches: Branch[]
  branchFilter: number | ''
  onBranchFilterChange: (id: number | '') => void
  statusFilter: InventoryDocumentStatus | ''
  onStatusFilterChange: (status: InventoryDocumentStatus | '') => void
  searchQ: string
  onSearchChange: (q: string) => void
}

const STATUS_OPTIONS: { value: InventoryDocumentStatus | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'voided', label: 'Anulado' },
]

export function InventoryDocumentToolbar({
  basePath,
  title,
  subtitle,
  canCreate,
  branches,
  branchFilter,
  onBranchFilterChange,
  statusFilter,
  onStatusFilterChange,
  searchQ,
  onSearchChange,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        {canCreate && (
          <Link
            to={`${basePath}/new`}
            className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> Nuevo
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar por número o referencia..."
            value={searchQ}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={branchFilter}
            onChange={e => onBranchFilterChange(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value as InventoryDocumentStatus | '')}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

export function documentStatusLabel(status: InventoryDocumentStatus): string {
  switch (status) {
    case 'draft':
      return 'Borrador'
    case 'confirmed':
      return 'Confirmado'
    case 'voided':
      return 'Anulado'
    default:
      return status
  }
}

export function documentStatusClass(status: InventoryDocumentStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-amber-100 text-amber-800'
    case 'confirmed':
      return 'bg-green-100 text-green-700'
    case 'voided':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}
