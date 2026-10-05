/**
 * Ayudas para armar roles en Roles y permisos.
 *
 * Los permisos se identifican por «módulo.acción» (p. ej. sales.view), que es lo que usa el catálogo.
 */

/**
 * Cada reporte (reports.*) solo decide si la PÁGINA aparece en el menú; los datos los sirve el
 * endpoint del módulo dueño, que exige su propio permiso (p. ej. el reporte de ventas lee GET /sales,
 * que pide sales.view). Sin ese segundo permiso el reporte abre vacío o con error 403. Por eso, al
 * marcar un reporte se marca también su permiso base.
 */
export const REPORT_BASE_PERMISSION: Record<string, string> = {
  'reports.sales': 'sales.view',
  'reports.sales_by_product': 'sales.view',
  'reports.notes': 'sales.view',
  'reports.profit': 'sales.view',
  'reports.products': 'products.view',
  'reports.purchases': 'purchases.view',
  'reports.kardex': 'inventory.view',
  'reports.cash': 'cashbank.view',
}

export type RolePreset = {
  /** Nombre del rol de sistema al que corresponde. */
  name: string
  summary: string
  /** Permisos («módulo.acción»). Los que no existan en el catálogo del tenant se omiten. */
  keys: string[]
}

/** Perfil contable: ver y consultar todo lo financiero y fiscal, sin vender ni tocar inventario. */
export const ROLE_PRESETS: RolePreset[] = [
  {
    name: 'Contador',
    summary:
      'Ve ventas, compras, caja, cuentas por cobrar/pagar y facturación electrónica, y todos los reportes (ventas, notas, utilidades, compras, caja, kardex, productos).',
    keys: [
      'dashboard.view',
      'company.view',
      'contacts.view',
      // Ventas y comprobantes
      'sales.view',
      'billing.send',
      'billing.credit_note',
      'billing.debit_note',
      'billing.advanced_docs',
      // Compras, caja y cuentas
      'purchases.view',
      'products.view',
      'inventory.view',
      'cashbank.view',
      'receivables.view',
      'receivables.collect',
      'receivables.confirm_bn',
      'payables.view',
      'payables.pay',
      'subscription.view',
      // Reportes (sus permisos base ya están arriba)
      'reports.sales',
      'reports.sales_by_product',
      'reports.notes',
      'reports.profit',
      'reports.purchases',
      'reports.cash',
      'reports.kardex',
      'reports.products',
    ],
  },
]

type PermLike = { id: number; module: string; action: string }

export const permKey = (p: PermLike): string => `${p.module}.${p.action}`

/** Ids a agregar al aplicar un perfil (solo los que existen en el catálogo del tenant). */
export function presetPermissionIds(preset: RolePreset, catalog: PermLike[]): number[] {
  const byKey = new Map(catalog.map((p) => [permKey(p), p.id]))
  return preset.keys.map((k) => byKey.get(k)).filter((id): id is number => id != null)
}

/**
 * Marca/desmarca un permiso respetando las dependencias reporte → permiso base:
 *  - al MARCAR un reporte se marca también su base;
 *  - al DESMARCAR un permiso base se desmarcan los reportes que dependen de él (quedarían sin datos).
 */
export function togglePermissionWithDeps(current: number[], id: number, catalog: PermLike[]): number[] {
  const byId = new Map(catalog.map((p) => [p.id, permKey(p)]))
  const byKey = new Map(catalog.map((p) => [permKey(p), p.id]))
  const key = byId.get(id)
  const set = new Set(current)

  if (set.has(id)) {
    set.delete(id)
    if (key) {
      for (const [report, base] of Object.entries(REPORT_BASE_PERMISSION)) {
        if (base === key) {
          const rid = byKey.get(report)
          if (rid != null) set.delete(rid)
        }
      }
    }
  } else {
    set.add(id)
    const base = key ? REPORT_BASE_PERMISSION[key] : undefined
    const baseId = base ? byKey.get(base) : undefined
    if (baseId != null) set.add(baseId)
  }
  return [...set]
}
