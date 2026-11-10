/**
 * Modo de vista de sucursal: 'single' (sucursal activa) o 'all' (consulta consolidada de todas las
 * sucursales, SOLO lectura; requiere `branches.view_all` en el servidor).
 *
 * Vive fuera de React para que el interceptor de axios (api.ts) lo lea de forma síncrona. El valor se
 * persiste por tenant en localStorage y se vacía al cerrar sesión (registro de cachés de sesión).
 */
import { getTenantSlug } from '@/config/apiBaseUrl'
import { registerSessionCache } from '@/lib/branchScope/caches'

export type BranchViewMode = 'single' | 'all'

/** Cabecera que activa el modo consolidado en el backend (solo con `branches.view_all`). */
export const BRANCH_MODE_HEADER = 'X-Branch-Mode'
export const BRANCH_READ_ONLY_CODE = 'BRANCH_READ_ONLY'
export const BRANCH_READ_ONLY_MESSAGE =
  'Modo consulta: todas las sucursales. Seleccione una sucursal para operar.'

export function viewModeStorageKey(): string {
  let slug = ''
  try {
    slug = getTenantSlug()
  } catch {
    slug = ''
  }
  return `branch_view_mode:${slug || 'default'}`
}

function readStored(): BranchViewMode {
  try {
    return localStorage.getItem(viewModeStorageKey()) === 'all' ? 'all' : 'single'
  } catch {
    return 'single'
  }
}

let mode: BranchViewMode = readStored()

export function getViewMode(): BranchViewMode {
  return mode
}

export function isAllBranchesMode(): boolean {
  return mode === 'all'
}

export function setViewMode(next: BranchViewMode): void {
  mode = next
  try {
    if (next === 'all') localStorage.setItem(viewModeStorageKey(), 'all')
    else localStorage.removeItem(viewModeStorageKey())
  } catch {
    /* sin almacenamiento: el modo vive solo en memoria */
  }
}

/** Relee el modo persistido (arranque / tests). */
export function reloadViewModeFromStorage(): BranchViewMode {
  mode = readStored()
  return mode
}

// Al cerrar sesión (o sesión caída) el modo no debe sobrevivir al usuario siguiente.
registerSessionCache('branch-view-mode', () => setViewMode('single'))
