import axios from 'axios'
import { bindTenantFromRuc, getTenantBinding, wipeTenantBinding } from '@/lib/tenantBinding/store'
import { toStoredTenant } from '@/lib/tenantBinding/types'
import type { TenantByRucResponse } from '@/lib/tenantBinding/types'
import { getCentralApiRequestBaseUrl } from '@/config/apiBaseUrl'

export type { TenantByRucResponse }

export type StoredTenant = {
  slug: string
  name: string
  ruc: string
  apiUrl: string
  tokenConsultaDatos: string
}

const publicApi = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

publicApi.interceptors.request.use((config) => {
  config.baseURL = getCentralApiRequestBaseUrl()
  return config
})

export function getStoredTenant(): StoredTenant | null {
  const binding = getTenantBinding()
  return binding ? toStoredTenant(binding) : null
}

export async function storeTenant(data: TenantByRucResponse, ruc: string) {
  await bindTenantFromRuc(data, ruc)
}

export async function clearStoredTenant() {
  await wipeTenantBinding()
}

export const publicService = {
  getTenantByRuc: (ruc: string) =>
    publicApi
      .get<TenantByRucResponse>('/api/public/tenant-by-ruc', {
        params: { ruc: ruc.replace(/\D/g, '').trim() },
      })
      .then((r) => r.data),
}
