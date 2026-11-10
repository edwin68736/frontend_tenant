import { useEffect, useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'
import { companyService } from '@/services/company.service'
import { ALL_BRANCHES_ID, BRANCH_SWITCH_CONFIRM_EVENT, type BranchSwitchConfirmDetail } from '@/components/BranchSwitchConfirmHost'

const ALL_VALUE = 'all'

type Props = {
  onClose?: () => void
}

/** Selector de sucursal dentro del menú de usuario del header */
export function BranchSwitcherUserMenu({ onClose }: Props) {
  const { activeBranch, allowedBranches, canSwitchBranch, canViewAll, isAllBranches, setAllBranchesMode, switchBranch, switching } =
    useBranch()
  const [fetchedBranches, setFetchedBranches] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    if (canSwitchBranch && allowedBranches.length === 0) {
      companyService
        .listBranches()
        .then((b) => setFetchedBranches(b ?? []))
        .catch(() => setFetchedBranches([]))
    }
  }, [canSwitchBranch, allowedBranches.length])

  const branches = useMemo(() => {
    if (allowedBranches.length > 0) return allowedBranches
    return fetchedBranches
  }, [allowedBranches, fetchedBranches])

  if (!activeBranch) return null

  const handleSwitch = async (value: string) => {
    if (switching) return
    if (value === ALL_VALUE) {
      if (isAllBranches) return
      const r = setAllBranchesMode(true)
      if (r.status === 'pending') {
        window.dispatchEvent(
          new CustomEvent<BranchSwitchConfirmDetail>(BRANCH_SWITCH_CONFIRM_EVENT, {
            detail: { branchId: ALL_BRANCHES_ID, labels: r.labels },
          }),
        )
      }
      onClose?.()
      return
    }
    const branchId = Number(value)
    if (branchId === activeBranch.id && !isAllBranches) return
    const res = await switchBranch(branchId)
    if (res.status === 'pending') {
      // Hay trabajo sin guardar: el diálogo de confirmación vive en el layout (este menú se cierra al hacer clic fuera).
      window.dispatchEvent(
        new CustomEvent<BranchSwitchConfirmDetail>(BRANCH_SWITCH_CONFIRM_EVENT, {
          detail: { branchId, labels: res.labels },
        }),
      )
    }
    onClose?.()
  }

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 mb-1.5">
      <label htmlFor="header-branch-select" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Sucursal
      </label>
      {(canSwitchBranch || canViewAll) && branches.length > 0 ? (
        <div className="relative">
          <Building2
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            aria-hidden
          />
          <select
            id="header-branch-select"
            className="w-full appearance-none border border-gray-200 rounded-xl pl-8 pr-8 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[rgb(var(--p400))] focus:ring-1 focus:ring-[rgb(var(--p200))] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            value={isAllBranches ? ALL_VALUE : activeBranch.id}
            disabled={switching}
            onChange={(e) => void handleSwitch(e.target.value)}
          >
            {canViewAll ? <option value={ALL_VALUE}>Todas las sucursales</option> : null}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <Building2 size={15} className="text-primary-600 shrink-0" />
          <span className="truncate">{activeBranch.name}</span>
        </div>
      )}
    </div>
  )
}
