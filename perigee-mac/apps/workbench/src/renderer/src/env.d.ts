import type { GrokCmdRequest, GrokCmdResult } from '../../shared/grok-cmd'
import type {
  GrokSessionDeleteResult,
  GrokSessionRenameResult,
  GrokSessionRow,
  GrokSessionsResult
} from '../../shared/grok-sessions'
import type { InspectResult } from '../../shared/inspect'
import type { CompactCurrentResult, ExportCurrentResult } from '../../shared/slash-palette'
import type { AgentPermMode, AppState, PageId } from '../../shared/types'

export type WorkbenchApi = {
  getState: () => Promise<AppState>
  submit: (text: string) => Promise<AppState>
  goto: (id: PageId, extra?: string) => Promise<AppState>
  setModal: (
    modal:
      | 'plan'
      | 'deactivate'
      | 'env'
      | 'api-key'
      | 'secret'
      | 'secret-scope'
      | 'auto-preview'
      | 'auto-trigger'
      | 'auto-people'
      | 'auto-test'
      | 'auto-review'
      | 'bugbot-rule'
      | 'browse-mcp'
      | null
  ) => Promise<AppState>
  setPlan: (plan: 'free' | 'pro' | 'pro+' | 'ultra') => Promise<AppState>
  setSpendLimit: (limit: number | null) => Promise<AppState>
  updateProfile: (payload: { firstName?: string; lastName?: string }) => Promise<AppState>
  logout: () => Promise<AppState>
  deactivate: () => Promise<AppState>
  newAgent: () => Promise<AppState>
  startIsolated: (label?: string) => Promise<AppState>
  openWorktree: (path: string) => Promise<AppState>
  refreshWorktrees: () => Promise<AppState>
  housekeepWorktree: (payload: {
    action: string
    ids?: string[]
    extra?: string[]
    confirm?: boolean
  }) => Promise<AppState>
  forkSession: (payload?: { id?: string; isolate?: boolean }) => Promise<AppState>
  openSession: (id: string) => Promise<AppState>
  resumeCli: (id: string) => Promise<AppState>
  cancel: (id?: string) => Promise<AppState>
  allow: (id?: string) => Promise<AppState>
  deny: (id?: string) => Promise<AppState>
  requestCode: (payload: { email: string; firstName?: string; lastName?: string }) => Promise<AppState>
  verifyCode: (code: string) => Promise<AppState>
  addRoutine: (input: { name: string; instruction: string; cron: string }) => Promise<AppState>
  toggleRoutine: (id: string, enabled: boolean) => Promise<AppState>
  removeRoutine: (id: string) => Promise<AppState>
  runRoutine: (id: string) => Promise<AppState>
  openWorkspace: () => Promise<AppState>
  setWorkspace: (path: string | null) => Promise<AppState>
  setAgentMode: (mode: AgentPermMode) => Promise<AppState>
  setAgentPlan: (on: boolean) => Promise<AppState>
  followCliMode: () => Promise<AppState>
  setAgentModel: (model: string) => Promise<AppState>
  followCliModel: () => Promise<AppState>
  refreshModels: () => Promise<AppState>
  setAgentEffort: (effort: string) => Promise<AppState>
  setAgentSandbox: (profile: string) => Promise<AppState>
  inspect: (opts?: { force?: boolean }) => Promise<InspectResult>
  grokCmd: (req: GrokCmdRequest) => Promise<GrokCmdResult>
  listGrokSessions: (opts?: { limit?: number; query?: string }) => Promise<GrokSessionsResult>
  searchGrokSessions: (opts: { query: string; limit?: number }) => Promise<GrokSessionsResult>
  deleteGrokSession: (id: string) => Promise<GrokSessionDeleteResult>
  continueGrokSession: () => Promise<AppState>
  recentGrokSession: () => Promise<GrokSessionRow | null>
  renameGrokSession: (id: string, title: string) => Promise<GrokSessionRenameResult>
  exportCurrent: (opts?: { dest?: 'file' | 'clipboard'; path?: string }) => Promise<ExportCurrentResult>
  compactCurrent: () => Promise<CompactCurrentResult>
  onState: (cb: (state: AppState) => void) => () => void
}

declare global {
  interface Window {
    workbench: WorkbenchApi
  }
}

export {}
