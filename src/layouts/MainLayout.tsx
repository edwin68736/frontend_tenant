import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import SupportModeBanner from '@/components/SupportModeBanner'
import { SubscriptionStatusProvider } from '@/contexts/SubscriptionStatusContext'
import { BRAND_TOP_BAR } from '@/config/branding'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('tenant_sidebar_collapsed') === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('tenant_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  return (
    <SubscriptionStatusProvider>
      <div className="relative flex h-[100dvh] min-h-screen-safe w-full max-w-[100vw] flex-col overflow-hidden bg-green-800 pt-safe">
        {/* Barra horizontal detrás del layout */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-11 shrink-0 sm:h-14" aria-hidden>
          <img
            src={BRAND_TOP_BAR}
            alt=""
            className="h-full w-full object-cover object-center"
            decoding="async"
          />
        </div>

        {/* Panel principal: altura fija al viewport (no crece con el contenido) */}
        <div className="relative z-10 mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.25rem] bg-gray-100 shadow-[0_-4px_20px_rgba(15,23,42,0.1)] sm:mt-6 sm:rounded-t-3xl">
          <div className="flex h-full min-h-0 w-full overflow-hidden">
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-gray-900/60 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar desktop: altura = panel, no altura del contenido */}
            <div
              className={clsx(
                'hidden h-full min-h-0 shrink-0 lg:flex lg:p-3',
                sidebarCollapsed ? 'lg:w-24' : 'lg:w-72',
              )}
            >
              <div className="h-full min-h-0 w-full overflow-hidden rounded-2xl shadow-md">
                <Sidebar
                  mobileOpen={sidebarOpen}
                  onClose={() => setSidebarOpen(false)}
                  embedded
                  collapsed={sidebarCollapsed}
                  onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
                />
              </div>
            </div>

            {sidebarOpen && (
              <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
                <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              </div>
            )}

            {/* Contenido: scroll interno */}
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-safe pt-2 sm:px-4 md:gap-4 md:px-3 md:pb-3 md:pt-3 pl-2 lg:pl-2">
              <SupportModeBanner />
              <div className="relative z-10 shrink-0 overflow-visible rounded-2xl bg-white shadow-md">
                <Header
                  onMenuClick={() => setSidebarOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
              </div>

              <main className="page-enter min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-2 shadow-md sm:p-3 md:p-4">
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </div>
    </SubscriptionStatusProvider>
  )
}
