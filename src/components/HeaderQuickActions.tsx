import { Link } from 'react-router-dom'
import { FileText, Receipt, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type Action = {
  id: string
  label: string
  title: string
  to: string
  icon: React.ReactNode
  show: boolean
}

export default function HeaderQuickActions() {
  const { hasModule, hasPermission } = useAuth()

  const canRegister = hasModule('sales') && hasPermission('sales.view')
  const canPos = hasModule('sales') && hasPermission('sales.pos')

  const actions: Action[] = [
    {
      id: 'nc',
      label: 'NC',
      title: 'Nuevo comprobante (Boleta)',
      to: '/sales/register?tipo=03',
      icon: <FileText size={18} strokeWidth={1.75} />,
      show: canRegister,
    },
    {
      id: 'nv',
      label: 'NV',
      title: 'Nota de venta',
      to: '/sales/register?tipo=00',
      icon: <Receipt size={18} strokeWidth={1.75} />,
      show: canRegister,
    },
    {
      id: 'pos',
      label: 'POS',
      title: 'Punto de venta',
      to: '/sales/pos',
      icon: <ShoppingCart size={18} strokeWidth={1.75} />,
      show: canPos,
    },
  ].filter(a => a.show)

  if (actions.length === 0) return null

  return (
    <>
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {actions.map(a => (
          <Link
            key={a.id}
            to={a.to}
            title={a.title}
            className="group flex flex-col items-center justify-center gap-0 px-1 py-0.5 text-gray-800 hover:text-primary-700 transition-colors min-w-[2.25rem]"
          >
            <span className="leading-none text-gray-700 group-hover:text-primary-700">{a.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide underline underline-offset-2 decoration-gray-800 group-hover:decoration-primary-700 leading-tight mt-0.5">
              {a.label}
            </span>
          </Link>
        ))}
      </div>
      <div className="hidden sm:block w-px h-8 bg-gray-200/90 shrink-0" aria-hidden />
    </>
  )
}
