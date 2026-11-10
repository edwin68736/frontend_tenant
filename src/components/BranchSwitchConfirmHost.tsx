import { useEffect, useState } from 'react'
import { useBranch } from '@/contexts/BranchContext'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/** Evento que emite el selector de sucursal cuando hay trabajo sin guardar y falta confirmar. */
export const BRANCH_SWITCH_CONFIRM_EVENT = 'tukifac:branch-switch-confirm'

export type BranchSwitchConfirmDetail = { branchId: number; labels: string[] }

/**
 * Diálogo de confirmación previo al cambio de sucursal cuando hay trabajo sin guardar (carrito del POS,
 * venta/cotización/compra en edición). Vive en el layout, fuera del menú de usuario, porque ese menú se
 * cierra al hacer clic fuera y se llevaría el diálogo consigo.
 */
export default function BranchSwitchConfirmHost() {
  const { switchBranch } = useBranch()
  const [req, setReq] = useState<BranchSwitchConfirmDetail | null>(null)

  useEffect(() => {
    const onReq = (e: Event) => setReq((e as CustomEvent<BranchSwitchConfirmDetail>).detail)
    window.addEventListener(BRANCH_SWITCH_CONFIRM_EVENT, onReq)
    return () => window.removeEventListener(BRANCH_SWITCH_CONFIRM_EVENT, onReq)
  }, [])

  return (
    <ConfirmDialog
      open={req !== null}
      onClose={() => setReq(null)}
      title="Cambiar de sucursal"
      message={
        req
          ? `Tienes trabajo sin guardar (${req.labels.join(', ')}). Si cambias de sucursal se descartará, porque precios, stock y series pertenecen a la sucursal actual.`
          : undefined
      }
      confirmLabel="Descartar y cambiar"
      variant="danger"
      onConfirm={async () => {
        if (!req) return
        await switchBranch(req.branchId, { confirmed: true })
      }}
    />
  )
}
