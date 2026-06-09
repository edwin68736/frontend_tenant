import { Navigate, useSearchParams } from 'react-router-dom'
import SalesRegisterPage from './SalesRegisterPage'

/** Compatibilidad: /sales/register?tipo=00 → nota de venta; sin query → nuevo comprobante. */
export default function SalesRegisterLegacyRedirect() {
  const [params] = useSearchParams()
  if (params.get('tipo')?.trim() === '00') {
    return <Navigate to="/sales/nota-venta" replace />
  }
  return <SalesRegisterPage mode="comprobante" />
}
