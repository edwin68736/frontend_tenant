import { PdfViewerHost } from '@/components/pdf/PdfViewerHost'
import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import SupportModeBanner from '@/components/SupportModeBanner'
import { SubscriptionStatusProvider } from '@/contexts/SubscriptionStatusContext'
import { BRAND_TOP_BAR } from '@/config/branding'
import { isCapacitorNative } from '@/lib/platform/detect'
import {
  CONTENT_SAFE_BOTTOM,
  FIXED_DRAWER_LEFT_SHELL,
  SHELL_SAFE_TOP,
  SHELL_SAFE_TOP_BRAND,
} from '@/utils/safeAreaClasses'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

export default function MainLayout() {
  const nativeCapacitor = isCapacitorNative()
  /** Barra decorativa: web/Tauri desktop; oculta en Capacitor (celulares/tablets). */
  const showBrandTopBar = !nativeCapacitor
  const mobileFlush = nativeCapacitor

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('tenant_sidebar_collapsed') === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('tenant_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  return (
    <SubscriptionStatusProvider>
      <div
        className={clsx(
          'relative flex h-[100dvh] min-h-screen-safe w-full max-w-[100vw] flex-col overflow-hidden',
          nativeCapacitor ? SHELL_SAFE_TOP_BRAND : clsx('bg-green-800 pt-safe', SHELL_SAFE_TOP),
        )}
      >
        {showBrandTopBar ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-11 shrink-0 sm:h-14"
            aria-hidden
          >
            <img
              src={BRAND_TOP_BAR}
              alt=""
              className="h-full w-full object-cover object-center"
              decoding="async"
            />
          </div>
        ) : null}

        <div
          className={clsx(
            'relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-100',
            showBrandTopBar
              ? 'mt-5 rounded-t-[1.25rem] shadow-[0_-4px_20px_rgba(15,23,42,0.1)] sm:mt-6 sm:rounded-t-3xl'
              : clsx(
                  'mt-0 rounded-none shadow-none',
                  'lg:mt-2 lg:rounded-t-3xl lg:shadow-[0_-4px_20px_rgba(15,23,42,0.1)]',
                ),
          )}
        >
          <div className="flex h-full min-h-0 w-full overflow-hidden">
            {sidebarOpen ? (
              <div
                className="fixed inset-x-0 z-40 bg-gray-900/60 lg:hidden"
                style={{
                  top: 'var(--safe-top)',
                  bottom: 'var(--safe-bottom)',
                }}
                onClick={() => setSidebarOpen(false)}
                aria-hidden
              />
            ) : null}

            <div
              className={clsx(
                'hidden h-full min-h-0 shrink-0 lg:flex',
                nativeCapacitor
                  ? 'lg:px-3 lg:pt-3 lg:pb-[max(0.75rem,var(--safe-bottom))]'
                  : 'lg:p-3',
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

            {sidebarOpen ? (
              <div
                className={clsx(
                  'fixed z-50 flex min-h-0 flex-col overflow-hidden lg:hidden',
                  FIXED_DRAWER_LEFT_SHELL,
                )}
              >
                <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              </div>
            ) : null}

            <div
              className={clsx(
                'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                mobileFlush
                  ? 'gap-0 px-0 pt-0 lg:gap-4 lg:px-3 lg:pt-3'
                  : 'gap-2 px-2 pt-2 sm:px-4 md:gap-4 md:px-3 md:pt-3',
                nativeCapacitor ? CONTENT_SAFE_BOTTOM : 'pb-safe md:pb-3',
              )}
            >
              <SupportModeBanner />
              <div
                className={clsx(
                  'relative z-10 shrink-0 overflow-visible bg-white shadow-md',
                  mobileFlush ? 'rounded-none lg:rounded-2xl' : 'rounded-2xl',
                )}
              >
                <Header
                  onMenuClick={() => setSidebarOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
              </div>

              <main
                className={clsx(
                  'page-enter min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-2 shadow-md sm:p-3 md:p-4',
                  mobileFlush ? 'rounded-none lg:rounded-2xl' : 'rounded-2xl',
                )}
              >
                <Outlet />
                {/* Visor de PDF: montado una vez, se abre desde cualquier página. */}
                <PdfViewerHost />
              </main>
            </div>
          </div>
        </div>
      </div>
    </SubscriptionStatusProvider>
  )
}
