import { EMPLOYEE_TYPES } from '@/services/restaurant.service'
import type { ModuleProfileSummary, RestaurantStaffState } from './types'

export function restaurantProfileSummary(
  staff: RestaurantStaffState | undefined,
): ModuleProfileSummary {
  if (!staff?.employeeType) {
    return { configured: false, primary: 'Sin perfil' }
  }
  const label =
    EMPLOYEE_TYPES.find(t => t.value === staff.employeeType)?.label ?? staff.employeeType
  return {
    configured: true,
    primary: label,
    secondary: staff.hasPin ? 'PIN configurado' : 'Sin PIN',
  }
}
