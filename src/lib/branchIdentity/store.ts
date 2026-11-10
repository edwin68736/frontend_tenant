import { useEffect, useState } from 'react'
import { companyService, type BranchRow } from '@/services/company.service'
import { getCompanyConfigCache, getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { useBranch } from '@/contexts/BranchContext'
import { registerBranchCache } from '@/lib/branchScope/caches'
import { findBranch, resolveBranchIdentity, type BranchIdentity } from './resolve'

/** Evento que company.service dispara al crear/editar/borrar una sucursal o su logo. */
export const BRANCHES_UPDATED_EVENT = 'branches-updated'

let listCache: BranchRow[] | null = null
let inflight: Promise<BranchRow[]> | null = null
let generation = 0

/** Descarta la lista cacheada (se vuelve a pedir en el próximo uso). */
export function invalidateBranchIdentityCache(): void {
  generation++
  listCache = null
  inflight = null
}

// Cambiar de sucursal (resetBranchCaches) o cerrar sesión (clearAllCaches, también en Tauri/Android donde
// no hay recarga) invalida lo cacheado: el logo/dirección de la sucursal destino no debe salir de una
// lectura anterior.
registerBranchCache('branchIdentity', invalidateBranchIdentityCache)
if (typeof window !== 'undefined') {
  window.addEventListener(BRANCHES_UPDATED_EVENT, invalidateBranchIdentityCache)
}

/** Lista de sucursales (con dirección, teléfono y logo) — una sola petición compartida. */
export function loadBranches(): Promise<BranchRow[]> {
  if (listCache) return Promise.resolve(listCache)
  if (inflight) return inflight
  const gen = generation
  const p = companyService
    .listBranches()
    .then((rows) => {
      const list = rows ?? []
      if (gen === generation) listCache = list
      return list
    })
    .finally(() => {
      if (inflight === p) inflight = null
    })
  inflight = p
  return p
}

export interface BranchPrintIdentity extends BranchIdentity {
  /** Logo a imprimir (data URL cuando se pudo embeber), ya con respaldo al de la empresa. */
  logo: string | null
}

/** Combina la sucursal con la config de la empresa y resuelve el logo imprimible. */
export function buildBranchPrintIdentity(branch: BranchRow | undefined): BranchPrintIdentity {
  const cfg = getCompanyConfigCache()
  const id = resolveBranchIdentity(branch, cfg)
  // Logo propio embebido → tal cual. Propio sin embeber → su URL (getCompanyLogoForPrint la
  // descarga en segundo plano). Sin logo propio → el global de la empresa.
  const logo = id.ownLogoDataUrl || getCompanyLogoForPrint(id.ownLogoUrl || undefined)
  return { ...id, logo }
}

/**
 * Identidad de una sucursal para documentos/PDF (asíncrono, usa la lista cacheada).
 * `ref` puede traer id y/o nombre; sin ninguno de los dos devuelve la identidad de la empresa.
 */
export async function loadBranchPrintIdentity(ref: {
  id?: number | null
  name?: string | null
}): Promise<BranchPrintIdentity> {
  let branch: BranchRow | undefined
  try {
    branch = findBranch(await loadBranches(), ref)
  } catch {
    branch = undefined
  }
  const identity = buildBranchPrintIdentity(branch)
  if (!identity.name && ref.name) identity.name = String(ref.name).trim()
  return identity
}

/**
 * Identidad impresa de la sucursal indicada (por defecto la activa). Se refresca al cambiar de
 * sucursal y al editar sucursales. Mientras carga devuelve la identidad de la empresa.
 */
export function useBranchIdentity(branchId?: number): BranchPrintIdentity {
  const { activeBranchId, activeBranch, resetEpoch } = useBranch()
  const id = branchId ?? activeBranchId
  const [edits, setEdits] = useState(0)
  const [state, setState] = useState<BranchPrintIdentity>(() => buildBranchPrintIdentity(undefined))

  useEffect(() => {
    const bump = () => setEdits((n) => n + 1)
    window.addEventListener(BRANCHES_UPDATED_EVENT, bump)
    return () => window.removeEventListener(BRANCHES_UPDATED_EVENT, bump)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setState(buildBranchPrintIdentity(undefined))
      return
    }
    void loadBranchPrintIdentity({ id, name: id === activeBranchId ? activeBranch?.name : undefined }).then(
      (identity) => {
        if (!cancelled) setState(identity)
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, activeBranchId, activeBranch?.name, resetEpoch, edits])

  return state
}
