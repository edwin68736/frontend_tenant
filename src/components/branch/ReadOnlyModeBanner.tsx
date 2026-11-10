import { Eye } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'

/** Barra visible mientras se consulta "todas las sucursales" (solo lectura). */
export default function ReadOnlyModeBanner() {
  const { isAllBranches, activeBranch, setAllBranchesMode } = useBranch()
  if (!isAllBranches) return null
  return (
    <div className="relative z-10 shrink-0 overflow-hidden rounded-2xl bg-white shadow-md">
      <div
        role="status"
        data-testid="read-only-banner"
        className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 sm:px-4 sm:text-sm"
      >
        <Eye className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
        <p className="font-semibold">Modo consulta: todas las sucursales</p>
        <p className="text-sky-800/90">Solo lectura; para registrar o modificar elija una sucursal.</p>
        {activeBranch ? (
          <button
            type="button"
            className="ml-auto rounded-lg border border-sky-300 bg-white px-2 py-1 font-medium text-sky-900 hover:bg-sky-100"
            onClick={() => setAllBranchesMode(false, { confirmed: true })}
          >
            Volver a {activeBranch.name}
          </button>
        ) : null}
      </div>
    </div>
  )
}
