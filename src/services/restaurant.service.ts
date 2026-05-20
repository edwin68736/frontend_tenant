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

export interface Waiter {
  id: number
  name: string
  code: string
  active: boolean
}

export interface ExternalModuleConfig {
  key: string
  name: string
  base_url: string
  api_key: string
  enabled: boolean
  config_json?: string
}

export const restaurantService = {
  // Pisos
  listFloors: (): Promise<Floor[]> =>
    api.get('/api/restaurant/floors').then(r => r.data.data ?? r.data ?? []),

  createFloor: (data: { name: string; description?: string }) =>
    api.post('/api/restaurant/floors', data).then(r => r.data.data ?? r.data),

  updateFloor: (id: number, data: { name?: string; description?: string }) =>
    api.put(`/api/restaurant/floors/${id}`, data).then(r => r.data),

  deleteFloor: (id: number) =>
    api.delete(`/api/restaurant/floors/${id}`).then(r => r.data),

  // Mesas
  listTables: (floor_id?: number): Promise<RestaurantTable[]> =>
    api.get('/api/restaurant/tables', { params: { floor_id } }).then(r => r.data.data ?? r.data ?? []),

  createTable: (data: { floor_id: number; name: string; capacity: number }) =>
    api.post('/api/restaurant/tables', data).then(r => r.data.data ?? r.data),

  updateTable: (id: number, data: { floor_id?: number; name?: string; capacity?: number; active?: boolean }) =>
    api.put(`/api/restaurant/tables/${id}`, data).then(r => r.data),

  deleteTable: (id: number) =>
    api.delete(`/api/restaurant/tables/${id}`).then(r => r.data),

  // Mozos
  listWaiters: (): Promise<Waiter[]> =>
    api.get('/api/restaurant/waiters').then(r => r.data.data ?? r.data ?? []),

  createWaiter: (data: { name: string; code: string }) =>
    api.post('/api/restaurant/waiters', data).then(r => r.data.data ?? r.data),

  updateWaiter: (id: number, data: { name?: string; code?: string; active?: boolean }) =>
    api.put(`/api/restaurant/waiters/${id}`, data).then(r => r.data),

  deleteWaiter: (id: number) =>
    api.delete(`/api/restaurant/waiters/${id}`).then(r => r.data),

  getSettings: (): Promise<{ has_deletion_pin: boolean }> =>
    api.get('/api/restaurant/settings').then(r => r.data),

  updateSettings: (data: { deletion_pin: string }) =>
    api.put('/api/restaurant/settings', data).then(r => r.data),

  // Config del módulo externo
  getExternalModule: (key: string): Promise<ExternalModuleConfig | null> =>
    api.get(`/api/modules/${key}/ping`).then(r => r.data).catch(() => null),

  registerExternalModule: (data: { key: string; name: string; base_url: string; api_key: string }) =>
    api.post('/api/modules/register', data).then(r => r.data),

  toggleModule: (key: string, enabled: boolean) =>
    api.post(`/api/modules/${key}/toggle`, { enabled }).then(r => r.data),

  // Roles operativos del restaurante (solo para tenants con módulo restaurant)
  listRestaurantRoleAssignments: (): Promise<Record<string, string>> =>
    api.get('/api/restaurant/roles/assignments').then(r => r.data.data ?? r.data ?? {}),

  setUserRestaurantRole: (userId: number, role: string) =>
    api.put(`/api/restaurant/users/${userId}/restaurant-role`, { role }).then(r => r.data),
}
