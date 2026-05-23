import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { sessionService, type BranchBrief } from '@/services/session.service'
import { useAuth } from '@/contexts/AuthContext'

type BranchContextValue = {
  activeBranch: BranchBrief | null
  activeBranchId: number
  canSwitchBranch: boolean
  resetEpoch: number
  setFromLogin: (branch: BranchBrief | null, canSwitch: boolean) => void
  switchBranch: (branchId: number) => Promise<void>
  refreshContext: () => Promise<void>
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [activeBranch, setActiveBranch] = useState<BranchBrief | null>(() => {
    try {
      const raw = localStorage.getItem('active_branch')
      return raw ? (JSON.parse(raw) as BranchBrief) : null
    } catch {
      return null
    }
  })
  const [canSwitchBranch, setCanSwitchBranch] = useState(
    () => localStorage.getItem('can_switch_branch') === 'true',
  )
  const [resetEpoch, setResetEpoch] = useState(0)

  const persistBranch = useCallback((b: BranchBrief | null, canSwitch: boolean) => {
    if (b) localStorage.setItem('active_branch', JSON.stringify(b))
    else localStorage.removeItem('active_branch')
    localStorage.setItem('can_switch_branch', canSwitch ? 'true' : 'false')
  }, [])

  const setFromLogin = useCallback(
    (branch: BranchBrief | null, canSwitch: boolean) => {
      setActiveBranch(branch)
      setCanSwitchBranch(canSwitch)
      persistBranch(branch, canSwitch)
    },
    [persistBranch],
  )

  const bumpReset = useCallback(() => {
    setResetEpoch((e) => e + 1)
    window.dispatchEvent(new CustomEvent('branch-changed'))
  }, [])

  const refreshContext = useCallback(async () => {
    const ctx = await sessionService.getContext()
    setActiveBranch(ctx.active_branch)
    setCanSwitchBranch(ctx.can_switch_branch)
    persistBranch(ctx.active_branch, ctx.can_switch_branch)
  }, [persistBranch])

  const switchBranch = useCallback(
    async (branchId: number) => {
      const res = await sessionService.switchBranch(branchId)
      localStorage.setItem('token', res.token)
      setActiveBranch(res.active_branch)
      setCanSwitchBranch(res.can_switch_branch)
      persistBranch(res.active_branch, res.can_switch_branch)
      bumpReset()
      toast.success(`Sucursal: ${res.active_branch.name}`)
    },
    [bumpReset, persistBranch],
  )

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveBranch(null)
      setCanSwitchBranch(false)
      localStorage.removeItem('active_branch')
      localStorage.removeItem('can_switch_branch')
      return
    }
    if (!activeBranch) {
      void refreshContext().catch(() => {})
    }
  }, [isAuthenticated, activeBranch, refreshContext])

  const value = useMemo(
    () => ({
      activeBranch,
      activeBranchId: activeBranch?.id ?? 0,
      canSwitchBranch,
      resetEpoch,
      setFromLogin,
      switchBranch,
      refreshContext,
    }),
    [activeBranch, canSwitchBranch, resetEpoch, setFromLogin, switchBranch, refreshContext],
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch debe usarse dentro de BranchProvider')
  return ctx
}

/** Recarga datos de página al cambiar sucursal. */
export function useOnBranchChange(effect: () => void) {
  const { resetEpoch } = useBranch()
  useEffect(() => {
    effect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar sucursal
  }, [resetEpoch])
}
