import api from './api'

export interface TenantUser {
  id: number
  name: string
  email: string
  role_id: number
  role_name?: string
  branch_id: number | null
  branch_name?: string
  branch_ids?: number[]
  branch_names?: string[]
  active: boolean
}

export interface Role {
  id: number
  name: string
  description: string
}

export interface RoleDetail extends Role {
  permission_ids: number[]
}

export interface Permission {
  id: number
  name: string
  module: string
  action: string
  label?: string
}

export const usersService = {
  listUsers: (q = '', role_id?: number): Promise<TenantUser[]> =>
    api.get('/api/users', { params: { q, role_id } }).then(r => r.data.data ?? []),

  getUser: (id: number) =>
    api.get(`/api/users/${id}`).then(r => r.data.data ?? r.data),

  createUser: (data: {
    name: string
    email: string
    password: string
    role_id: number
    branch_id?: number
    branch_ids?: number[]
  }) => api.post('/api/users', data).then(r => r.data.data ?? r.data),

  updateUser: (
    id: number,
    data: {
      name?: string
      email?: string
      password?: string
      role_id?: number
      branch_id?: number | null
      branch_ids?: number[]
      active?: boolean
    },
  ) => api.put(`/api/users/${id}`, data).then(r => r.data),

  deleteUser: (id: number) =>
    api.delete(`/api/users/${id}`).then(r => r.data),

  toggleUser: (id: number) =>
    api.patch(`/api/users/${id}/toggle`).then(r => r.data),

  listRoles: (): Promise<Role[]> =>
    api.get('/api/roles').then(r => r.data.data ?? []),

  getRole: (id: number): Promise<RoleDetail> =>
    api.get(`/api/roles/${id}`).then(r => {
      const d = r.data as { data?: Role; permission_ids?: number[] }
      const role = d?.data ?? d
      return { ...role, permission_ids: Array.isArray(d?.permission_ids) ? d.permission_ids : [] } as RoleDetail
    }),

  createRole: (data: { name: string; description?: string; permission_ids?: number[] }) =>
    api.post('/api/roles', data).then(r => r.data),

  updateRole: (id: number, data: { name?: string; description?: string; permission_ids?: number[] }) =>
    api.put(`/api/roles/${id}`, data).then(r => r.data),

  deleteRole: (id: number) =>
    api.delete(`/api/roles/${id}`).then(r => r.data),

  listPermissions: (): Promise<Permission[]> =>
    api.get('/api/permissions').then(r => r.data.data ?? []),
}
