import api from './api'

export interface GreCarrier {
  id: number
  doc_type: string
  doc_number: string
  business_name: string
  fiscal_address: string
  mtc_number: string
  is_default: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface GreDriver {
  id: number
  doc_type: string
  doc_number: string
  full_name: string
  license_number: string
  phone: string
  carrier_id?: number | null
  is_default: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface GreVehicle {
  id: number
  plate: string
  brand: string
  model: string
  habilitation_cert: string
  carrier_id?: number | null
  is_default: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface GreFleetDefaults {
  carrier?: GreCarrier
  driver?: GreDriver
  vehicle?: GreVehicle
}

export const fleetService = {
  defaults: (): Promise<GreFleetDefaults> =>
    api.get<{ data: GreFleetDefaults }>('/api/fleet/defaults').then((r) => r.data.data),

  listCarriers: (params?: { q?: string; active_only?: boolean }): Promise<GreCarrier[]> =>
    api
      .get<{ data: GreCarrier[] }>('/api/fleet/carriers', {
        params: { q: params?.q, active_only: params?.active_only ? '1' : undefined },
      })
      .then((r) => r.data.data ?? []),

  createCarrier: (body: Partial<GreCarrier>): Promise<GreCarrier> =>
    api.post<{ data: GreCarrier }>('/api/fleet/carriers', body).then((r) => r.data.data),

  updateCarrier: (id: number, body: Partial<GreCarrier>): Promise<GreCarrier> =>
    api.put<{ data: GreCarrier }>(`/api/fleet/carriers/${id}`, body).then((r) => r.data.data),

  toggleCarrier: (id: number): Promise<void> =>
    api.patch(`/api/fleet/carriers/${id}/toggle`).then(() => undefined),

  listDrivers: (params?: { q?: string; active_only?: boolean; carrier_id?: number }): Promise<GreDriver[]> =>
    api
      .get<{ data: GreDriver[] }>('/api/fleet/drivers', {
        params: {
          q: params?.q,
          active_only: params?.active_only ? '1' : undefined,
          carrier_id: params?.carrier_id,
        },
      })
      .then((r) => r.data.data ?? []),

  createDriver: (body: Partial<GreDriver>): Promise<GreDriver> =>
    api.post<{ data: GreDriver }>('/api/fleet/drivers', body).then((r) => r.data.data),

  updateDriver: (id: number, body: Partial<GreDriver>): Promise<GreDriver> =>
    api.put<{ data: GreDriver }>(`/api/fleet/drivers/${id}`, body).then((r) => r.data.data),

  toggleDriver: (id: number): Promise<void> =>
    api.patch(`/api/fleet/drivers/${id}/toggle`).then(() => undefined),

  listVehicles: (params?: { q?: string; active_only?: boolean; carrier_id?: number }): Promise<GreVehicle[]> =>
    api
      .get<{ data: GreVehicle[] }>('/api/fleet/vehicles', {
        params: {
          q: params?.q,
          active_only: params?.active_only ? '1' : undefined,
          carrier_id: params?.carrier_id,
        },
      })
      .then((r) => r.data.data ?? []),

  createVehicle: (body: Partial<GreVehicle>): Promise<GreVehicle> =>
    api.post<{ data: GreVehicle }>('/api/fleet/vehicles', body).then((r) => r.data.data),

  updateVehicle: (id: number, body: Partial<GreVehicle>): Promise<GreVehicle> =>
    api.put<{ data: GreVehicle }>(`/api/fleet/vehicles/${id}`, body).then((r) => r.data.data),

  toggleVehicle: (id: number): Promise<void> =>
    api.patch(`/api/fleet/vehicles/${id}/toggle`).then(() => undefined),
}
