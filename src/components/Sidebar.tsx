import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  Home,
  LayoutDashboard, ShoppingCart, Receipt, Truck, Tag, Boxes,
  BookUser, Wallet, Building2, Users, Settings, LogOut,
  Utensils, FileText, X, Grid3x3, Layers, ChefHat, UserCog,
  Shield, MapPin, FileCode, ShieldCheck, ArrowRightLeft, ListOrdered, LayoutGrid,
  ChevronLeft, ChevronRight, BarChart3, CreditCard, Briefcase,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type SimpleItem = {
  id: string
  to: string
  label: string
  icon: React.ReactNode
  module?: string | null
  permission?: string | null
  exact?: boolean
}

type NavGroup = {
  id: string
  label: string
  icon: React.ReactNode
  children: SimpleItem[]
}

const SIMPLE_ITEMS: SimpleItem[] = [
  {
    id: 'home',
    to: '/home',
    label: 'Inicio',
    icon: <Home size={16} />,
  },
  {
    id: 'dashboard',
    to: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    permission: 'dashboard.view',
  },
  {
    id: 'modules',
    to: '/modules',
    label: 'Módulos',
    icon: <LayoutGrid size={16} />,
  },
  {
    id: 'contacts',
    to: '/contacts',
    label: 'Contactos',
    icon: <BookUser size={16} />,
    module: 'contacts',
    permission: 'contacts.view',
  },
]

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'ventas',
    label: 'Ventas',
    icon: <ShoppingCart size={16} />,
    children: [
      {
        id: 'membresias',
        to: '/memberships',
        label: 'Membresías',
        icon: <CreditCard size={14} />,
        module: 'memberships',
        permission: 'memberships.view',
        exact: true,
      },
      { id: 'ventas-pos', to: '/sales/pos', label: 'POS', icon: <ShoppingCart size={14} />, module: 'sales', permission: 'sales.pos' },
      {
        id: 'ventas-register',
        to: '/sales/register',
        label: 'Registrar venta',
        icon: <Receipt size={14} />,
        module: 'sales',
        permission: 'sales.view',
      },
      {
        id: 'ventas-lista',
        to: '/sales',
        label: 'Notas de venta',
        icon: <Receipt size={14} />,
        module: 'sales',
        permission: 'sales.view',
        exact: true,
      },
      { id: 'ventas-facturas', to: '/billing', label: 'Facturación', icon: <FileText size={14} />, module: 'billing', permission: 'billing.send', exact: true },
    ],
  },
  {
    id: 'doc-avanzados',
    label: 'Documentos avanzados',
    icon: <Layers size={16} />,
    children: [
      { id: 'doc-guias', to: '/billing/docs/despatches', label: 'Guías de remisión', icon: <Truck size={14} />, module: 'billing', permission: 'billing.send' },
      { id: 'doc-retenciones', to: '/billing/docs/retentions', label: 'Retenciones', icon: <Receipt size={14} />, module: 'billing', permission: 'billing.send' },
      { id: 'doc-percepciones', to: '/billing/docs/perceptions', label: 'Percepciones', icon: <Receipt size={14} />, module: 'billing', permission: 'billing.send' },
      { id: 'doc-reversiones', to: '/billing/docs/reversions', label: 'Reversiones', icon: <FileCode size={14} />, module: 'billing', permission: 'billing.send' },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    icon: <Truck size={16} />,
    children: [
      { id: 'compras-lista', to: '/purchases', label: 'Compras', icon: <Truck size={14} />, module: 'purchases', permission: 'purchases.view' },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: <Boxes size={16} />,
    children: [
      { id: 'inv-productos', to: '/products', label: 'Productos', icon: <Tag size={14} />, module: 'products', permission: 'products.view' },
      {
        id: 'inv-servicios',
        to: '/inventory/services',
        label: 'Servicios',
        icon: <Briefcase size={14} />,
        module: 'products',
        permission: 'products.view',
        exact: true,
      },
      { id: 'inv-transfers', to: '/inventory/transfers', label: 'Transferencias', icon: <ArrowRightLeft size={14} />, module: 'inventory', permission: 'inventory.manage' },
      { id: 'inv-kardex', to: '/inventory/kardex', label: 'Kardex', icon: <ListOrdered size={14} />, module: 'inventory', permission: 'inventory.view' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: <Wallet size={16} />,
    children: [
      { id: 'fin-caja', to: '/cashbank/cash', label: 'Caja', icon: <Wallet size={14} />, module: 'cashbank', permission: 'cashbank.view' },
      { id: 'fin-bancos', to: '/cashbank/bank', label: 'Cuentas / Bancos', icon: <Building2 size={14} />, module: 'cashbank', permission: 'cashbank.view' },
      { id: 'fin-metodos', to: '/cashbank/payment-methods', label: 'Métodos de pago', icon: <Wallet size={14} />, module: 'cashbank', permission: 'cashbank.manage' },
      { id: 'fin-reporte-caja', to: '/cashbank/reports', label: 'Reporte de caja', icon: <FileText size={14} />, module: 'cashbank', permission: 'reports.view' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: <BarChart3 size={16} />,
    children: [
      { id: 'rep-ventas', to: '/reports/sales', label: 'Reporte de ventas', icon: <Receipt size={14} /> },
      { id: 'rep-productos', to: '/reports/products', label: 'Reporte de productos', icon: <Tag size={14} /> },
      { id: 'rep-ventas-producto', to: '/reports/sales-by-product', label: 'Ventas por producto', icon: <BarChart3 size={14} /> },
      { id: 'rep-compras', to: '/reports/purchases', label: 'Reporte de compras', icon: <Truck size={14} /> },
      { id: 'rep-kardex', to: '/reports/kardex', label: 'Reporte de kardex', icon: <ListOrdered size={14} /> },
      { id: 'rep-caja', to: '/reports/cash', label: 'Reporte de caja', icon: <Wallet size={14} /> },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    icon: <Users size={16} />,
    children: [
      { id: 'admin-users', to: '/users', label: 'Usuarios', icon: <Users size={14} />, permission: 'users.view' },
      { id: 'admin-roles', to: '/roles', label: 'Roles y permisos', icon: <ShieldCheck size={14} />, permission: 'roles.view' },
    ],
  },
  {
    id: 'empresa',
    label: 'Empresa',
    icon: <Settings size={16} />,
    children: [
      { id: 'emp-config', to: '/company/config', label: 'Mi empresa', icon: <Settings size={14} />, permission: 'company.view' },
      { id: 'emp-sunat', to: '/company/sunat', label: 'SUNAT / IGV', icon: <Shield size={14} />, permission: 'company.view' },
      { id: 'emp-branches', to: '/company/branches', label: 'Sucursales', icon: <MapPin size={14} />, permission: 'company.view' },
      { id: 'emp-series', to: '/company/series', label: 'Series', icon: <FileCode size={14} />, permission: 'company.view' },
    ],
  },
]

interface Props {
  mobileOpen: boolean
  onClose: () => void
  /** En desktop, si true el sidebar no es fixed y queda dentro del flujo del layout (para wrapper con bordes) */
  embedded?: boolean
  /** Solo desktop: modo colapsado (mini sidebar) */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

function pathMatches(currentPath: string, to: string, exact?: boolean): boolean {
  const [pathOnly] = to.split('?')
  if (exact) return currentPath === pathOnly
  return currentPath === pathOnly || currentPath.startsWith(pathOnly + '/')
}

export default function Sidebar({ mobileOpen, onClose, embedded, collapsed, onToggleCollapsed }: Props) {
  const { user, logout, modules, hasPermission } = useAuth()
  const location = useLocation()
  const company = (window as any).__tenantName__ ?? 'Tukifac ERP'

  const isDesktop = !!embedded
  const isCollapsed = isDesktop && !!collapsed

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [flyout, setFlyout] = useState<{ groupId: string; top: number; left: number } | null>(null)
  const flyoutRef = useRef<HTMLDivElement | null>(null)

  const toggleGroup = (id: string) => {
    const group = visibleGroups.find(g => g.id === id)
    const hasActiveChild = group?.children.some(child => pathMatches(location.pathname, child.to, child.exact)) ?? false
    setOpenGroups(prev => {
      const currentlyOpen = prev[id] === true || (prev[id] !== false && hasActiveChild)
      if (currentlyOpen) {
        // Cerrar este grupo (aunque estés dentro, queda cerrado hasta que navegues o lo abras de nuevo)
        return { ...prev, [id]: false }
      }
      // Abrir solo este grupo (acordeón): marcar los demás como false para que no se abran por hasActiveChild
      const next: Record<string, boolean> = {}
      visibleGroups.forEach(g => {
        next[g.id] = g.id === id
      })
      return next
    })
  }

  // Filtrar items según módulos del JWT y permisos del rol
  const visibleSimpleItems = useMemo(
    () =>
      SIMPLE_ITEMS.filter(item => {
        const hasModuleAccess = item.module == null || modules.includes(item.module)
        const hasPermAccess = item.permission == null || hasPermission(item.permission)
        return hasModuleAccess && hasPermAccess
      }),
    [modules, hasPermission],
  )

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map(group => {
        const children = group.children.filter(child => {
          // Billing: siempre mostrar en menú (no ocultar); al entrar a la vista se muestra mensaje de actualizar plan
          const hasModuleAccess = child.module == null || child.module === 'billing' || modules.includes(child.module)
          const hasPermAccess = child.permission == null || child.module === 'billing' || hasPermission(child.permission)
          return hasModuleAccess && hasPermAccess
        })
        return { ...group, children }
      }).filter(group => group.children.length > 0),
    [modules, hasPermission],
  )

  const sidebarClass = clsx(
    'relative flex flex-col flex-shrink-0 h-full transition-transform duration-300 z-40',
    embedded
      ? 'lg:relative lg:translate-x-0 lg:!left-0 lg:!inset-y-0 lg:w-full lg:h-full'
      : 'lg:relative lg:translate-x-0',
    mobileOpen ? 'fixed inset-y-0 left-0 translate-x-0 w-64' : 'fixed inset-y-0 left-0 -translate-x-full lg:translate-x-0 w-64',
    !embedded && 'lg:fixed lg:inset-y-0 lg:left-0',
  )

  // Al cambiar de ruta, abrir solo el grupo que contiene la página actual (así Ventas se cierra al ir a Documentos avanzados)
  useEffect(() => {
    const groupWithActive = visibleGroups.find(g =>
      g.children.some(child => pathMatches(location.pathname, child.to, child.exact)),
    )
    if (groupWithActive) {
      setOpenGroups({ [groupWithActive.id]: true })
    } else {
      setOpenGroups({})
    }
  }, [location.pathname, visibleGroups])

  // Cerrar flyout al hacer click fuera
  useEffect(() => {
    if (!isCollapsed || !flyout) return
    const handleClick = (e: MouseEvent) => {
      if (!flyoutRef.current) return
      if (!flyoutRef.current.contains(e.target as Node)) {
        setFlyout(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isCollapsed, flyout])

  const flyoutNode =
    isCollapsed && flyout && typeof document !== 'undefined'
      ? createPortal(
          (() => {
            const group = visibleGroups.find(g => g.id === flyout.groupId)
            if (!group) return null
            return (
              <div
                ref={flyoutRef}
                className="fixed z-50 rounded-2xl bg-slate-900 text-white shadow-xl border border-slate-700 min-w-[220px] py-2"
                style={{ top: flyout.top, left: flyout.left }}
              >
                {group.children.map(child => (
                  <NavLink
                    key={child.id}
                    to={child.to}
                    end={!!child.exact}
                    onClick={() => {
                      onClose()
                      setFlyout(null)
                    }}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2 px-3 py-1.5 text-xs',
                        isActive ? 'bg-slate-700 text-white' : 'text-slate-100 hover:bg-slate-800',
                      )
                    }
                  >
                    {child.icon}
                    <span className="truncate">{child.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })(),
          document.body,
        )
      : null

  return (
    <>
      <aside className={clsx(sidebarClass, 'shadow-xl shadow-black/20')} style={{ background: 'var(--sidebar-bg, #0f172a)' }}>
      {/* Logo / empresa */}
      <div className={clsx('px-4 py-4 flex items-center border-b border-white/10', isCollapsed ? 'justify-center gap-2' : 'gap-3')}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ background: 'rgb(var(--p600))' }}
        >
          {company.charAt(0).toUpperCase()}
        </div>
        {!isCollapsed && (
          <span className="text-sm font-bold text-white truncate flex-1">
            {company}
          </span>
        )}
        {/* Botón cerrar (solo móvil) */}
        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white ml-auto">
          <X size={16} />
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-visible space-y-2">
        {['home', 'dashboard', 'ventas', 'doc-avanzados', 'contacts', 'inventario', 'finanzas', 'reportes', 'compras', 'administracion', 'empresa', 'modules'].map(
          (entryId) => {
            const item = visibleSimpleItems.find(i => i.id === entryId)
            if (item) {
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={!!item.exact || item.to === '/dashboard'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-xl font-medium transition-colors',
                      isCollapsed ? 'justify-center px-2 py-2 text-[13px]' : 'px-3 py-2 gap-2.5 text-[13px]',
                      isActive
                        ? 'text-white bg-[rgb(var(--p600))] shadow-md shadow-black/20'
                        : 'text-gray-300 hover:text-white hover:bg-white/10',
                    )
                  }
                  title={isCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              )
            }

            const group = visibleGroups.find(g => g.id === entryId)
            if (!group || group.children.length === 0) return null

            const hasActiveChild = group.children.some(child => pathMatches(location.pathname, child.to, child.exact))
            const isOpen = openGroups[group.id] === true || (openGroups[group.id] !== false && hasActiveChild)

            if (isCollapsed) {
              // Modo colapsado: sólo icono; el submenú se muestra como flyout fijo fuera del sidebar
              const isFlyoutOpen = flyout?.groupId === group.id
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    onClick={e => {
                      const btn = e.currentTarget as HTMLButtonElement
                      const rect = btn.getBoundingClientRect()
                      setFlyout(prev =>
                        prev && prev.groupId === group.id
                          ? null
                          : {
                              groupId: group.id,
                              top: rect.top + window.scrollY,
                              left: rect.right + 8,
                            },
                      )
                    }}
                    className={clsx(
                      'flex items-center justify-center w-full rounded-xl px-2 py-2 text-[13px] font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors',
                      (hasActiveChild || isFlyoutOpen) && 'bg-[rgb(var(--p600))] text-white shadow-md shadow-black/20',
                    )}
                    title={group.label}
                  >
                    {group.icon}
                  </button>
                </div>
              )
            }

            // Modo expandido
            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-colors',
                    hasActiveChild ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/10',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    {group.icon}
                    <span>{group.label}</span>
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                <div className={clsx('mt-1 space-y-0.5', !isOpen && 'hidden')}>
                  {group.children.map(child => (
                    <NavLink
                      key={child.id}
                      to={child.to}
                      end={!!child.exact}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-2 rounded-xl px-9 py-1.5 text-[12px] font-medium transition-colors',
                          isActive
                            ? 'bg-[rgb(var(--p600))] text-white shadow-sm shadow-black/15'
                            : 'text-gray-300 hover:text-white hover:bg-white/10',
                        )
                      }
                    >
                      {child.icon}
                      <span>{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          },
        )}
      </nav>

      {/* Usuario y logout */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className={clsx('flex items-center px-3 py-2.5 rounded-xl bg-white/10 ring-1 ring-white/10', isCollapsed ? 'justify-center gap-2' : 'gap-2.5')}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'rgb(var(--p500))' }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            className={clsx(
              'transition-colors p-1',
              isCollapsed ? 'text-gray-300 hover:text-red-400' : 'text-gray-400 hover:text-red-400',
            )}
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
      </aside>
      {flyoutNode}
    </>
  )
}
