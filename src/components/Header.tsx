import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Menu,
  Bell,
  User,
  LogOut,
  ChevronDown,
  PanelLeft,
  PanelLeftClose,
  FileText,
  AlertCircle,
  XCircle,
  CreditCard,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { billingService } from '@/services/billing.service'
import { membershipsService } from '@/services/memberships.service'
import SubscriptionHeaderWidget from '@/components/SubscriptionHeaderWidget'
import HeaderQuickActions from '@/components/HeaderQuickActions'
import { BranchSwitcherUserMenu } from '@/components/BranchSwitcher'

interface Props {
  onMenuClick: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export default function Header({ onMenuClick, sidebarCollapsed, onToggleSidebar }: Props) {
  const { user, logout, hasModule } = useAuth()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [billingCounts, setBillingCounts] = useState<{ pending: number; error: number; rejected: number } | null>(null)
  const [membershipReminderCounts, setMembershipReminderCounts] = useState<{
    overdue: number
    upcoming: number
  } | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hasModule('billing')) {
      billingService.getNotificationCounts().then(setBillingCounts).catch(() => setBillingCounts(null))
    } else {
      setBillingCounts(null)
    }
  }, [hasModule])

  useEffect(() => {
    if (hasModule('memberships')) {
      membershipsService
        .reminderCounts()
        .then(setMembershipReminderCounts)
        .catch(() => setMembershipReminderCounts(null))
    } else {
      setMembershipReminderCounts(null)
    }
  }, [hasModule])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    setUserMenuOpen(false)
    logout()
  }

  const billingBadgeTotal =
    billingCounts != null
      ? billingCounts.pending + billingCounts.error + billingCounts.rejected
      : 0
  const memOver = membershipReminderCounts?.overdue ?? 0
  const memUp = membershipReminderCounts?.upcoming ?? 0
  const memBadgeTotal = memOver + memUp
  const notifBadgeTotal = billingBadgeTotal + memBadgeTotal

  return (
    <header className="bg-white border-b border-gray-100/80 px-4 py-1.5 flex items-center gap-2 sm:gap-3 flex-shrink-0 min-h-[3.25rem] rounded-2xl">
      {/* Toggle sidebar (móvil) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl hover:bg-primary-50 text-gray-500 hover:text-primary-700 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Toggle sidebar (desktop) */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="hidden lg:inline-flex items-center justify-center p-2 rounded-xl hover:bg-primary-50 text-gray-500 hover:text-primary-700 mr-1 transition-colors"
        title={sidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
      >
        {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
        <HeaderQuickActions />
        <SubscriptionHeaderWidget />
      </div>

      {/* Notificaciones */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => setNotifOpen((o) => !o)}
          className="p-2 rounded-xl hover:bg-primary-50 text-gray-600 hover:text-primary-700 relative transition-colors"
          title="Notificaciones"
        >
          <Bell size={20} />
          {notifBadgeTotal > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {notifBadgeTotal}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="fixed left-4 right-4 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-80 rounded-2xl border border-gray-100 bg-white shadow-xl ring-1 ring-black/5 py-2 max-h-[70vh] overflow-y-auto">
            {billingCounts &&
            (billingCounts.pending > 0 || billingCounts.error > 0 || billingCounts.rejected > 0) ? (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
                  Facturación electrónica
                </div>
                {billingCounts.pending > 0 && (
                  <Link
                    to="/billing?status=pending"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FileText size={18} className="text-amber-500 flex-shrink-0" />
                    <span>{billingCounts.pending} comprobante(s) pendientes de envío</span>
                  </Link>
                )}
                {billingCounts.error > 0 && (
                  <Link
                    to="/billing?status=error"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <AlertCircle size={18} className="text-orange-500 flex-shrink-0" />
                    <span>{billingCounts.error} comprobante(s) con error de envío</span>
                  </Link>
                )}
                {billingCounts.rejected > 0 && (
                  <Link
                    to="/billing?status=rejected"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <XCircle size={18} className="text-red-500 flex-shrink-0" />
                    <span>{billingCounts.rejected} comprobante(s) rechazados por SUNAT</span>
                  </Link>
                )}
              </>
            ) : null}
            {membershipReminderCounts != null && (memOver > 0 || memUp > 0) ? (
              <>
                <div
                  className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100 ${
                    billingCounts &&
                    (billingCounts.pending > 0 || billingCounts.error > 0 || billingCounts.rejected > 0)
                      ? 'mt-1'
                      : ''
                  }`}
                >
                  Membresías
                </div>
                {memOver > 0 && (
                  <Link
                    to="/memberships?due=overdue"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <CreditCard size={18} className="text-red-600 flex-shrink-0" />
                    <span>
                      {memOver} membresía(s) con cobro vencido (pendiente de pago)
                    </span>
                  </Link>
                )}
                {memUp > 0 && (
                  <Link
                    to="/memberships?due=week"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <CreditCard size={18} className="text-amber-600 flex-shrink-0" />
                    <span>
                      {memUp} membresía(s) con próximo cobro en los próximos 7 días
                    </span>
                  </Link>
                )}
              </>
            ) : null}
            {notifBadgeTotal === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">Sin notificaciones</div>
            )}
          </div>
        )}
      </div>

      {/* Usuario: dropdown Perfil + Cerrar sesión */}
      <div className="relative flex items-center" ref={userMenuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex items-center gap-2 p-1.5 pr-2 rounded-xl hover:bg-primary-50 text-gray-700 ring-1 ring-transparent hover:ring-primary-100 transition-all"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'rgb(var(--p600))' }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
            {user?.name}
          </span>
          <ChevronDown size={16} className="text-gray-500 flex-shrink-0" />
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl border border-gray-100 bg-white shadow-xl ring-1 ring-black/5 py-1.5 z-50">
            <BranchSwitcherUserMenu onClose={() => setUserMenuOpen(false)} />
            <Link
              to="/profile"
              onClick={() => setUserMenuOpen(false)}
              className="flex items-center gap-2 mx-1.5 px-3 py-2.5 text-sm text-gray-700 rounded-xl hover:bg-primary-50 hover:text-primary-800 transition-colors"
            >
              <User size={16} className="text-primary-600" />
              Perfil
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 w-[calc(100%-0.75rem)] mx-1.5 px-3 py-2.5 text-sm text-gray-700 rounded-xl hover:bg-red-50 hover:text-red-700 text-left transition-colors"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
