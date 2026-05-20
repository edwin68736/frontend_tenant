import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
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
    <div className="min-h-screen w-full bg-gray-100">
      {/* Wrapper: altura mínima pantalla, puede crecer; el scroll queda en el viewport (línea roja) */}
      <div className="min-h-screen w-full flex rounded-3xl shadow-xl bg-gray-100 overflow-visible">
        {/* Overlay móvil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-900/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 1. Sidebar: altura de pantalla (100vh), no se estira con el contenido; sticky al hacer scroll */}
        <div
          className={clsx(
            'hidden lg:flex lg:flex-shrink-0 lg:self-start lg:sticky lg:top-0 lg:h-screen lg:p-3',
            sidebarCollapsed ? 'lg:w-24' : 'lg:w-72',
          )}
        >
          <div className="w-full h-full rounded-2xl overflow-hidden shadow-md flex flex-col min-h-0">
            <Sidebar
              mobileOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              embedded
              collapsed={sidebarCollapsed}
              onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
            />
          </div>
        </div>

        {/* Sidebar móvil: fuera del wrapper para overlay y drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-y-0 left-0 z-50">
            <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* 2. Contenido derecho: mismo padding vertical que el sidebar para alinear el header */}
        <div className="flex-1 flex flex-col min-w-0 gap-2 md:gap-4 pt-2 pb-2 md:pt-3 md:pb-3 px-4 md:px-3 pl-4 lg:pl-2">
          {/* Header: overflow-visible para que los dropdowns se vean fuera; z-10 para que queden por encima del contenido */}
          <div className="flex-shrink-0 rounded-2xl overflow-visible shadow-md bg-white relative z-10">
            <Header
              onMenuClick={() => setSidebarOpen(true)}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(v => !v)}
            />
          </div>

          {/* 3. Main Content: sin scroll interno; la altura la marca el contenido y scrollea toda la pantalla */}
          <main className="rounded-2xl shadow-md bg-white p-2 md:p-4 page-enter">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
