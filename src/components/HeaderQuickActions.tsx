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
      title: 'Nuevo comprobante (Boleta / Factura)',
      to: '/sales/register',
      icon: <FileText size={18} strokeWidth={1.75} />,
      show: canRegister,
    },
    {
      id: 'nv',
      label: 'NV',
      title: 'Registrar nota de venta',
      to: '/sales/nota-venta',
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
      {/* Atajos compactos: en móvil compiten con el menú, la campana y la cuenta, así que
          son botones táctiles (44px) sin subrayado en vez de enlaces sueltos. */}
      <div className="flex items-center gap-0.5 shrink-0 md:gap-1">
        {actions.map(a => (
          <Link
            key={a.id}
            to={a.to}
            title={a.title}
            aria-label={a.title}
            className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl px-1 text-gray-700 transition-colors hover:bg-primary-50 hover:text-primary-700 active:scale-95"
          >
            <span className="leading-none">{a.icon}</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-wide">
              {a.label}
            </span>
          </Link>
        ))}
      </div>
      <div className="hidden md:block w-px h-8 bg-gray-200/90 shrink-0" aria-hidden />
    </>
  )
}
