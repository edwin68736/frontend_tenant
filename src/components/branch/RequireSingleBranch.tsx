import type { ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'

/**
 * Páginas de registro / POS: en modo "Todas las sucursales" no se muestra el formulario, sino el aviso
 * de que hay que elegir una sucursal para operar (así el usuario no llena nada para enterarse).
 */
export default function RequireSingleBranch({ children }: { children: ReactNode }) {
  const { isAllBranches, activeBranch, allowedBranches, switchBranch, setAllBranchesMode } = useBranch()
  if (!isAllBranches) return <>{children}</>
  const options = allowedBranches.length > 0 ? allowedBranches : activeBranch ? [activeBranch] : []
  return (
    <div
      role="status"
      data-testid="select-branch-to-operate"
      className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center"
    >
      <Building2 className="mx-auto mb-3 h-8 w-8 text-amber-600" aria-hidden />
      <h2 className="text-base font-semibold text-amber-900">Seleccione una sucursal para operar</h2>
      <p className="mt-1 text-sm text-amber-800">
        Está en modo consulta (todas las sucursales). Para registrar o modificar información elija una sucursal.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {options.map((b) => (
          <button
            key={b.id}
            type="button"
            className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            onClick={() => {
              if (b.id === activeBranch?.id) setAllBranchesMode(false, { confirmed: true })
              else void switchBranch(b.id, { confirmed: true })
            }}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  )
}
