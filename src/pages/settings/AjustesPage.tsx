import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PosPrintersSettings } from '@/components/settings/PosPrintersSettings'
import { DevServerSettings } from '@/components/settings/DevServerSettings'
import { ErpSettingsTab } from '@/components/settings/ErpSettingsTab'
import UsersPage from '@/pages/users/UsersPage'
import { isDevelopmentMode } from '@/lib/runtime/environment'
import {
  canAccessErpSettings,
  canConfigureErpDevicePrinters,
  canManageErpCompany,
  canManageErpUsers,
  type ErpSettingsLocationState,
  type ErpSettingsMainTab,
} from '@/utils/erpSettingsAccess'

export default function AjustesPage() {
  const { hasPermission } = useAuth()
  const location = useLocation()
  const canCompany = canManageErpCompany(hasPermission)
  const canUsers = canManageErpUsers(hasPermission)
  const canPrinters = canConfigureErpDevicePrinters()

  const availableTabs = useMemo(
    () =>
      (
        [
          { id: 'empresa', label: 'Empresa', show: canCompany },
          { id: 'usuarios', label: 'Usuarios', show: canUsers },
          { id: 'impresoras', label: 'Impresoras', show: canPrinters },
        ] as { id: ErpSettingsMainTab; label: string; show: boolean }[]
      ).filter((t) => t.show),
    [canCompany, canUsers, canPrinters],
  )

  const navState = location.state as ErpSettingsLocationState | null

  const defaultTab = useMemo((): ErpSettingsMainTab => {
    const requested = navState?.erpSettingsTab
    if (requested && availableTabs.some((t) => t.id === requested)) return requested
    return availableTabs[0]?.id ?? 'empresa'
  }, [availableTabs, navState?.erpSettingsTab])

  const [tab, setTab] = useState<ErpSettingsMainTab>(defaultTab)
  const activeTab: ErpSettingsMainTab = availableTabs.some((t) => t.id === tab)
    ? tab
    : (availableTabs[0]?.id ?? 'empresa')
  const printersOnly = canPrinters && !canCompany && !canUsers

  useEffect(() => {
    if (navState?.erpSettingsTab) setTab(defaultTab)
  }, [defaultTab, navState?.erpSettingsTab])

  if (!canAccessErpSettings(hasPermission)) {
    return <Navigate to="/home" replace />
  }

  return (
    <div className="w-full min-w-0 flex flex-col">
      <div className="w-full min-w-0 pb-4 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-gray-900">
              {printersOnly ? 'Impresoras del equipo' : 'Ajustes'}
            </h1>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-600 hidden sm:block">
              {printersOnly
                ? 'Configure la impresora de comprobantes en este dispositivo (Windows o Android).'
                : 'Configuración de la empresa, usuarios y del equipo local.'}
            </p>
          </div>
        </div>

        {availableTabs.length > 1 && (
          <div className="mt-3 sm:mt-5 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            {availableTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold ${
                  activeTab === t.id
                    ? 'bg-[rgb(var(--p600))] text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {isDevelopmentMode() && (
          <div className="mt-3 sm:mt-5">
            <DevServerSettings />
          </div>
        )}

        <div className="mt-3 sm:mt-5">
          {activeTab === 'empresa' && canCompany && <ErpSettingsTab />}
          {activeTab === 'usuarios' && canUsers && <UsersPage />}
          {activeTab === 'impresoras' && canPrinters && <PosPrintersSettings />}
        </div>
      </div>
    </div>
  )
}
