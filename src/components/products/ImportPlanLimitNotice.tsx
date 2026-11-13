import { AlertTriangle } from 'lucide-react'
import type { PlanLimit } from '@/contexts/ModulesContext'

/**
 * Aviso del tope de productos del plan en la importación masiva.
 *  - `before`: antes de importar. Si el Excel trae más productos nuevos de los que caben, advierte cuántos se importarán.
 *    `candidates` son las filas que podrían crear producto (los servicios no cuentan); algunas pueden ser actualizaciones de
 *    productos que ya existen y esas no consumen cupo, por eso se dice «hasta».
 *  - `preview`: simulación del servidor (importación avanzada): `skipped` es la cantidad exacta que se omitirá.
 *  - `after`: ya importado. Informa cuántas filas se omitieron porque el plan se llenó (dato real del servidor).
 */
export function ImportPlanLimitNotice({
  limit,
  candidates = 0,
  skipped = 0,
  phase,
}: {
  limit: PlanLimit | undefined
  candidates?: number
  skipped?: number
  phase: 'before' | 'preview' | 'after'
}) {
  if (!limit || limit.unlimited || limit.max <= 0) return null
  const remaining = Math.max(0, limit.max - limit.used)

  if (phase === 'after') {
    if (skipped <= 0) return null
    return (
      <Box>
        <strong>{skipped}</strong> fila(s) NO se importaron porque tu plan llegó a su límite de <strong>{limit.max}</strong> productos.
        Para agregar más, mejora tu plan.
      </Box>
    )
  }

  if (phase === 'preview') {
    if (skipped <= 0) return null
    return (
      <Box>
        Tu plan permite <strong>{limit.max}</strong> productos y ya tienes <strong>{limit.used}</strong>. De este Excel se importarán solo los
        productos nuevos que caben y <strong>no más</strong>: <strong>{skipped}</strong> fila(s) se omitirán. Los productos que ya existen sí se
        actualizan.
      </Box>
    )
  }

  if (remaining === 0) {
    return (
      <Box>
        Tu plan ya alcanzó su límite de <strong>{limit.max}</strong> productos ({limit.used}/{limit.max}). Podrás actualizar los productos
        que ya existen, pero <strong>no se crearán productos nuevos</strong>.
      </Box>
    )
  }
  if (candidates <= remaining) return null
  return (
    <Box>
      Tu plan permite <strong>{limit.max}</strong> productos y ya tienes <strong>{limit.used}</strong>. Este Excel trae{' '}
      <strong>{candidates}</strong> fila(s) de productos: solo se importarán hasta <strong>{remaining}</strong> producto(s) nuevo(s) y{' '}
      <strong>no más</strong>; el resto se omitirá. Los productos que ya existen sí se actualizan.
    </Box>
  )
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
