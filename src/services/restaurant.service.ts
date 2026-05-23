import api from './api'

export interface Floor {
  id: number
  name: string
  description: string
  active: boolean
}

export interface RestaurantTable {
  id: number
  floor_id: number
  floor_name?: string
  name: string
  capacity: number
  status: 'libre' | 'ocupada' | 'en_consumo' | 'reservada'
  active: boolean
}

export interface RestaurantStaffRow {
  id: number
  user_id: number
  employee_type: string
  staff_code?: string
  display_name?: string
  is_active: boolean
  has_pin: boolean
}

export interface ExternalModuleConfig {
  key: string
  name: string
  base_url: string
  api_key: string
  enabled: boolean
  config_json?: string
}

export const EMPLOYEE_TYPES = [
  { value: '', label: 'Sin acceso restaurante' },
  { value: 'admin', label: 'Administrador' },
  { value: 'cashier', label: 'Cajero' },
  { value: 'waiter', label: 'Mozo' },
  { value: 'cook', label: 'Cocinero' },
  { value: 'driver', label: 'Repartidor / Delivery' },
] as const

export const restaurantService = {
  listFloors: (): Promise<Floor[]> =>
    api.get('/api/restaurant/floors').then(r => r.data.data ?? r.data ?? []),

  createFloor: (data: { name: string; description?: string }) =>
    api.post('/api/restaurant/floors', data).then(r => r.data.data ?? r.data),

  updateFloor: (id: number, data: { name?: string; description?: string }) =>
    api.put(`/api/restaurant/floors/${id}`, data).then(r => r.data),

  deleteFloor: (id: number) =>
    api.delete(`/api/restaurant/floors/${id}`).then(r => r.data),

  listTables: (floor_id?: number): Promise<RestaurantTable[]> =>
    api.get('/api/restaurant/tables', { params: { floor_id } }).then(r => r.data.data ?? r.data ?? []),

  createTable: (data: { floor_id: number; name: string; capacity: number }) =>
    api.post('/api/restaurant/tables', data).then(r => r.data.data ?? r.data),

  updateTable: (id: number, data: { floor_id?: number; name?: string; capacity?: number; active?: boolean }) =>
    api.put(`/api/restaurant/tables/${id}`, data).then(r => r.data),

  deleteTable: (id: number) =>
    api.delete(`/api/restaurant/tables/${id}`).then(r => r.data),

  getSettings: (): Promise<{ has_deletion_pin: boolean }> =>
    api.get('/api/restaurant/settings').then(r => r.data),

  updateSettings: (data: { deletion_pin: string }) =>
    api.put('/api/restaurant/settings', data).then(r => r.data),

  getExternalModule: (key: string): Promise<ExternalModuleConfig | null> =>
    api.get(`/api/modules/${key}/ping`).then(r => r.data).catch(() => null),

  registerExternalModule: (data: { key: string; name: string; base_url: string; api_key: string }) =>
    api.post('/api/modules/register', data).then(r => r.data),

  toggleModule: (key: string, enabled: boolean) =>
    api.post(`/api/modules/${key}/toggle`, { enabled }).then(r => r.data),

  listStaff: (): Promise<RestaurantStaffRow[]> =>
    api.get('/api/restaurant/staff').then(r => r.data.data ?? r.data ?? []),

  setUserStaff: (
    userId: number,
    body: {
      employee_type: string
      pin?: string
      clear_pin?: boolean
      staff_code?: string
      display_name?: string
    },
  ) => api.put<{ success: boolean; has_pin?: boolean }>(`/api/restaurant/users/${userId}/staff`, body).then(r => r.data),
}

export const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  cashier: 'Cajero',
  waiter: 'Mozo',
  cook: 'Cocinero',
  driver: 'Delivery',
  supervisor: 'Supervisor',
}
