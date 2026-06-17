import { useEffect, useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'
import { companyService } from '@/services/company.service'

type Props = {
  onClose?: () => void
}

/** Selector de sucursal dentro del menú de usuario del header */
export function BranchSwitcherUserMenu({ onClose }: Props) {
  const { activeBranch, allowedBranches, canSwitchBranch, switchBranch } = useBranch()
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

  const handleSwitch = (branchId: number) => {
    if (branchId !== activeBranch.id) void switchBranch(branchId)
    onClose?.()
  }

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 mb-1.5">
      <label htmlFor="header-branch-select" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Sucursal
      </label>
      {canSwitchBranch && branches.length > 0 ? (
        <div className="relative">
          <Building2
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            aria-hidden
          />
          <select
            id="header-branch-select"
            className="w-full appearance-none border border-gray-200 rounded-xl pl-8 pr-8 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[rgb(var(--p400))] focus:ring-1 focus:ring-[rgb(var(--p200))] cursor-pointer"
            value={activeBranch.id}
            onChange={(e) => handleSwitch(Number(e.target.value))}
          >
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
