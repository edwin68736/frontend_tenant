import api from './api'
import type { AuthUser } from './auth.service'

export interface UserProfile {
  id: number
  name: string
  email: string
  phone: string
  role_id: number
  role_name: string
  branch_id: number | null
  branch_name: string
  active: boolean
  created_at?: string
}

export interface UpdateProfilePayload {
  name: string
  email: string
  phone?: string
}

export const profileService = {
  getMe: (): Promise<UserProfile> =>
    api.get('/api/profile/me').then((r) => r.data.data),

  updateMe: (data: UpdateProfilePayload): Promise<{ user: AuthUser }> =>
    api.put('/api/profile/me', data).then((r) => ({
      user: r.data.user as AuthUser,
    })),

  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/api/profile/me/password', data).then((r) => r.data),
}
