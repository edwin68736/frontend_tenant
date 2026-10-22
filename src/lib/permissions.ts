/**
 * Resolución de permisos del tenant, en espejo del backend (pkg/middleware/tenant_permissions.go,
 * función tenantHasPermission). Antes AuthContext.hasPermission hacía match exacto contra el
 * array de permisos del JWT — distinto del criterio que ya usa el backend para RequireSalesAccess/
 * RequireCashbankAccess (y, desde este fix, también RequirePermission en todos los módulos):
 * "{modulo}.manage" concede todas las acciones de ese módulo, más un puñado de implicancias
 * puntuales. Sin este espejo, un usuario con permiso real (según el backend) podía ver un botón
 * oculto en la UI por una regla que el frontend no conocía, o viceversa.
 *
 * IMPORTANTE: si se agrega una implicancia nueva en tenant_permissions.go, replicarla aquí. No hay
 * ningún endpoint que exponga esta tabla dinámicamente (mismo trade-off documentado en
 * frontend_central/src/lib/permissions.ts para el RBAC del panel central).
 */

function splitModuleAction(key: string): [string, string] | null {
  const idx = key.indexOf('.')
  if (idx < 0) return null
  return [key.slice(0, idx), key.slice(idx + 1)]
}

const IMPLIED_BY: Record<string, string[]> = {
  'cashbank.view': ['cashbank.open', 'cashbank.close', 'cashbank.movements'],
  'products.view': ['sales.pos', 'sales.create', 'products.create', 'products.edit', 'products.delete'],
  'sales.view': ['sales.create', 'sales.pos', 'sales.edit', 'sales.cancel'],
  'sales.create': ['sales.pos'],
}

/** Igual que tenantHasPermission en Go: exacto, luego "{modulo}.manage", luego implicancias puntuales. */
export function hasTenantPermission(permissions: string[], required: string): boolean {
  if (!required) return false
  const set = new Set(permissions)
  if (set.has(required)) return true

  const split = splitModuleAction(required)
  if (split) {
    const [mod] = split
    if (set.has(`${mod}.manage`)) return true
  }

  const impliedBy = IMPLIED_BY[required]
  if (impliedBy) {
    return impliedBy.some((p) => set.has(p))
  }
  return false
}
