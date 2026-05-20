import { Outlet, useLocation } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'

export default function ReportsLayout() {
  const { pathname } = useLocation()

  const reportTitleByPath: Record<string, string> = {
    '/reports/sales': 'Reporte de ventas',
    '/reports/products': 'Reporte de productos',
    '/reports/sales-by-product': 'Reporte de ventas por producto',
    '/reports/purchases': 'Reporte de compras',
    '/reports/kardex': 'Reporte de kardex',
    '/reports/cash': 'Reporte de caja',
  }

  const headerTitle = reportTitleByPath[pathname] ?? 'Reportes'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
        <BarChart3 size={18} />
        <h2 className="text-lg font-bold text-gray-800">{headerTitle}</h2>
      </div>
      <Outlet />
    </div>
  )
}
