import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AccountModal, AgentPermMode, AppState, PageId, PlanId } from '../../shared/types'

type Api = {
  state: AppState | null
  error: string | null
  submit: (text: string) => Promise<void>
  goto: (id: PageId, extra?: string) => Promise<void>
  setModal: (modal: AccountModal) => Promise<void>
  setPlan: (plan: PlanId) => Promise<void>
  setSpendLimit: (limit: number | null) => Promise<void>
  updateProfile: (payload: { firstName?: string; lastName?: string }) => Promise<void>
  logout: () => Promise<void>
  deactivate: () => Promise<void>
  newAgent: () => Promise<void>
  startIsolated: (label?: string) => Promise<void>
  openWorktree: (path: string) => Promise<void>
  refreshWorktrees: () => Promise<void>
  housekeepWorktree: (payload: {
    action: string
    ids?: string[]
    extra?: string[]
    confirm?: boolean
  }) => Promise<void>
  forkSession: (payload?: { id?: string; isolate?: boolean }) => Promise<void>
  openSession: (id: string) => Promise<void>
  resumeCli: (id: string) => Promise<boolean>
  continueRecent: () => Promise<boolean>
  renameCli: (id: string, title: string) => Promise<boolean>
  deleteCli: (id: string) => Promise<boolean>
  cancel: (id?: string) => Promise<void>
  allow: (id?: string) => Promise<void>
  deny: (id?: string) => Promise<void>
  requestCode: (payload: { email: string; firstName?: string; lastName?: string }) => Promise<void>
  verifyCode: (code: string) => Promise<void>
  addRoutine: (input: { name: string; instruction: string; cron: string }) => Promise<void>
  toggleRoutine: (id: string, enabled: boolean) => Promise<void>
  removeRoutine: (id: string) => Promise<void>
  runRoutine: (id: string) => Promise<void>
  openWorkspace: () => Promise<void>
  setWorkspace: (path: string | null) => Promise<void>
  setAgentMode: (mode: AgentPermMode) => Promise<void>
  setAgentPlan: (on: boolean) => Promise<void>
  followCliMode: () => Promise<void>
  setAgentModel: (model: string) => Promise<void>
  followCliModel: () => Promise<void>
  refreshModels: () => Promise<void>
  setAgentEffort: (effort: string) => Promise<void>
  setAgentSandbox: (profile: string) => Promise<void>
}

const Ctx = createContext<Api | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let off = () => {}
    void window.workbench.getState().then(setState).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
    })
    off = window.workbench.onState(setState)
    return () => off()
  }, [])

  const wrap = async (fn: () => Promise<AppState>) => {
    try {
      setError(null)
      setState(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const api: Api = {
    state,
    error,
    submit: (text) => wrap(() => window.workbench.submit(text)),
    goto: (id, extra) => wrap(() => window.workbench.goto(id, extra)),
    setModal: (modal) => wrap(() => window.workbench.setModal(modal)),
    setPlan: (plan) => wrap(() => window.workbench.setPlan(plan)),
    setSpendLimit: (limit) => wrap(() => window.workbench.setSpendLimit(limit)),
    updateProfile: (payload) => wrap(() => window.workbench.updateProfile(payload)),
    logout: () => wrap(() => window.workbench.logout()),
    deactivate: () => wrap(() => window.workbench.deactivate()),
    newAgent: () => wrap(() => window.workbench.newAgent()),
    startIsolated: (label) => wrap(() => window.workbench.startIsolated(label)),
    openWorktree: (path) => wrap(() => window.workbench.openWorktree(path)),
    refreshWorktrees: () => wrap(() => window.workbench.refreshWorktrees()),
    housekeepWorktree: (payload) => wrap(() => window.workbench.housekeepWorktree(payload)),
    forkSession: (payload) => wrap(() => window.workbench.forkSession(payload)),
    openSession: (id) => wrap(() => window.workbench.openSession(id)),
    resumeCli: async (id) => {
      try {
        setError(null)
        setState(await window.workbench.resumeCli(id))
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    continueRecent: async () => {
      try {
        setError(null)
        setState(await window.workbench.continueGrokSession())
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    renameCli: async (id, title) => {
      try {
        setError(null)
        const r = await window.workbench.renameGrokSession(id, title)
        if (r.state) setState(r.state as AppState)
        return r.ok !== false
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    deleteCli: async (id) => {
      try {
        setError(null)
        const r = await window.workbench.deleteGrokSession(id)
        if (!r.ok) {
          setError(r.error || '删没删掉')
          return false
        }
        setState(await window.workbench.getState())
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    cancel: (id) => wrap(() => window.workbench.cancel(id)),
    allow: (id) => wrap(() => window.workbench.allow(id)),
    deny: (id) => wrap(() => window.workbench.deny(id)),
    requestCode: (payload) => wrap(() => window.workbench.requestCode(payload)),
    verifyCode: (code) => wrap(() => window.workbench.verifyCode(code)),
    addRoutine: (input) => wrap(() => window.workbench.addRoutine(input)),
    toggleRoutine: (id, enabled) => wrap(() => window.workbench.toggleRoutine(id, enabled)),
    removeRoutine: (id) => wrap(() => window.workbench.removeRoutine(id)),
    runRoutine: (id) => wrap(() => window.workbench.runRoutine(id)),
    openWorkspace: () => wrap(() => window.workbench.openWorkspace()),
    setWorkspace: (path) => wrap(() => window.workbench.setWorkspace(path)),
    setAgentMode: (mode) => wrap(() => window.workbench.setAgentMode(mode)),
    setAgentPlan: (on) => wrap(() => window.workbench.setAgentPlan(on)),
    followCliMode: () => wrap(() => window.workbench.followCliMode()),
    setAgentModel: (model) => wrap(() => window.workbench.setAgentModel(model)),
    followCliModel: () => wrap(() => window.workbench.followCliModel()),
    refreshModels: () => wrap(() => window.workbench.refreshModels()),
    setAgentEffort: (effort) => wrap(() => window.workbench.setAgentEffort(effort)),
    setAgentSandbox: (profile) => wrap(() => window.workbench.setAgentSandbox(profile))
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useWorkbench(): Api {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('WorkbenchProvider missing')
  return ctx
}
