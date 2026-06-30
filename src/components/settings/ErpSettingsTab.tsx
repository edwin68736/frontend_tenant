import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ErpCompanySettings } from '@/components/settings/erp/ErpCompanySettings'
import { ReceiptWalletSettings } from '@/components/company/ReceiptWalletSettings'
import CompanySunatPage from '@/pages/company/CompanySunatPage'
import CompanyBranchesPage from '@/pages/company/CompanyBranchesPage'
import CompanySeriesPage from '@/pages/company/CompanySeriesPage'
import type { ErpCompanySubTab, ErpSettingsLocationState } from '@/utils/erpSettingsAccess'

const TABS: { id: ErpCompanySubTab; label: string }[] = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'comprobantes', label: 'Comprobantes' },
  { id: 'impuestos', label: 'Impuestos' },
  { id: 'sucursales', label: 'Sucursales' },
  { id: 'series', label: 'Series' },
]

export function ErpSettingsTab() {
  const location = useLocation()
  const navTab = (location.state as ErpSettingsLocationState | null)?.erpCompanyTab
  const [tab, setTab] = useState<ErpCompanySubTab>(navTab ?? 'empresa')

  useEffect(() => {
    if (navTab) setTab(navTab)
  }, [navTab])

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap ${
              tab === t.id
                ? 'bg-[rgb(var(--p600))] text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'empresa' && <ErpCompanySettings />}
      {tab === 'comprobantes' && <ReceiptWalletSettings />}
      {tab === 'impuestos' && <CompanySunatPage />}
      {tab === 'sucursales' && <CompanyBranchesPage />}
      {tab === 'series' && <CompanySeriesPage />}
    </div>
  )
}
