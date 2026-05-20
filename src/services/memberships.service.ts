import api from './api'

export type MembershipStatus = 'active' | 'paused' | 'cancelled' | 'expired'

export type BillingCycle = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

export interface Membership {
  id: number
  contact_id: number
  product_id: number | null
  branch_id: number
  title: string
  billing_cycle: BillingCycle
  billing_interval_days: number
  amount: number
  currency: string
  start_date: string
  end_date: string | null
  next_billing_date: string
  last_billed_at: string | null
  status: MembershipStatus
  notes: string
  igv_affectation_type: string
  price_includes_igv: boolean
  created_at: string
  updated_at: string
  contact_name?: string
  contact_phone?: string
  product_name?: string
}

export interface CreateMembershipInput {
  contact_id: number
  product_id?: number | null
  branch_id: number
  title?: string
  billing_cycle: BillingCycle
  billing_interval_days?: number
  amount: number
  currency?: string
  start_date: string
  end_date?: string | null
  notes?: string
  igv_affectation_type?: string
  price_includes_igv?: boolean
}

export interface UpdateMembershipInput {
  title?: string
  product_id?: number | null
  branch_id?: number
  billing_cycle?: BillingCycle
  billing_interval_days?: number
  amount?: number
  currency?: string
  end_date?: string | null
  notes?: string
  igv_affectation_type?: string
  price_includes_igv?: boolean
  next_billing_date?: string
}

export interface GenerateSaleInput {
  series_id: number
  issue_date?: string
  payment_method?: string
  payments?: { method: string; amount: number }[]
  cash_session_id?: number | null
  allow_early?: boolean
  notes?: string
}

export interface MembershipBillingRow {
  id: number
  sale_id: number
  sale_number: string
  period_start: string
  period_end: string
  created_at: string
}

export const membershipsService = {
  list: (params?: {
    status?: string
    contact_id?: number
    branch_id?: number
    q?: string
    due?: '' | 'overdue' | 'today' | 'week' | 'month'
    limit?: number
    offset?: number
  }) =>
    api
      .get<{ data: Membership[]; total: number }>('/api/memberships', { params })
      .then((r) => ({ data: r.data.data ?? [], total: r.data.total ?? 0 })),

  reminderCounts: () =>
    api
      .get<{ overdue: number; upcoming: number }>('/api/memberships/reminder-counts')
      .then((r) => r.data),

  get: (id: number) =>
    api.get<{ data: Membership }>(`/api/memberships/${id}`).then((r) => r.data.data),

  billingHistory: (id: number) =>
    api.get<{ data: MembershipBillingRow[] }>(`/api/memberships/${id}/billing-history`).then((r) => r.data.data ?? []),

  create: (body: CreateMembershipInput) =>
    api.post<{ data: Membership }>('/api/memberships', body).then((r) => r.data.data),

  update: (id: number, body: UpdateMembershipInput) =>
    api.put<{ data: Membership }>(`/api/memberships/${id}`, body).then((r) => r.data.data),

  setStatus: (id: number, status: MembershipStatus) =>
    api.patch(`/api/memberships/${id}/status`, { status }).then((r) => r.data),

  remove: (id: number) => api.delete(`/api/memberships/${id}`).then((r) => r.data),

  generateSale: (id: number, body: GenerateSaleInput) =>
    api.post<{ data: { sale: unknown; invoice: unknown } }>(`/api/memberships/${id}/generate-sale`, body).then((r) => r.data.data),
}
