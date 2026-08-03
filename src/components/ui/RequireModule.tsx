import { type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import UpgradePrompt from '@/components/ui/UpgradePrompt'

interface Props {
  moduleKey: string
  children: ReactNode
}

/**
 * Muestra el contenido si el plan del tenant incluye el módulo; si no, muestra el upsell
 * "mejora tu plan" (en vez de ocultar la vista). El gate es `hasModule` del JWT; el catálogo
 * (ModulesContext, dentro de UpgradePrompt) enriquece el mensaje.
 */
export default function RequireModule({ moduleKey, children }: Props) {
  const { hasModule } = useAuth()

  if (!hasModule(moduleKey)) {
    if (moduleKey === 'billing') {
      return (
        <UpgradePrompt
          moduleKey="billing"
          title="Facturación electrónica no habilitada"
          description="Mejora tu plan para habilitar la facturación electrónica (boletas y facturas)."
          note="Mientras tanto, solo puedes emitir Notas de venta."
        />
      )
    }
    return <UpgradePrompt moduleKey={moduleKey} />
  }

  return <>{children}</>
}
