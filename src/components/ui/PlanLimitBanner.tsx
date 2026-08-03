import { useModules, type PlanLimits } from '@/contexts/ModulesContext'
import UpgradePrompt from '@/components/ui/UpgradePrompt'

const LABELS: Record<keyof PlanLimits, string> = {
  products: 'productos',
  users: 'usuarios',
  branches: 'sucursales',
  documents: 'documentos',
}

/**
 * Aviso proactivo cuando el tenant se acerca (≥80%) o llega al tope de una cuota del plan.
 * El bloqueo real de creación lo hace el backend (402 PLAN_LIMIT_EXCEEDED); esto es el heads-up.
 * Los conteos vienen del endpoint de sesión (aproximados hasta el próximo refresh).
 */
export function PlanLimitBanner({ resource }: { resource: keyof PlanLimits }) {
  const { limits } = useModules()
  const l = limits[resource]
  if (!l || l.unlimited || l.max <= 0) return null

  const ratio = l.max > 0 ? l.used / l.max : 0
  if (ratio < 0.8) return null

  const label = LABELS[resource]
  const over = l.used >= l.max
  return (
    <div className="mb-3">
      <UpgradePrompt
        compact
        title={
          over
            ? `Llegaste al límite de ${label} de tu plan (${l.used}/${l.max})`
            : `Estás cerca del límite de ${label} (${l.used}/${l.max})`
        }
        description={
          over
            ? `Para agregar más ${label}, mejora tu plan.`
            : `Al llegar a ${l.max} ${label} tendrás que mejorar tu plan para agregar más.`
        }
      />
    </div>
  )
}
