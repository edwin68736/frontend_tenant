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
import {
  BRANCH_INVALID_EVENT,
  BRANCH_READ_ONLY_EVENT,
  SESSION_CONTEXT_STALE_EVENT,
  SESSION_REFRESHED_EVENT,
} from '@/services/api'
import { BRANCH_READ_ONLY_MESSAGE, getViewMode, setViewMode } from '@/lib/branchScope/viewMode'
import { clearAllCaches, resetBranchCaches } from '@/lib/branchScope/caches'
import { clearPendingWork, getPendingWork } from '@/lib/branchScope/pendingWork'
import {
  advanceEpoch,
  setBranchSwitching,
  waitForMutationsIdle,
} from '@/lib/branchScope/requestEpoch'

const ALLOWED_BRANCHES_KEY = 'allowed_branches'
const CAN_VIEW_ALL_KEY = 'can_view_all'

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
  /**
   * Modo "Todas las sucursales" activo (solo si `canViewAll`): consulta consolidada de SOLO lectura.
   * `activeBranch` sigue siendo la última sucursal activa del token (con la que se vuelve a operar).
   */
  isAllBranches: boolean
  /** Entra/sale del modo "Todas las sucursales". Nunca reemite token. */
  setAllBranchesMode: (on: boolean, opts?: { confirmed?: boolean }) => SwitchBranchResult
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
  const [canViewAll, setCanViewAll] = useState(() => localStorage.getItem(CAN_VIEW_ALL_KEY) === 'true')
  // El modo vive en un módulo (lo lee el interceptor de axios); aquí solo se refleja para renderizar.
  const [viewMode, setViewModeState] = useState(() => getViewMode())
  const [switching, setSwitching] = useState(false)
  const [resetEpoch, setResetEpoch] = useState(0)

  // Referencias para leer el valor vigente dentro de callbacks asíncronos sin re-crearlos.
  const activeIdRef = useRef<number>(activeBranch?.id ?? 0)
  activeIdRef.current = activeBranch?.id ?? 0
  const canViewAllRef = useRef(canViewAll)
  canViewAllRef.current = canViewAll
  const switchLockRef = useRef(false)
  const invalidHandlingRef = useRef(false)

  /** Fija si el usuario puede ver todas las sucursales; si lo pierde, el modo consolidado se apaga. */
  const applyCanViewAll = useCallback((v: boolean | undefined) => {
    const can = Boolean(v)
    setCanViewAll(can)
    try {
      if (can) localStorage.setItem(CAN_VIEW_ALL_KEY, 'true')
      else localStorage.removeItem(CAN_VIEW_ALL_KEY)
    } catch {
      /* ignore */
    }
    if (!can && getViewMode() === 'all') {
      setViewMode('single')
      setViewModeState('single')
      return true
    }
    return false
  }, [])

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
      const modeDropped = applyCanViewAll(viewAll)
      persistBranch(branch, canSwitch, allowed ?? [])
      if (changed || modeDropped) bumpReset()
      return changed
    },
    [persistBranch, bumpReset, applyCanViewAll],
  )

  const refreshContext = useCallback(async () => {
    const ctx = await sessionService.getContext()
    applyContext(ctx.active_branch, ctx.can_switch_branch, ctx.allowed_branches, ctx.can_view_all)
  }, [applyContext])

  const setAllBranchesMode = useCallback(
    (on: boolean, opts?: { confirmed?: boolean }): SwitchBranchResult => {
      if (switchLockRef.current) return { status: 'busy' }
      const current = getViewMode() === 'all'
      if (on === current) return { status: 'same' }
      if (on && !canViewAllRef.current) return { status: 'error', error: new Error('Sin permiso para ver todas las sucursales') }
      const pending = getPendingWork()
      if (pending.length > 0 && !opts?.confirmed) return { status: 'pending', labels: pending }
      clearPendingWork()
      // Primero el modo (lo lee el interceptor), luego la época: las lecturas de la vista nueva ya salen con el modo nuevo.
      setViewMode(on ? 'all' : 'single')
      setViewModeState(on ? 'all' : 'single')
      bumpReset()
      return { status: 'ok' }
    },
    [bumpReset],
  )

  const switchBranch = useCallback(
    async (branchId: number, opts?: { confirmed?: boolean }): Promise<SwitchBranchResult> => {
      // Serializado: un segundo clic/llamada mientras hay uno en curso se ignora (si no, "gana el último
      // en responder" y el token/estado podrían quedar de sucursales distintas).
      if (switchLockRef.current) return { status: 'busy' }
      if (branchId === activeIdRef.current) {
        // En modo "todas", elegir la sucursal que el token ya tiene solo sale del modo (sin token nuevo).
        return getViewMode() === 'all' ? setAllBranchesMode(false, opts) : { status: 'same' }
      }
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
        applyCanViewAll(res.can_view_all)
        // Cambiar a una sucursal concreta siempre sale del modo consolidado.
        setViewMode('single')
        setViewModeState('single')
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
    [bumpReset, persistBranch, applyCanViewAll, setAllBranchesMode],
  )

  // Escritura intentada en modo consulta (cortada en el cliente o 403 BRANCH_READ_ONLY del servidor).
  useEffect(() => {
    const onReadOnly = () => toast.error(BRANCH_READ_ONLY_MESSAGE, { id: 'branch-read-only' })
    window.addEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
    return () => window.removeEventListener(BRANCH_READ_ONLY_EVENT, onReadOnly)
  }, [])

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

  // Refresh provocado por un 409 SESSION_UPDATED (cambió rol/permisos/sucursales del usuario): se relee el
  // contexto; applyContext remonta solo si la sucursal activa cambió. Silencioso (sin toasts) y sin pisar un
  // cambio de sucursal propio en curso.
  useEffect(() => {
    if (!isAuthenticated) return
    const onStale = () => {
      if (switchLockRef.current) return
      void refreshContext().catch(() => {})
    }
    window.addEventListener(SESSION_CONTEXT_STALE_EVENT, onStale)
    return () => window.removeEventListener(SESSION_CONTEXT_STALE_EVENT, onStale)
  }, [isAuthenticated, refreshContext])

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveBranch(null)
      setAllowedBranches([])
      setCanSwitchBranch(false)
      setCanViewAll(false)
      setViewModeState('single')
      localStorage.removeItem(CAN_VIEW_ALL_KEY)
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

  // Tras recargar con el modo "todas" persistido: confirma con el servidor que el usuario aún tiene
  // `branches.view_all` (si lo perdió, applyContext apaga el modo y remonta).
  useEffect(() => {
    if (isAuthenticated && getViewMode() === 'all') {
      void refreshContext().catch(() => {})
    }
  }, [isAuthenticated, refreshContext])

  const value = useMemo(
    () => ({
      activeBranch,
      activeBranchId: activeBranch?.id ?? 0,
      allowedBranches,
      canSwitchBranch,
      canViewAll,
      isAllBranches: canViewAll && viewMode === 'all',
      setAllBranchesMode,
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
      viewMode,
      setAllBranchesMode,
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
