import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const api = {
  getState: () => ipcRenderer.invoke('wb:get-state'),
  submit: (text: string) => ipcRenderer.invoke('wb:submit', text),
  goto: (id: string, extra?: string) => ipcRenderer.invoke('wb:goto', id, extra),
  setModal: (modal: string | null) => ipcRenderer.invoke('wb:set-modal', modal),
  setPlan: (plan: string) => ipcRenderer.invoke('wb:set-plan', plan),
  setSpendLimit: (limit: number | null) => ipcRenderer.invoke('wb:set-spend-limit', limit),
  updateProfile: (payload: { firstName?: string; lastName?: string }) =>
    ipcRenderer.invoke('wb:update-profile', payload),
  logout: () => ipcRenderer.invoke('wb:logout'),
  deactivate: () => ipcRenderer.invoke('wb:deactivate'),
  newAgent: () => ipcRenderer.invoke('wb:new-agent'),
  startIsolated: (label?: string) => ipcRenderer.invoke('wb:worktree-new', label),
  openWorktree: (path: string) => ipcRenderer.invoke('wb:worktree-open', path),
  refreshWorktrees: () => ipcRenderer.invoke('wb:worktree-list'),
  housekeepWorktree: (payload: { action: string; ids?: string[]; extra?: string[]; confirm?: boolean }) =>
    ipcRenderer.invoke('wb:worktree-housekeep', payload),
  forkSession: (payload?: { id?: string; isolate?: boolean }) => ipcRenderer.invoke('wb:fork', payload),
  openSession: (id: string) => ipcRenderer.invoke('wb:open-session', id),
  resumeCli: (id: string) => ipcRenderer.invoke('wb:resume-cli', id),
  cancel: (id?: string) => ipcRenderer.invoke('wb:cancel', id),
  allow: (id?: string) => ipcRenderer.invoke('wb:allow', id),
  deny: (id?: string) => ipcRenderer.invoke('wb:deny', id),
  requestCode: (payload: { email: string; firstName?: string; lastName?: string }) =>
    ipcRenderer.invoke('wb:request-code', payload),
  verifyCode: (code: string) => ipcRenderer.invoke('wb:verify-code', code),
  addRoutine: (input: { name: string; instruction: string; cron: string }) =>
    ipcRenderer.invoke('wb:routine-add', input),
  toggleRoutine: (id: string, enabled: boolean) => ipcRenderer.invoke('wb:routine-toggle', id, enabled),
  removeRoutine: (id: string) => ipcRenderer.invoke('wb:routine-remove', id),
  runRoutine: (id: string) => ipcRenderer.invoke('wb:routine-run', id),
  openWorkspace: () => ipcRenderer.invoke('wb:open-workspace'),
  setAgentMode: (mode: string) => ipcRenderer.invoke('wb:set-agent-mode', mode),
  setAgentPlan: (on: boolean) => ipcRenderer.invoke('wb:set-agent-plan', on),
  followCliMode: () => ipcRenderer.invoke('wb:follow-cli-mode'),
  setAgentModel: (model: string) => ipcRenderer.invoke('wb:set-agent-model', model),
  followCliModel: () => ipcRenderer.invoke('wb:follow-cli-model'),
  refreshModels: () => ipcRenderer.invoke('wb:refresh-models'),
  setAgentEffort: (effort: string) => ipcRenderer.invoke('wb:set-agent-effort', effort),
  setAgentSandbox: (profile: string) => ipcRenderer.invoke('wb:set-agent-sandbox', profile),
  setWorkspace: (path: string | null) => ipcRenderer.invoke('wb:set-workspace', path),
  inspect: (opts?: { force?: boolean }) => ipcRenderer.invoke('wb:inspect', opts),
  grokCmd: (req: { args: string[]; confirm?: boolean }) => ipcRenderer.invoke('wb:grok-cmd', req),
  listGrokSessions: (opts?: { limit?: number; query?: string }) =>
    ipcRenderer.invoke('wb:list-grok-sessions', opts),
  searchGrokSessions: (opts: { query: string; limit?: number }) =>
    ipcRenderer.invoke('wb:search-grok-sessions', opts),
  deleteGrokSession: (id: string) =>
    ipcRenderer.invoke('wb:delete-grok-session', { id, confirm: true }),
  continueGrokSession: () => ipcRenderer.invoke('wb:continue-grok-session'),
  recentGrokSession: () => ipcRenderer.invoke('wb:recent-grok-session'),
  renameGrokSession: (id: string, title: string) =>
    ipcRenderer.invoke('wb:rename-grok-session', { id, title }),
  exportCurrent: (opts?: { dest?: 'file' | 'clipboard'; path?: string }) =>
    ipcRenderer.invoke('wb:export-current', opts),
  compactCurrent: () => ipcRenderer.invoke('wb:compact-current'),
  onState: (cb: (state: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => cb(state)
    ipcRenderer.on('wb:state', listener)
    return () => {
      ipcRenderer.removeListener('wb:state', listener)
    }
  }
}

contextBridge.exposeInMainWorld('workbench', api)
