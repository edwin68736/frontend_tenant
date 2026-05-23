import { useEffect, useState } from 'react'
import { Building2, Check } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'
import { companyService } from '@/services/company.service'

type Props = {
  onClose?: () => void
}

/** Selector de sucursal dentro del menú de usuario del header */
export function BranchSwitcherUserMenu({ onClose }: Props) {
  const { activeBranch, canSwitchBranch, switchBranch } = useBranch()
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    if (canSwitchBranch) {
      companyService.listBranches().then((b) => setBranches(b ?? [])).catch(() => setBranches([]))
    }
  }, [canSwitchBranch])

  if (!activeBranch) return null

  const handleSwitch = (branchId: number) => {
    onClose?.()
    if (branchId !== activeBranch.id) void switchBranch(branchId)
  }

  return (
    <div className="border-b border-gray-100 pb-1.5 mb-1.5">
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Sucursal
      </div>
      {canSwitchBranch && branches.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto">
          {branches.map((b) => {
            const isActive = b.id === activeBranch.id
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={`flex items-center gap-2 w-[calc(100%-0.75rem)] mx-1.5 px-3 py-2 text-sm rounded-xl text-left transition-colors ${
                    isActive
                      ? 'font-semibold text-primary-800 bg-primary-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => handleSwitch(b.id)}
                >
                  <Building2 size={16} className={isActive ? 'text-primary-600' : 'text-gray-400'} />
                  <span className="flex-1 truncate">{b.name}</span>
                  {isActive && <Check size={16} className="text-primary-600 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2 mx-1.5 px-3 py-2 text-sm text-gray-700">
          <Building2 size={16} className="text-primary-600 shrink-0" />
          <span className="truncate">{activeBranch.name}</span>
        </div>
      )}
    </div>
  )
}
