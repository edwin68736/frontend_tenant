import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { sessionService, type BranchBrief } from '@/services/session.service'
import { useAuth } from '@/contexts/AuthContext'
import { BRANCH_INVALID_EVENT, SESSION_REFRESHED_EVENT } from '@/services/api'
import { clearAllCaches, resetBranchCaches } from '@/lib/branchScope/caches'
import { clearPendingWork, getPendingWork } from '@/lib/branchScope/pendingWork'
import {
  advanceEpoch,
  setBranchSwitching,
  waitForMutationsIdle,
} from '@/lib/branchScope/requestEpoch'

const ALLOWED_BRANCHES_KEY = 'allowed_branches'

function readAllowedBranches(): BranchBrief[] {
  try {
    const raw = localStorage.getItem(ALLOWED_BRANCHES_KEY)
    return raw ? (JSON.parse(raw) as BranchBrief[]) : []
  } catch {
    return []
  }
}

/** Resultado de `switchBranch` (nunca lanza). */
export type SwitchBranchResult =
  | { status: 'ok' }
  /** Ya hay un cambio en curso: no se hizo nada. */
  | { status: 'busy' }
  /** La sucursal pedida ya es la activa. */
  | { status: 'same' }
  /** Hay trabajo sin guardar; reintentar con `{ confirmed: true }` tras avisar al usuario. */
  | { status: 'pending'; labels: string[] }
  | { status: 'error'; error: unknown }

