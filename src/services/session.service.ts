import api from './api'

export type BranchBrief = {
  id: number
  name: string
  is_main?: boolean
}

export type SessionContextResponse = {
  active_branch: BranchBrief | null
  can_switch_branch: boolean
  allowed_branches?: BranchBrief[]
  /** Reservado para el backend (Fase 2): el usuario puede consultar "todas las sucursales" (solo lectura). */
  can_view_all?: boolean
  branch_session_version: number
}

export type SwitchBranchResponse = {
  token: string
  /** Si el servidor lo emite, reemplaza al refresh token guardado (si no, el viejo seguiría ligado a la sucursal anterior). */
  refresh_token?: string
  can_view_all?: boolean
  active_branch: BranchBrief
  can_switch_branch: boolean
  allowed_branches?: BranchBrief[]
}

export const sessionService = {
  getContext: () =>
    api.get<SessionContextResponse>('/api/session/context').then((r) => r.data),

  switchBranch: (branchId: number) =>
    api
      .post<SwitchBranchResponse>('/api/session/switch-branch', { branch_id: branchId })
      .then((r) => r.data),
}
