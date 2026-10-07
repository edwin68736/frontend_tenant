import { Link, Outlet, useLocation } from 'react-router-dom'
import { AlertTriangle, BarChart3 } from 'lucide-react'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'

export default function ReportsLayout() {
  const { pathname } = useLocation()
  const { reportsOnly } = useSubscriptionStatus()

  const reportTitleByPath: Record<string, string> = {
    '/reports/sales': 'Reporte de ventas',
    '/reports/products': 'Reporte de productos',
    '/reports/sales-by-product': 'Reporte de ventas por producto',
    '/reports/profit': 'Utilidades detallado',
    '/reports/purchases': 'Reporte de compras',
    '/reports/kardex': 'Reporte de kardex',
    '/reports/cash': 'Reporte de caja',
  }

  const headerTitle = reportTitleByPath[pathname] ?? 'Reportes'

  return (
    <div className="space-y-4">
      {reportsOnly ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Tu cuenta está restringida por falta de pago: solo puedes consultar los reportes.
          </span>
          <Link to="/subscription" className="font-semibold underline underline-offset-2">
            Regularizar mi plan
          </Link>
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
        <BarChart3 size={18} />
        <h2 className="text-lg font-bold text-gray-800">{headerTitle}</h2>
      </div>
      <Outlet />
    </div>
  )
}
