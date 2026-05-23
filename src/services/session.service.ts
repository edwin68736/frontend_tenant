import api from './api'

export type BranchBrief = {
  id: number
  name: string
  is_main?: boolean
}

export type SessionContextResponse = {
  active_branch: BranchBrief | null
  can_switch_branch: boolean
  branch_session_version: number
}

export type SwitchBranchResponse = {
  token: string
  active_branch: BranchBrief
  can_switch_branch: boolean
}

export const sessionService = {
  getContext: () =>
    api.get<SessionContextResponse>('/api/session/context').then((r) => r.data),

  switchBranch: (branchId: number) =>
    api
      .post<SwitchBranchResponse>('/api/session/switch-branch', { branch_id: branchId })
      .then((r) => r.data),
}
