/**
 * Registro único de cachés de módulo.
 *
 * Cada módulo que guarde datos en memoria/localStorage que dependan de la sucursal activa o de la
 * sesión se registra aquí en vez de escuchar eventos sueltos:
 *  - `registerBranchCache`  -> se vacía al cambiar de sucursal Y al cerrar sesión.
 *  - `registerSessionCache` -> se vacía solo al cerrar sesión / sesión caída (datos del tenant que no
 *    cambian por sucursal pero no deben sobrevivir a otro usuario/empresa).
 *
 * Es una hoja sin dependencias: la importan api.ts, los contextos y los stores sin ciclos.
 */

type Entry = { name: string; clear: () => void }

const branchCaches = new Map<string, Entry>()
const sessionCaches = new Map<string, Entry>()

function safeRun(e: Entry): void {
  try {
    e.clear()
  } catch (err) {
    console.warn(`[caches] no se pudo limpiar "${e.name}"`, err)
  }
}

/** Registra (o reemplaza por nombre) una caché que depende de la sucursal. */
export function registerBranchCache(name: string, clear: () => void): void {
  branchCaches.set(name, { name, clear })
}

/** Registra (o reemplaza por nombre) una caché de sesión (no depende de la sucursal). */
export function registerSessionCache(name: string, clear: () => void): void {
  sessionCaches.set(name, { name, clear })
}

/** Al cambiar de sucursal: vacía las cachés ligadas a la sucursal. */
export function resetBranchCaches(): void {
  branchCaches.forEach(safeRun)
}

/** Al cerrar sesión (o sesión caída): vacía TODO, incluso en Tauri/Capacitor donde no hay recarga. */
export function clearAllCaches(): void {
  branchCaches.forEach(safeRun)
  sessionCaches.forEach(safeRun)
}

/** Solo para tests. */
export function __registeredCacheNames(): { branch: string[]; session: string[] } {
  return { branch: [...branchCaches.keys()], session: [...sessionCaches.keys()] }
}
