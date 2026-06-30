import { Navigate } from 'react-router-dom'
import type { ErpCompanySubTab, ErpSettingsMainTab } from '@/utils/erpSettingsAccess'

export function ErpSettingsRedirect({
  settingsTab = 'empresa',
  companyTab = 'empresa',
}: {
  settingsTab?: ErpSettingsMainTab
  companyTab?: ErpCompanySubTab
}) {
  return (
    <Navigate
      to="/ajustes"
      replace
      state={{ erpSettingsTab: settingsTab, erpCompanyTab: companyTab }}
    />
  )
}