type BranchContextValue = {
  activeBranch: BranchBrief | null
  activeBranchId: number
  allowedBranches: BranchBrief[]
  canSwitchBranch: boolean
  /** El backend indica que el usuario puede consultar "todas las sucursales" (solo lectura). */
  canViewAll: boolean
  /** true mientras se ejecuta un cambio de sucursal (el selector debe bloquearse). */
  switching: boolean
  resetEpoch: number
  setFromLogin: (branch: BranchBrief | null, canSwitch: boolean, allowed?: BranchBrief[]) => void
  switchBranch: (branchId: number, opts?: { confirmed?: boolean }) => Promise<SwitchBranchResult>
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
  const [allowedBranches, setAllowedBranches] = useState<BranchBrief[]>(readAllowedBranches)
  const [canSwitchBranch, setCanSwitchBranch] = useState(
    () => localStorage.getItem('can_switch_branch') === 'true',
  )
  const [canViewAll, setCanViewAll] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [resetEpoch, setResetEpoch] = useState(0)

  // Referencias para leer el valor vigente dentro de callbacks asíncronos sin re-crearlos.
  const activeIdRef = useRef<number>(activeBranch?.id ?? 0)
  activeIdRef.current = activeBranch?.id ?? 0
  const switchLockRef = useRef(false)
  const invalidHandlingRef = useRef(false)

  const persistBranch = useCallback((b: BranchBrief | null, canSwitch: boolean, allowed?: BranchBrief[]) => {
    if (b) localStorage.setItem('active_branch', JSON.stringify(b))
    else localStorage.removeItem('active_branch')
    localStorage.setItem('can_switch_branch', canSwitch ? 'true' : 'false')
    const list = allowed?.length ? allowed : b ? [b] : []
    setAllowedBranches(list)
    if (list.length) {
      localStorage.setItem(ALLOWED_BRANCHES_KEY, JSON.stringify(list))
    } else {
      localStorage.removeItem(ALLOWED_BRANCHES_KEY)
    }
  }, [])

  const setFromLogin = useCallback(
    (branch: BranchBrief | null, canSwitch: boolean, allowed?: BranchBrief[]) => {
      setActiveBranch(branch)
      setCanSwitchBranch(canSwitch)
      persistBranch(branch, canSwitch, allowed)
    },
    [persistBranch],
  )

  /**
   * La sucursal activa cambió: aborta lecturas en vuelo de la anterior, vacía cachés ligadas a la sucursal
   * y sube la época (el layout remonta las pantallas con ella como parte de la `key`).
   */
  const bumpReset = useCallback(() => {
    advanceEpoch()
    resetBranchCaches()
    setResetEpoch((e) => e + 1)
    window.dispatchEvent(new CustomEvent('branch-changed'))
  }, [])

  /** Aplica el contexto que dice el servidor; remonta solo si la sucursal activa realmente cambió. */
  const applyContext = useCallback(
    (
      branch: BranchBrief | null,
      canSwitch: boolean,
      allowed: BranchBrief[] | undefined,
      viewAll: boolean | undefined,
    ): boolean => {
      const changed = (branch?.id ?? 0) !== activeIdRef.current
      setActiveBranch(branch)
      setCanSwitchBranch(canSwitch)
      setCanViewAll(Boolean(viewAll))
      persistBranch(branch, canSwitch, allowed ?? [])
      if (changed) bumpReset()
      return changed
    },
    [persistBranch, bumpReset],
  )

  const refreshContext = useCallback(async () => {
    const ctx = await sessionService.getContext()
    applyContext(ctx.active_branch, ctx.can_switch_branch, ctx.allowed_branches, ctx.can_view_all)
  }, [applyContext])

  const switchBranch = useCallback(
    async (branchId: number, opts?: { confirmed?: boolean }): Promise<SwitchBranchResult> => {
      // Serializado: un segundo clic/llamada mientras hay uno en curso se ignora (si no, "gana el último
      // en responder" y el token/estado podrían quedar de sucursales distintas).
      if (switchLockRef.current) return { status: 'busy' }
      if (branchId === activeIdRef.current) return { status: 'same' }
      const pending = getPendingWork()
      if (pending.length > 0 && !opts?.confirmed) return { status: 'pending', labels: pending }

      switchLockRef.current = true
      setSwitching(true)
      setBranchSwitching(true)
      try {
        // Las escrituras en vuelo (un cobro, por ejemplo) no se abortan: se espera a que terminen para que
        // el usuario vea su resultado antes de cambiar el contexto.
        await waitForMutationsIdle()
        const res = await sessionService.switchBranch(branchId)

        // Token nuevo (y refresh token si el servidor lo emite) ANTES de abrir la época nueva, para que
        // ninguna petición de la época nueva salga con el token viejo.
        localStorage.setItem('token', res.token)
        if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token)
        // AuthContext re-lee módulos/permisos/estado del token nuevo.
        window.dispatchEvent(new CustomEvent(SESSION_REFRESHED_EVENT, { detail: { token: res.token } }))

        clearPendingWork()
        setActiveBranch(res.active_branch)
        setCanSwitchBranch(res.can_switch_branch)
        setCanViewAll(Boolean(res.can_view_all))
        persistBranch(res.active_branch, res.can_switch_branch, res.allowed_branches ?? [])
        bumpReset()
        toast.success(`Sucursal: ${res.active_branch.name}`)
        return { status: 'ok' }
      } catch (error) {
        const e = error as { response?: { data?: { error?: string; message?: string } } }
        toast.error(e?.response?.data?.error || e?.response?.data?.message || 'No se pudo cambiar de sucursal')
        return { status: 'error', error }
      } finally {
        switchLockRef.current = false
        setSwitching(false)
        setBranchSwitching(false)
      }
    },
    [bumpReset, persistBranch],
  )

  // BRANCH_REQUIRED / BRANCH_FORBIDDEN: la sucursal del token ya no sirve (desasignada, desactivada...).
  // Se pide el contexto real al servidor; si cambió se remonta, si no, se avisa. Con cooldown para no
  // entrar en bucle de refrescos.
  useEffect(() => {
    if (!isAuthenticated) return
    const onInvalid = (e: Event) => {
      if (invalidHandlingRef.current || switchLockRef.current) return
      invalidHandlingRef.current = true
      const code = (e as CustomEvent<{ code?: string }>).detail?.code
      void sessionService
        .getContext()
        .then((ctx) => {
          const changed = applyContext(
            ctx.active_branch,
            ctx.can_switch_branch,
            ctx.allowed_branches,
            ctx.can_view_all,
          )
          if (changed && ctx.active_branch) {
            toast.info(`Tu sucursal activa ahora es ${ctx.active_branch.name}.`, { id: 'branch-invalid' })
          } else if (!ctx.active_branch) {
            toast.error('Selecciona una sucursal para continuar.', { id: 'branch-invalid' })
          } else if (code === 'BRANCH_FORBIDDEN') {
            toast.error('No tienes acceso a esta sucursal.', { id: 'branch-invalid' })
          }
        })
        .catch(() => toast.error('No se pudo verificar tu sucursal activa.', { id: 'branch-invalid' }))
        .finally(() => {
          window.setTimeout(() => {
            invalidHandlingRef.current = false
          }, 3000)
        })
    }
    window.addEventListener(BRANCH_INVALID_EVENT, onInvalid)
    return () => window.removeEventListener(BRANCH_INVALID_EVENT, onInvalid)
  }, [isAuthenticated, applyContext])

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveBranch(null)
      setAllowedBranches([])
      setCanSwitchBranch(false)
      setCanViewAll(false)
      localStorage.removeItem('active_branch')
      localStorage.removeItem('can_switch_branch')
      localStorage.removeItem(ALLOWED_BRANCHES_KEY)
      // Sesión cerrada o caída (también en Tauri/Capacitor, sin recarga): nada de la sucursal/usuario
      // anterior debe sobrevivir en cachés de módulo.
      clearAllCaches()
      clearPendingWork()
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
      allowedBranches,
      canSwitchBranch,
      canViewAll,
      switching,
      resetEpoch,
      setFromLogin,
      switchBranch,
      refreshContext,
    }),
    [
      activeBranch,
      allowedBranches,
      canSwitchBranch,
      canViewAll,
      switching,
      resetEpoch,
      setFromLogin,
      switchBranch,
      refreshContext,
    ],
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
