import api from './api'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

export interface ContactPerson {
  id?: number
  contact_id?: number
  name: string
  phone?: string
  email?: string
  relationship?: string
}

export interface Contact {
  id: number
  type: 'customer' | 'supplier' | 'both'
  doc_type: string
  doc_number: string
  business_name: string
  trade_name: string
  address: string
  ubigeo: string
  phone: string
  email: string
  photo_url?: string
  contact_persons?: ContactPerson[]
  es_agente_de_retencion?: boolean
  es_agente_de_percepcion?: boolean
  es_agente_de_percepcion_combustible?: boolean
  es_buen_contribuyente?: boolean
  active: boolean
}

export interface ContactPersonInput {
  name: string
  phone?: string
  email?: string
  relationship?: string
}

export interface CreateContactInput {
  type: 'customer' | 'supplier' | 'both'
  doc_type: string
  doc_number: string
  business_name: string
  trade_name?: string
  address?: string
  ubigeo?: string
  phone?: string
  email?: string
  photo_url?: string
  contact_persons?: ContactPersonInput[]
  es_agente_de_retencion?: boolean
  es_agente_de_percepcion?: boolean
  es_agente_de_percepcion_combustible?: boolean
  es_buen_contribuyente?: boolean
}

export type ContactBulkImportResult = {
  created: number
  updated: number
  failed: { row: number; name: string; error: string }[]
}

export const contactsService = {
  /** Alta masiva desde Excel. Si el documento ya existe, actualiza en vez de duplicar. */
  bulkImport: (items: unknown[]) =>
    api
      .post<{ success: boolean; data: ContactBulkImportResult }>('/api/contacts/bulk-import', { items })
      .then((r) => r.data.data),

  list: (q = '', type = '', status: 'active' | 'inactive' | 'all' = 'active') =>
    api.get<{ data?: Contact[] }>('/api/contacts', {
      params: { q, type: type || undefined, status: status === 'active' ? undefined : status },
    }).then(r => {
      const raw = r.data
      return Array.isArray(raw) ? raw : (raw?.data ?? [])
    }),

  getDefault: (): Promise<Contact | null> =>
    api.get<{ data: Contact }>('/api/contacts/default').then(r => r.data?.data ?? null).catch(() => null),

  get: (id: number) =>
    api.get<{ data: Contact }>(`/api/contacts/${id}`).then(r => r.data.data ?? r.data),

  create: (data: CreateContactInput) =>
    api.post<{ data: Contact }>('/api/contacts', data).then(r => r.data.data),

  update: (id: number, data: Partial<CreateContactInput>) =>
    api.put<{ data: Contact }>(`/api/contacts/${id}`, data).then(r => r.data.data ?? r.data),

  delete: (id: number) =>
    api.delete(`/api/contacts/${id}`).then(r => r.data),

  toggle: (id: number) =>
    api.patch(`/api/contacts/${id}/toggle`).then(r => r.data),

  uploadPhoto: (contactId: number, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api
      .post<{ photo_url: string }>(`/api/contacts/${contactId}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.photo_url)
  },
}

export function getContactPhotoUrl(url: string | null | undefined): string {
  return resolvePublicAssetUrl(url)
}
