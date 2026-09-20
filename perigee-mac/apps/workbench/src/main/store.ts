import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  cliPermissionToDesktop,
  listModelsViaCli,
  loadGrokConfigSnapshot,
  parseCron,
  RoutineScheduler,
  RoutineStore,
  type Routine,
  type RoutineFireResult
} from '@perigee/host-core'
import { isModelId, mergeModelList, pickDefaultModel } from '../shared/agent-model'
import { parseEffort, parseSandbox } from '../shared/runtime-flags'
import {
  buildAgentModeState,
  cliModeFromSnapshot,
  enginePolicyOf,
  isAgentPermMode
} from '../shared/agent-mode'
import { cloneAuto, emptyAutoState } from '../shared/automations'
import { toRoutineRow } from '../shared/routines'
import {
  blankRule,
  cloneBugbot,
  cloneRule,
  demoRule,
  emptyBugbot,
  filledBugbot,
  readyBugbot
} from '../shared/bugbot'
import {
  configuredCloud,
  DEMO_KEY_ONCE,
  emptyCloud,
  FAVICON_SESSION_ID,
  SETUP_SESSION_ID
} from '../shared/cloud'
import { DATA_DIR } from '../shared/constants'
import { isAccountPage, isAutoPage, isBugbotPage, isPageId, isPluginPage, isTaskPage, type PageId } from '../shared/pages'
import { applyTeamExtra, defaultTeam } from '../shared/team.js'
import {
  clonePlugins,
  emptyPlugins,
  filledPlugins,
  pluginById
} from '../shared/plugins'
import type {
  Account,
  AccountModal,
  AgentModeState,
  AgentModelEntry,
  AgentModelState,
  AgentPermMode,
  AgentTab,
  AppState,
  AutoState,
  BugbotState,
  ChatMessage,
  ChatStatus,
  CloudState,
  GrokProbe,
  PlanId,
  PluginState,
  PendingAsk,
  QueuedTurn,
  RoutineState,
  Session,
  SetupPhase,
  StreamHint,
  TaskKind,
  TeamState,
  Workspace
} from '../shared/types'
import { emptyWorktrees, isWorktreePath, type WorktreeState } from '../shared/grok-worktree'
import { clipSessionTitle, isSessionId } from '../shared/grok-sessions'
import { folderName, NO_WORKSPACE_TEXT } from '../shared/workspace'
import { dedupeSessions, preferCliSession } from '../shared/session-list'
import { titleFrom } from './fake-engine'
import { CANCELLED_TEXT, NO_GROK_TEXT, publicError, type GrokBridge } from './grok-engine'
import { lookupGrokSession, recentGrokSession } from './grok-sessions'
import { listOfficialWorktrees, runWorktreeHousekeep } from './grok-worktree'

const DEFAULT_GROK: GrokProbe = {
  cli: false,
  acp: false,
  acpDetail: '还没探测',
  hasConfig: false,
  mcp: [],
  flyby: {
    ok: false,
    bridgeUp: false,
    extensionConnected: false,
    detail: '还没探测'
  }
}

const CLOUD_MODALS: AccountModal[] = ['env', 'api-key', 'secret', 'secret-scope']

const ACCOUNT_FILE = join(DATA_DIR, 'account.json')
const WORKSPACE_FILE = join(DATA_DIR, 'workspace.json')
const AGENT_MODE_FILE = join(DATA_DIR, 'agent-mode.json')
const AGENT_MODEL_FILE = join(DATA_DIR, 'agent-model.json')
const PLANS: PlanId[] = ['free', 'pro', 'pro+', 'ultra']

type AgentPref = {
  mode: AgentPermMode
  plan: boolean
  followCli: boolean
  effort: string
  sandbox: string
}

type ModelPref = {
  id: string
  followCli: boolean
}

type ModelCatalog = {
  at: number
  defaultModel: string
  models: AgentModelEntry[]
  detail: string
}

let cliModeCache: { mode: AgentPermMode; at: number } | null = null

function readCliMode(): AgentPermMode {
  const now = Date.now()
  if (cliModeCache && now - cliModeCache.at < 4000) return cliModeCache.mode
  const snap = loadGrokConfigSnapshot({ preferCliList: false })
  const mapped = cliPermissionToDesktop(snap.permissionMode)
  const mode =
    mapped.cliRaw === 'auto' || snap.permissionMode === 'auto'
      ? 'auto'
      : mapped.policy === 'yolo'
        ? 'always-approve'
        : cliModeFromSnapshot(snap.permissionMode)
  cliModeCache = { mode, at: now }
  return mode
}

function emptyAgentPref(): AgentPref {
  return { mode: readCliMode(), plan: false, followCli: true, effort: '', sandbox: 'off' }
}

function loadAgentPref(): AgentPref {
  if (!existsSync(AGENT_MODE_FILE)) return emptyAgentPref()
  try {
    const raw = JSON.parse(readFileSync(AGENT_MODE_FILE, 'utf8')) as Partial<AgentPref>
    const saved = isAgentPermMode(raw.mode) ? raw.mode : null
    const followCli = raw.followCli === true || !saved
    return {
      mode: saved && !followCli ? saved : readCliMode(),
      plan: raw.plan === true,
      followCli,
      effort: parseEffort(raw.effort) ?? '',
      sandbox: parseSandbox(raw.sandbox) ?? 'off'
    }
  } catch {
    return emptyAgentPref()
  }
}

function saveAgentPref(pref: AgentPref): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(AGENT_MODE_FILE, `${JSON.stringify(pref, null, 2)}\n`)
}

let modelCatalogCache: ModelCatalog | null = null

function emptyModelPref(): ModelPref {
  return { id: '', followCli: true }
}

function loadModelPref(): ModelPref {
  if (!existsSync(AGENT_MODEL_FILE)) return emptyModelPref()
  try {
    const raw = JSON.parse(readFileSync(AGENT_MODEL_FILE, 'utf8')) as Partial<ModelPref>
    const id = isModelId(raw.id) ? raw.id.trim() : ''
    const followCli = raw.followCli === true || !id
    return { id, followCli }
  } catch {
    return emptyModelPref()
  }
}

function saveModelPref(pref: ModelPref): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(AGENT_MODEL_FILE, `${JSON.stringify(pref, null, 2)}\n`)
}

function loadModelCatalog(force = false): ModelCatalog {
  if (!force && modelCatalogCache && Date.now() - modelCatalogCache.at < 45_000) {
    return modelCatalogCache
  }
  const listed = listModelsViaCli()
  const models = listed?.models ?? []
  const defaultModel = pickDefaultModel(models, listed?.defaultModel)
  modelCatalogCache = {
    at: Date.now(),
    defaultModel,
    models,
    detail: listed?.detail ?? 'grok models 没读到。装好本机 Grok 后再试。'
  }
  return modelCatalogCache
}

function resolveWorkspaceDir(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('路径不能空')
  let abs: string
  if (trimmed === '~') abs = homedir()
  else if (trimmed.startsWith('~/')) abs = resolve(homedir(), trimmed.slice(2))
  else abs = resolve(trimmed)
  if (!existsSync(abs)) throw new Error(`目录不存在：${abs}`)
  let st
  try {
    st = statSync(abs)
  } catch {
    throw new Error(`读不了这个路径：${abs}`)
  }
  if (!st.isDirectory()) throw new Error(`不是目录：${abs}`)
  return abs
}

function loadWorkspace(): string | null {
  if (!existsSync(WORKSPACE_FILE)) return null
  try {
    const raw = JSON.parse(readFileSync(WORKSPACE_FILE, 'utf8')) as { path?: unknown }
    if (typeof raw.path !== 'string' || !raw.path.trim()) return null
    try {
      return resolveWorkspaceDir(raw.path)
    } catch {
      saveWorkspace(null)
      return null
    }
  } catch {
    return null
  }
}

function saveWorkspace(path: string | null): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(WORKSPACE_FILE, `${JSON.stringify({ path }, null, 2)}\n`)
}

function workspaceInfo(path: string | null): Workspace {
  return {
    path,
    name: path ? folderName(path) : null
  }
}

function emptyAccount(): Account {
  return {
    email: null,
    firstName: '',
    lastName: '',
    signedIn: false,
    plan: 'pro',
    spendLimit: 5
  }
}

function asPlan(value: unknown): PlanId {
  return PLANS.includes(value as PlanId) ? (value as PlanId) : 'pro'
}

function loadAccount(): Account {
  if (!existsSync(ACCOUNT_FILE)) return emptyAccount()
  try {
    const raw = JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8')) as Partial<Account>
    return {
      email: typeof raw.email === 'string' ? raw.email : null,
      firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
      lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
      signedIn: raw.signedIn === true,
      plan: asPlan(raw.plan),
      spendLimit: typeof raw.spendLimit === 'number' ? raw.spendLimit : 5
    }
  } catch {
    return emptyAccount()
  }
}

function saveAccount(account: Account): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(ACCOUNT_FILE, `${JSON.stringify(account, null, 2)}\n`)
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value)
}

function nid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function now(): number {
  return Date.now()
}

export function createStore(shown: boolean) {
  let page: PageId = 'agents-home'
  let sessions: Session[] = []
  let activeSessionId: string | null = null
  let ready = false
  let account = loadAccount()
  let pendingEmail: string | null = null
  let modal: AccountModal = null
  let cloud: CloudState = account.plan === 'free' ? emptyCloud() : configuredCloud()
  let setupPhase: SetupPhase = 'running'
  let agentTab: AgentTab = 'setup'
  let taskKind: TaskKind = 'setup'
  let desktopFull = false
  let auto: AutoState = emptyAutoState()
  let routines: RoutineState = { items: [], activeId: null, toast: null }
  let bugbot: BugbotState = emptyBugbot()
  let plugins: PluginState = emptyPlugins()
  let team: TeamState = defaultTeam(account.firstName)
  let grok: GrokProbe = { ...DEFAULT_GROK }
  let workspacePath: string | null = loadWorkspace()
  let worktrees: WorktreeState = emptyWorktrees()
  let agentPref = loadAgentPref()
  let agentLiveApply = '还没接到引擎'
  let modelPref = loadModelPref()
  let modelLiveApply = '还没接到引擎'
  let bridge: GrokBridge | null = null
  let fireRoutineImpl: (r: Routine) => Promise<RoutineFireResult> = async () => {
    throw new Error('routines not ready')
  }

  mkdirSync(DATA_DIR, { recursive: true })
  const routineStore = new RoutineStore(join(DATA_DIR, 'routines.json'))
  const scheduler = new RoutineScheduler({
    store: routineStore,
    onFire: (r) => fireRoutineImpl(r)
  })

  const listeners = new Set<(state: AppState) => void>()

  function syncRoutines(): void {
    routines = {
      items: scheduler.list().map((r) => toRoutineRow(r, scheduler.isInflight(r.id))),
      activeId: routines.activeId && routineStore.get(routines.activeId) ? routines.activeId : null,
      toast: routines.toast
    }
  }

  scheduler.onChanged(() => {
    syncRoutines()
    emit()
  })
  syncRoutines()

  function snapshot(): AppState {
    return {
      page,
      sessions: dedupeSessions(sessions, activeSessionId).map((s) => ({
        ...s,
        messages: s.messages.map((m) => ({ ...m })),
        pendingAsk: s.pendingAsk ? { ...s.pendingAsk } : s.pendingAsk,
        queued: s.queued?.map((q) => ({ ...q }))
      })),
      activeSessionId,
      ready,
      shown,
      account: { ...account },
      pendingEmail,
      modal,
      cloud: {
        ...cloud,
        apiKeys: cloud.apiKeys.map((k) => ({ ...k })),
        secrets: cloud.secrets.map((s) => ({ ...s })),
        setupRuns: cloud.setupRuns.map((r) => ({ ...r }))
      },
      setupPhase,
      agentTab,
      taskKind,
      desktopFull,
      auto: {
        ...auto,
        items: auto.items.map(cloneAuto),
        draft: cloneAuto(auto.draft)
      },
      routines: {
        items: routines.items.map((r) => ({
          ...r,
          running: scheduler.isInflight(r.id),
          runs: r.runs.map((x) => ({ ...x }))
        })),
        activeId: routines.activeId,
        toast: routines.toast
      },
      bugbot: cloneBugbot(bugbot),
      plugins: clonePlugins(plugins),
      team: { ...team },
      grok: { ...grok },
      workspace: workspaceInfo(workspacePath),
      agent: currentAgent(),
      models: currentModels(),
      worktrees: {
        items: worktrees.items.map((r) => ({ ...r })),
        error: worktrees.error,
        emptyNote: worktrees.emptyNote,
        raw: worktrees.raw,
        loading: worktrees.loading
      }
    }
  }

  function currentAgent(): AgentModeState {
    const cliMode = readCliMode()
    const mode = agentPref.followCli ? cliMode : agentPref.mode
    return buildAgentModeState({
      mode,
      plan: agentPref.plan,
      cliMode,
      followCli: agentPref.followCli,
      liveApply: agentLiveApply,
      effort: agentPref.effort,
      sandbox: agentPref.sandbox
    })
  }

  function enginePolicy() {
    const a = currentAgent()
    return enginePolicyOf(a.mode, a.plan)
  }

  function currentModels(): AgentModelState {
    const cat = loadModelCatalog()
    const list = mergeModelList(cat.models, modelPref.followCli ? cat.defaultModel : modelPref.id)
    const current = modelPref.followCli || !modelPref.id ? cat.defaultModel : modelPref.id
    return {
      current,
      defaultModel: cat.defaultModel,
      list,
      followCli: modelPref.followCli || !modelPref.id,
      liveApply: modelLiveApply,
      detail: cat.detail
    }
  }

  function engineModel(): string {
    return currentModels().current
  }

  function pushPolicy(): void {
    if (!bridge) {
      agentLiveApply = '无活会话，下次新开引擎会话后生效'
      return
    }
    agentLiveApply = bridge.applyPolicy(enginePolicy())
  }

  async function pushModel(): Promise<void> {
    const id = engineModel()
    if (!bridge) {
      modelLiveApply = id
        ? `无活会话。下一轮会用 ${id}`
        : '无活会话，下次新开会话跟 CLI 默认'
      return
    }
    modelLiveApply = await bridge.applyModel(id)
  }

  function ensureTaskSessions(): void {
    const hasSetup = sessions.some((s) => s.id === SETUP_SESSION_ID)
    const hasFav = sessions.some((s) => s.id === FAVICON_SESSION_ID)
    const extra: Session[] = []
    if (!hasSetup) {
      extra.push({
        id: SETUP_SESSION_ID,
        title: 'Development environment setup',
        messages: [],
        kind: 'setup',
        badge: '+853'
      })
    }
    if (!hasFav) {
      extra.push({
        id: FAVICON_SESSION_ID,
        title: 'Website favicon integration',
        messages: [],
        kind: 'task',
        badge: '+17'
      })
    }
    if (extra.length) sessions = [...extra, ...sessions]
  }

  function tabFor(id: PageId): AgentTab {
    if (id === 'agent-secrets') return 'secrets'
    if (id === 'agent-git' || id === 'review-diff') return 'git'
    if (id === 'agent-desktop') return 'desktop'
    if (id === 'agent-terminal') return 'terminal'
    if (id === 'agent-task') return 'git'
    return 'setup'
  }

  function applyCloudModal(next: AccountModal): void {
    modal = next
    if (next === 'api-key') {
      if (!cloud.envReady) cloud = configuredCloud()
      cloud = { ...cloud, revealedKey: DEMO_KEY_ONCE }
    }
  }

  function gotoCloud(extra?: string): AppState {
    desktopFull = false
    if (extra === 'empty' || extra === 'free') {
      cloud = emptyCloud()
      modal = null
    } else if (extra && CLOUD_MODALS.includes(extra as AccountModal)) {
      if (!cloud.envReady) cloud = configuredCloud()
      if (account.plan === 'free') {
        account = { ...account, plan: 'pro' }
        saveAccount(account)
      }
      applyCloudModal(extra as AccountModal)
    } else if (extra === 'pro' || account.plan !== 'free') {
      if (!cloud.envReady) cloud = configuredCloud()
      modal = null
    } else {
      cloud = emptyCloud()
      modal = null
    }
    page = 'settings-cloud-agents'
    return emit()
  }

  function gotoTask(id: PageId, extra?: string): AppState {
    ensureTaskSessions()
    const arriving = !isTaskPage(page)

    if (id === 'agents-setup-done' || extra === 'done') setupPhase = 'done'
    else if (extra === 'save' || extra === 'savable') setupPhase = 'savable'
    else if (extra === 'running' || (id === 'agents-setup' && arriving)) setupPhase = 'running'

    if (id === 'agent-task' && extra !== 'setup') taskKind = 'task'
    else if (id === 'agents-setup' || id === 'agents-setup-done' || extra === 'setup') taskKind = 'setup'
    else if (arriving) taskKind = id === 'agent-task' ? 'task' : 'setup'

    if (extra === 'desktop') agentTab = 'desktop'
    else if (extra === 'git') agentTab = 'git'
    else if (extra === 'terminal') agentTab = 'terminal'
    else if (extra === 'secrets') agentTab = 'secrets'
    else if (extra === 'setup') agentTab = 'setup'
    else agentTab = tabFor(id)

    desktopFull = extra === 'full'
    activeSessionId = taskKind === 'task' ? FAVICON_SESSION_ID : SETUP_SESSION_ID
    page = id
    modal = null
    return emit()
  }

  function emit(): AppState {
    const state = snapshot()
    for (const fn of listeners) fn(state)
    return state
  }

  function setReady(value: boolean): AppState {
    ready = value
    return emit()
  }

  function gotoAuto(id: PageId, extra?: string): AppState {
    desktopFull = false
    modal = null
    routines = { ...routines, toast: null }

    if (id === 'automations-gallery') {
      page = 'automations-gallery'
      routines = { ...routines, activeId: null }
      return emit()
    }

    if (id === 'automations-detail') {
      page = 'automations-detail'
      if (extra && extra !== 'new' && extra !== 'create' && routineStore.get(extra)) {
        routines = { ...routines, activeId: extra }
      }
      return emit()
    }

    page = 'automations'
    if (extra && routineStore.get(extra)) {
      page = 'automations-detail'
      routines = { ...routines, activeId: extra }
    } else {
      routines = { ...routines, activeId: null }
    }
    return emit()
  }

  function saveBugbotRule(): AppState {
    const rule = bugbot.draft.name.trim() ? cloneRule(bugbot.draft) : demoRule()
    if (!rule.id || rule.id === 'new') rule.id = nid('rule')
    rule.enabled = rule.enabled !== false
    const idx = bugbot.rules.findIndex((r) => r.id === rule.id)
    bugbot = {
      ...bugbot,
      enabled: true,
      view: 'home',
      rules: idx >= 0 ? bugbot.rules.map((r) => (r.id === rule.id ? rule : r)) : [rule, ...bugbot.rules],
      draft: cloneRule(rule),
      toast: 'Manual repository rule created successfully.'
    }
    page = 'settings-bugbot-rules'
    modal = null
    return emit()
  }

  function gotoBugbot(id: PageId, extra?: string): AppState {
    desktopFull = false

    if (extra === 'empty' || extra === 'free') {
      bugbot = emptyBugbot()
      modal = null
      page = id === 'settings-bugbot-rule-edit' ? 'settings-bugbot-rules' : id
      return emit()
    }
    if (extra === 'pro') {
      bugbot = filledBugbot()
      modal = null
      page = id
      return emit()
    }
    if (extra === 'ready') {
      bugbot = readyBugbot()
      modal = null
      page = id === 'settings-bugbot-rule-edit' ? 'settings-bugbot' : id
      return emit()
    }
    if (extra === 'add') {
      bugbot = { ...bugbot, draft: blankRule(), toast: null, view: 'home' }
      page = 'settings-bugbot-rules'
      modal = 'bugbot-rule'
      return emit()
    }
    if (extra === 'form') {
      bugbot = { ...bugbot, draft: demoRule(), toast: null, view: 'home' }
      page = 'settings-bugbot-rules'
      modal = 'bugbot-rule'
      return emit()
    }
    if (extra === 'save') return saveBugbotRule()
    if (extra === 'repos') {
      bugbot = { ...bugbot, enabled: true, view: 'repos', toast: null }
      page = 'settings-bugbot'
      modal = null
      return emit()
    }
    if (extra === 'gen') {
      bugbot = {
        ...bugbot,
        toast: 'Generating rules from samleemobbin-dot/docs. This may take a few minutes.'
      }
      page = 'settings-bugbot-rules'
      modal = null
      return emit()
    }
    if (extra === 'drop') {
      const dropId = bugbot.draft.id
      bugbot = {
        ...bugbot,
        rules: bugbot.rules.filter((r) => r.id !== dropId),
        draft: blankRule(),
        toast: null,
        view: 'home'
      }
      page = 'settings-bugbot-rules'
      modal = null
      return emit()
    }

    if (id === 'settings-bugbot-rule-edit') {
      if (!bugbot.draft.name && bugbot.rules[0]) {
        bugbot = { ...bugbot, draft: cloneRule(bugbot.rules[0]) }
      }
      if (!bugbot.draft.name) {
        const rule = demoRule()
        bugbot = {
          ...bugbot,
          enabled: true,
          draft: cloneRule(rule),
          rules: bugbot.rules.length ? bugbot.rules : [cloneRule(rule)]
        }
      }
      page = 'settings-bugbot-rule-edit'
      modal = null
      return emit()
    }

    if (id === 'settings-bugbot-rules') {
      bugbot = { ...bugbot, view: 'home', toast: null }
      page = 'settings-bugbot-rules'
      modal = null
      return emit()
    }

    bugbot = { ...bugbot, view: extra === 'repos' ? 'repos' : 'home' }
    page = 'settings-bugbot'
    modal = null
    return emit()
  }

  function setInteg(id: string, on: boolean): void {
    if (id === 'github') cloud = { ...cloud, gitConnected: on }
    else if (id === 'gitlab') cloud = { ...cloud, gitlabConnected: on }
    else if (id === 'slack') cloud = { ...cloud, slackLinked: on }
    else if (id === 'linear') cloud = { ...cloud, linearLinked: on }
  }

  function gotoInteg(extra?: string): AppState {
    desktopFull = false
    page = 'settings-integrations'
    if (extra === 'empty' || extra === 'free') {
      account = { ...account, plan: 'free' }
      saveAccount(account)
      cloud = emptyCloud()
      modal = null
      return emit()
    }
    if (extra === 'pro') {
      account = { ...account, plan: 'pro' }
      saveAccount(account)
      if (!cloud.envReady || cloud.apiKeys.length === 0) cloud = configuredCloud()
      cloud = { ...cloud, gitConnected: true, slackLinked: true }
      modal = null
      return emit()
    }
    if (extra === 'key' || extra === 'api-key') {
      applyCloudModal('api-key')
      return emit()
    }
    if (extra === 'github' || extra === 'gitlab' || extra === 'slack' || extra === 'linear') {
      setInteg(extra, true)
      modal = null
      return emit()
    }
    if (extra?.startsWith('disconnect-')) {
      setInteg(extra.slice('disconnect-'.length), false)
      modal = null
      return emit()
    }
    modal = null
    return emit()
  }

  function gotoPlugin(id: PageId, extra?: string): AppState {
    desktopFull = false
    plugins = { ...plugins, toast: null }

    if (extra === 'empty' || extra === 'free') {
      plugins = emptyPlugins()
      page = id === 'settings-plugins-detail' ? 'settings-plugins-detail' : 'settings-plugins'
      modal = null
      return emit()
    }
    if (extra === 'pro') {
      plugins = filledPlugins()
      page = id
      modal = null
      return emit()
    }
    if (extra === 'pla' || extra === 'search') {
      plugins = { ...emptyPlugins(), query: extra === 'search' ? 'pla' : extra }
      page = 'settings-plugins'
      modal = null
      return emit()
    }
    if (extra === 'market') {
      plugins = { ...plugins, query: '', market: true, tab: 'all', toast: null }
      page = 'settings-plugins'
      modal = null
      return emit()
    }
    if (extra === 'user' || extra === 'all') {
      plugins = { ...plugins, tab: extra, toast: null }
      page = 'settings-plugins'
      modal = null
      return emit()
    }
    if (extra?.startsWith('q:')) {
      plugins = { ...plugins, query: extra.slice(2), market: extra.slice(2).trim() === '', toast: null }
      page = 'settings-plugins'
      modal = null
      return emit()
    }
    if (extra === 'install') {
      const add = plugins.activeId || 'slack'
      const installed = plugins.installed.includes(add) ? plugins.installed : [add, ...plugins.installed]
      plugins = { ...plugins, installed, toast: 'Plugin added to Perigee' }
      page = 'settings-plugins-detail'
      modal = null
      return emit()
    }
    if (extra === 'uninstall') {
      plugins = {
        ...plugins,
        installed: plugins.installed.filter((x) => x !== plugins.activeId),
        toast: null
      }
      page = 'settings-plugins-detail'
      modal = null
      return emit()
    }
    if (extra === 'private' || extra === 'shared') {
      plugins = { ...plugins, visibility: extra }
      page = 'settings-plugins-detail'
      modal = null
      return emit()
    }

    const found = extra ? pluginById(extra) : undefined
    if (found) {
      plugins = { ...plugins, activeId: found.id, toast: null }
      page = 'settings-plugins-detail'
      modal = null
      return emit()
    }

    if (id === 'settings-plugins-detail') {
      if (!pluginById(plugins.activeId)) plugins = { ...plugins, activeId: 'slack' }
      page = 'settings-plugins-detail'
      modal = null
      return emit()
    }

    page = 'settings-plugins'
    modal = null
    return emit()
  }

  function gotoTeam(extra?: string): AppState {
    desktopFull = false
    const first = account.firstName
    if (extra === 'continue') {
      team = { ...team, created: true, name: team.name.trim() || defaultTeam(first).name }
      page = 'settings-members'
      modal = 'plan'
      return emit()
    }
    team = applyTeamExtra(team, extra, first)
    page = 'onboarding-team'
    modal = null
    return emit()
  }

  function goto(id: string, extra?: string): AppState {
    if (!isPageId(id)) {
      throw new Error(`unknown page: ${id}`)
    }
    if (isAutoPage(id)) return gotoAuto(id, extra)
    if (isBugbotPage(id)) return gotoBugbot(id, extra)
    if (isPluginPage(id)) return gotoPlugin(id, extra)
    if (id === 'settings-integrations') return gotoInteg(extra)
    if (id === 'onboarding-team') return gotoTeam(extra)
    if (id === 'settings-members') {
      desktopFull = false
      page = 'settings-members'
      modal = null
      return emit()
    }
    if (id === 'agents-home' && extra === 'mcp') {
      page = 'agents-home'
      modal = 'browse-mcp'
      desktopFull = false
      return emit()
    }
    if (extra === 'empty' || extra === 'free') {
      account = { ...account, plan: 'free' }
      saveAccount(account)
    } else if (extra === 'pro') {
      account = { ...account, plan: 'pro' }
      saveAccount(account)
    }

    if (id === 'settings-plan') {
      desktopFull = false
      page = 'settings-plan'
      modal = extra === 'start' ? null : 'plan'
      return emit()
    }
    if (id === 'settings-deactivate') {
      page = 'settings-general'
      modal = 'deactivate'
      return emit()
    }

    if (id === 'settings-cloud-agents') return gotoCloud(extra)
    if (isTaskPage(id)) return gotoTask(id, extra)

    page = id
    modal = null
    desktopFull = false
    if (id === 'worktrees') void refreshWorktrees()
    return emit()
  }

  function setModal(next: AccountModal): AppState {
    if (next === 'deactivate') page = 'settings-general'
    if (next === 'auto-preview' && !auto.previewId) {
      auto = { ...auto, previewId: 'vuln' }
    }
    if (next === 'bugbot-rule') {
      page = 'settings-bugbot-rules'
      if (!bugbot.draft.name) bugbot = { ...bugbot, draft: blankRule(), toast: null }
    }
    applyCloudModal(next)
    return emit()
  }

  function setPlan(next: PlanId): AppState {
    account = { ...account, plan: next }
    saveAccount(account)
    modal = null
    if (next === 'free') cloud = emptyCloud()
    else if (!cloud.envReady) cloud = configuredCloud()
    return emit()
  }

  function setSpendLimit(limit: number | null): AppState {
    account = { ...account, spendLimit: limit }
    saveAccount(account)
    return emit()
  }

  function updateProfile(input: { firstName?: string; lastName?: string }): AppState {
    account = {
      ...account,
      firstName: input.firstName ?? account.firstName,
      lastName: input.lastName ?? account.lastName
    }
    saveAccount(account)
    return emit()
  }

  function logout(): AppState {
    account = { ...emptyAccount(), plan: account.plan, spendLimit: account.spendLimit }
    saveAccount(account)
    pendingEmail = null
    modal = null
    desktopFull = false
    team = defaultTeam('')
    page = 'agents-home'
    return emit()
  }

  function deactivate(): AppState {
    account = emptyAccount()
    saveAccount(account)
    pendingEmail = null
    modal = null
    desktopFull = false
    team = defaultTeam('')
    page = 'agents-home'
    return emit()
  }

  function viewing(sessionId: string): boolean {
    if (activeSessionId !== sessionId) return false
    return page === 'chat' || isTaskPage(page)
  }

  function pickSession(id?: string): Session {
    const sid = (id ?? '').trim() || activeSessionId
    const found = sessions.find((s) => s.id === sid)
    if (!found) throw new Error(sid ? `unknown session: ${sid}` : '没有打开的会话')
    return found
  }

  function openSession(id: string): AppState {
    const found = sessions.find((s) => s.id === id)
    if (!found) throw new Error(`unknown session: ${id}`)
    activeSessionId = found.id
    found.unread = false
    if (found.kind === 'setup') {
      taskKind = 'setup'
      agentTab = 'setup'
      page = setupPhase === 'done' ? 'agents-setup-done' : 'agents-setup'
      desktopFull = false
      return emit()
    }
    if (found.kind === 'task') {
      taskKind = 'task'
      agentTab = 'git'
      page = 'agent-task'
      desktopFull = false
      return emit()
    }
    page = 'chat'
    desktopFull = false
    return emit()
  }

  function requestCode(input: { email: string; firstName?: string; lastName?: string }): AppState {
    const email = input.email.trim()
    if (!looksLikeEmail(email)) throw new Error('Enter a valid email')
    pendingEmail = email
    if (input.firstName !== undefined) account = { ...account, firstName: input.firstName.trim() }
    if (input.lastName !== undefined) account = { ...account, lastName: input.lastName.trim() }
    page = 'verify-email'
    return emit()
  }

  function verifyCode(code: string): AppState {
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) throw new Error('Enter the 6-digit code')
    if (!pendingEmail) throw new Error('Enter an email first')
    account = { ...account, email: pendingEmail, signedIn: true, plan: account.plan || 'pro' }
    saveAccount(account)
    modal = null
    page = 'onboarding-download'
    return emit()
  }

  function enter(email: string, code?: string): AppState {
    requestCode({ email })
    if (!code) return snapshot()
    return verifyCode(code)
  }

  function setBridge(next: GrokBridge): void {
    bridge = next
    pushPolicy()
    void pushModel()
  }

  function setAgentMode(next: AgentPermMode): AppState {
    if (!isAgentPermMode(next)) throw new Error('权限档只能是 ask / auto / always-approve')
    cliModeCache = null
    agentPref = { ...agentPref, mode: next, followCli: false }
    saveAgentPref(agentPref)
    pushPolicy()
    return emit()
  }

  function setAgentPlan(on: boolean): AppState {
    agentPref = { ...agentPref, plan: on === true }
    saveAgentPref(agentPref)
    pushPolicy()
    return emit()
  }

  function followCliMode(): AppState {
    cliModeCache = null
    const cliMode = readCliMode()
    agentPref = { ...agentPref, mode: cliMode, followCli: true }
    saveAgentPref(agentPref)
    pushPolicy()
    return emit()
  }

  async function setAgentModel(raw: string): Promise<AppState> {
    const id = String(raw ?? '').trim()
    if (id === 'cli' || id === 'reset' || id === 'default') {
      return followCliModel()
    }
    if (!isModelId(id)) throw new Error('模型名不对。用 workbench grok models 里的 id')
    modelPref = { id, followCli: false }
    saveModelPref(modelPref)
    await pushModel()
    return emit()
  }

  async function followCliModel(): Promise<AppState> {
    const cat = loadModelCatalog(true)
    modelPref = { id: cat.defaultModel, followCli: true }
    saveModelPref(modelPref)
    await pushModel()
    return emit()
  }

  function engineEffort(): string {
    return agentPref.effort
  }

  function engineSandbox(): string {
    return agentPref.sandbox === 'off' ? '' : agentPref.sandbox
  }

  async function setAgentEffort(raw: string): Promise<AppState> {
    const next = parseEffort(raw)
    agentPref = { ...agentPref, effort: next ?? '' }
    saveAgentPref(agentPref)
    if (bridge) {
      agentLiveApply = await bridge.applyEffort(agentPref.effort)
    }
    return emit()
  }

  function setAgentSandbox(raw: string): AppState {
    const next = parseSandbox(raw) ?? 'off'
    agentPref = { ...agentPref, sandbox: next }
    saveAgentPref(agentPref)
    if (bridge) {
      agentLiveApply = bridge.applySandbox(next === 'off' ? '' : next)
    }
    return emit()
  }

  async function refreshModels(): Promise<AppState> {
    loadModelCatalog(true)
    if (modelPref.followCli) {
      modelPref = { ...modelPref, id: loadModelCatalog().defaultModel }
      saveModelPref(modelPref)
    }
    await pushModel()
    return emit()
  }

  function setGrok(next: GrokProbe, opts?: { gate?: boolean }): AppState {
    grok = { ...next }
    if (opts?.gate && !next.cli && !next.hasConfig && page === 'agents-home') {
      page = 'settings-models'
    }
    return emit()
  }

  function setWorkspace(raw: string | null): AppState {
    if (raw == null || !String(raw).trim()) {
      workspacePath = null
      saveWorkspace(null)
      return emit()
    }
    workspacePath = resolveWorkspaceDir(String(raw))
    saveWorkspace(workspacePath)
    return emit()
  }

  function requireWorkspace(session: Session): string {
    if (session.workspacePath) return session.workspacePath
    if (!workspacePath) throw new Error(NO_WORKSPACE_TEXT)
    session.workspacePath = workspacePath
    return session.workspacePath
  }

  function mutateSession(sessionId: string, fn: (s: Session) => void): void {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    fn(session)
    if (!viewing(sessionId)) session.unread = true
    emit()
  }

  function setPendingAsk(sessionId: string, ask: PendingAsk | null): void {
    mutateSession(sessionId, (s) => {
      s.pendingAsk = ask
    })
  }

  function liveTurn(session: Session): boolean {
    return session.status === 'streaming' || session.status === 'waiting'
  }

  function addUser(sessionId: string, text: string): string {
    const id = nid('m')
    mutateSession(sessionId, (s) => {
      s.messages = [...s.messages, { id, role: 'user', text, ts: now() }]
    })
    return id
  }

  function addAssistant(sessionId: string, text: string): string {
    const id = nid('m')
    mutateSession(sessionId, (s) => {
      s.messages = [...s.messages, { id, role: 'assistant', text, ts: now() }]
    })
    return id
  }

  function appendAssistant(sessionId: string, messageId: string, chunk: string): void {
    mutateSession(sessionId, (s) => {
      s.messages = s.messages.map((m) =>
        m.id === messageId ? { ...m, text: m.text + chunk } : m
      )
    })
  }

  function replaceMessage(sessionId: string, messageId: string, text: string): void {
    mutateSession(sessionId, (s) => {
      s.messages = s.messages.map((m) => (m.id === messageId ? { ...m, text } : m))
    })
  }

  function setSessionStatus(sessionId: string, status: ChatStatus): void {
    mutateSession(sessionId, (s) => {
      s.status = status
      if (status === 'streaming' || status === 'waiting') {
        if (!s.turnStartedAt) s.turnStartedAt = now()
      } else {
        s.turnStartedAt = undefined
        if (status === 'idle') s.streamHint = undefined
      }
    })
  }

  function bindCliSessionId(sessionId: string, cliId: string): void {
    const id = cliId.trim()
    if (!id || !isSessionId(id)) return
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    const already = session.cliSessionId === id
    session.cliSessionId = id
    const drop = sessions.filter(
      (s) => s.id !== sessionId && (s.id === id || s.cliSessionId === id)
    )
    if (drop.length) {
      sessions = sessions.filter(
        (s) => s.id === sessionId || (s.id !== id && s.cliSessionId !== id)
      )
      if (drop.some((c) => c.id === activeSessionId)) activeSessionId = sessionId
    } else if (already) {
      return
    }
    emit()
  }

  function noteStreamHint(sessionId: string, hint: StreamHint): void {
    mutateSession(sessionId, (s) => {
      if (s.streamHint === 'delta') return
      s.streamHint = hint
    })
  }

  function dropQueued(session: Session): void {
    const ids = new Set((session.queued ?? []).map((q) => q.messageId))
    if (ids.size) {
      session.messages = session.messages.filter((m) => !ids.has(m.id))
    }
    session.queued = undefined
  }

  function enqueueTurn(session: Session, trimmed: string): void {
    const messageId = nid('m')
    session.messages = [...session.messages, { id: messageId, role: 'user', text: trimmed, ts: now() }]
    const next: QueuedTurn = { text: trimmed, messageId }
    session.queued = [...(session.queued ?? []), next]
    session.unread = false
    emit()
  }

  function beginChat(trimmed: string, stayOnTask: boolean): Session {
    if (stayOnTask) {
      ensureTaskSessions()
      let session = sessions.find((s) => s.id === activeSessionId)
      if (!session) {
        session = sessions.find((s) =>
          s.id === (taskKind === 'task' ? FAVICON_SESSION_ID : SETUP_SESSION_ID)
        )
      }
      if (!session) {
        if (!workspacePath) throw new Error(NO_WORKSPACE_TEXT)
        session = { id: nid('s'), title: titleFrom(trimmed), messages: [], workspacePath }
        sessions = [session, ...sessions]
        activeSessionId = session.id
      }
      return session
    }

    let session = sessions.find((s) => s.id === activeSessionId)
    if (!session) {
      if (!workspacePath) throw new Error(NO_WORKSPACE_TEXT)
      session = { id: nid('s'), title: titleFrom(trimmed), messages: [], workspacePath }
      sessions = [session, ...sessions]
      activeSessionId = session.id
    }
    return session
  }

  function resumeFailure(err: unknown, cliId: string): Error {
    const raw = publicError(err)
    if (raw === NO_GROK_TEXT) return new Error(NO_GROK_TEXT)
    if (/not found|unknown session|no such session|does not exist/i.test(raw)) {
      return new Error(`没有这条 CLI 会话：${cliId}`)
    }
    return new Error(raw || '接上这条 CLI 会话失败了')
  }

  /** 同一 CLI id 只留一条，并标成 cli，本机窗就不会再画一条。 */
  function collapseCli(id: string): Session | undefined {
    const matches = sessions.filter((s) => s.cliSessionId === id || s.id === id)
    if (!matches.length) return undefined
    const win = matches.reduce((a, b) => preferCliSession(a, b, activeSessionId))
    win.cliSessionId = id
    win.kind = 'cli'
    sessions = sessions.filter((s) => s === win || (s.cliSessionId !== id && s.id !== id))
    if (matches.some((m) => m.id === activeSessionId)) activeSessionId = win.id
    return win
  }

  function hasReplayBubbles(session: Session): boolean {
    return session.messages.some((m) => {
      if (!m.text.trim()) return false
      if (m.role === 'user') return true
      return m.role === 'assistant' && !m.text.startsWith('工具 ·')
    })
  }

  async function replayCli(session: Session, cliId: string, cwd: string): Promise<AppState> {
    if (!bridge) throw new Error(NO_GROK_TEXT)
    const created = session.messages.length === 0 && session.id === cliId
    const prevActive = activeSessionId
    const prevPage = page
    session.status = 'streaming'
    session.turnStartedAt = now()
    session.unread = false
    session.pendingAsk = null
    activeSessionId = session.id
    page = 'chat'
    desktopFull = false
    emit()
    try {
      await bridge.resume(session.id, cliId, cwd)
      const fresh = sessions.find((s) => s.id === session.id)
      if (fresh && fresh.status === 'streaming') {
        fresh.status = 'idle'
        fresh.turnStartedAt = undefined
      }
      emit()
      return snapshot()
    } catch (err) {
      if (created) {
        sessions = sessions.filter((s) => s.id !== session.id)
        activeSessionId = prevActive === session.id ? null : prevActive
        page = prevPage
        emit()
      } else {
        session.status = 'error'
        session.turnStartedAt = undefined
        emit()
      }
      throw resumeFailure(err, cliId)
    }
  }

  async function resumeCli(cliSessionId: string): Promise<AppState> {
    const id = cliSessionId.trim()
    if (!id) throw new Error('用法：workbench resume <cli-session-id>')
    if (!isSessionId(id)) throw new Error('这不是 CLI 会话 id（需要完整 UUID）')

    const existing = collapseCli(id)
    if (existing && hasReplayBubbles(existing)) {
      return openSession(existing.id)
    }
    if (existing) {
      const cwd = existing.workspacePath || workspacePath
      if (!cwd) throw new Error('这条会话没有目录，也还没打开文件夹')
      return replayCli(existing, id, cwd)
    }

    const row = await lookupGrokSession(id, { cwd: workspacePath })
    if (!row) throw new Error(`没有这条 CLI 会话：${id}`)

    let cwd: string
    if (row.cwd && row.cwd.trim()) {
      try {
        cwd = resolveWorkspaceDir(row.cwd)
      } catch {
        throw new Error(`这条会话的目录已经不在了：${folderName(row.cwd)}`)
      }
    } else if (workspacePath) {
      cwd = workspacePath
    } else {
      throw new Error('这条会话没有目录，也还没打开文件夹')
    }

    if (!bridge) throw new Error(NO_GROK_TEXT)

    const session: Session = {
      id,
      title: row.title || id,
      messages: [],
      kind: 'cli',
      workspacePath: cwd,
      cliSessionId: id,
      status: 'streaming',
      turnStartedAt: now()
    }
    sessions = [session, ...sessions.filter((s) => s.id !== id && s.cliSessionId !== id)]
    return replayCli(session, id, cwd)
  }

  async function continueRecent(): Promise<AppState> {
    if (!workspacePath) throw new Error('先打开文件夹，才能续这个目录最近一条')
    const row = await recentGrokSession(workspacePath)
    if (!row) throw new Error('这个目录还没有 CLI 会话')
    return resumeCli(row.id)
  }

  function renameLocalTitle(id: string, title: string): AppState {
    const t = clipSessionTitle(title)
    if (!t) throw new Error('名字不能空')
    const session = sessions.find((s) => s.id === id || s.cliSessionId === id)
    if (!session) {
      throw new Error('本机窗还没有这条。先续上再改名。官方没有 sessions rename，只改这边标题。')
    }
    session.title = t
    return emit()
  }

  function dropCliSession(id: string): AppState {
    const sid = id.trim()
    const gone = sessions.filter((s) => s.id === sid || s.cliSessionId === sid)
    if (!gone.length) return snapshot()
    sessions = sessions.filter((s) => s.id !== sid && s.cliSessionId !== sid)
    if (gone.some((s) => s.id === activeSessionId)) {
      activeSessionId = null
      page = 'agents-home'
    }
    return emit()
  }

  async function beginTurn(session: Session, trimmed: string): Promise<void> {
    const cwd = requireWorkspace(session)
    session.status = 'streaming'
    session.unread = false
    session.pendingAsk = null
    session.turnStartedAt = now()
    session.streamHint = undefined
    emit()
    if (!bridge) {
      addAssistant(session.id, NO_GROK_TEXT)
      setSessionStatus(session.id, 'error')
      return
    }
    try {
      await bridge.talk(session.id, trimmed, cwd)
    } catch {
      /* talk 里已经落失败气泡 */
    }
    await flushQueue(session)
  }

  async function flushQueue(session: Session): Promise<void> {
    const fresh = sessions.find((s) => s.id === session.id) ?? session
    if (liveTurn(fresh) || fresh.status === 'waiting') return
    const rest = fresh.queued ?? []
    const next = rest[0]
    if (!next) return
    fresh.queued = rest.slice(1)
    if (!fresh.queued.length) fresh.queued = undefined
    await beginTurn(fresh, next.text)
  }

  async function sendChat(
    session: Session,
    trimmed: string,
    opts?: { wait?: boolean }
  ): Promise<AppState> {
    if (liveTurn(session)) {
      enqueueTurn(session, trimmed)
      return snapshot()
    }
    const user: ChatMessage = { id: nid('m'), role: 'user', text: trimmed, ts: now() }
    session.messages = [...session.messages, user]
    if (
      session.messages.filter((m) => m.role === 'user').length === 1 &&
      !session.title.startsWith('定时 ·') &&
      !session.cliSessionId
    ) {
      session.title = titleFrom(trimmed)
    }
    const work = beginTurn(session, trimmed)
    if (opts?.wait) await work
    else void work
    return snapshot()
  }

  function parseCronOrThrow(cron: string): string {
    const expr = cron.trim()
    if (!parseCron(expr)) throw new Error('cron 必须是 5 字段（分 时 日 月 周），例如 0 9 * * *')
    return expr
  }

  function addRoutine(input: { name: string; instruction: string; cron: string }): AppState {
    const name = String(input.name ?? '').trim()
    const instruction = String(input.instruction ?? '').trim()
    const cron = parseCronOrThrow(String(input.cron ?? ''))
    if (!name) throw new Error('名字不能空')
    if (!instruction) throw new Error('要说的话不能空')
    const created = scheduler.create({
      name,
      instruction,
      enabled: true,
      workspace: homedir(),
      model: '',
      triggers: [{ kind: 'cron', expr: cron }],
      mcpServers: [],
      notify: false
    })
    routines = { ...routines, activeId: created.id, toast: '已存' }
    page = 'automations'
    modal = null
    return emit()
  }

  function toggleRoutine(id: string, enabled: boolean): AppState {
    scheduler.toggle(id, enabled)
    return emit()
  }

  function removeRoutine(id: string): AppState {
    scheduler.remove(id)
    if (routines.activeId === id) routines = { ...routines, activeId: null }
    page = 'automations'
    return emit()
  }

  async function fireRoutine(r: Routine): Promise<RoutineFireResult> {
    const started = Date.now()
    const session: Session = {
      id: nid('s'),
      title: `定时 · ${r.name}`,
      messages: [],
      kind: 'chat',
      workspacePath: workspacePath ?? undefined
    }
    sessions = [session, ...sessions]
    emit()
    const TURN_MS = 90_000
    try {
      const timed = await Promise.race([
        sendChat(session, r.instruction, { wait: true }).then(() => 'ok' as const),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), TURN_MS))
      ])
      session.title = `定时 · ${r.name}`
      if (timed === 'timeout') {
        try {
          await cancel(session.id)
        } catch {
          /* 可能已经结束 */
        }
        return {
          sessionId: session.id,
          status: 'fail',
          summary: '这一轮超时',
          durationMs: Date.now() - started
        }
      }
      const fresh = sessions.find((s) => s.id === session.id) ?? session
      const last = [...fresh.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && !m.text.startsWith('工具 ·'))
      const fail =
        fresh.status === 'error' || last?.text === NO_GROK_TEXT || last?.text === CANCELLED_TEXT
      return {
        sessionId: session.id,
        status: fail ? 'fail' : 'ok',
        summary: (last?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || (fail ? '失败' : '完成'),
        durationMs: Date.now() - started
      }
    } catch (e) {
      const summary = e instanceof Error ? e.message : String(e)
      return {
        sessionId: session.id,
        status: 'fail',
        summary: summary.slice(0, 200),
        durationMs: Date.now() - started
      }
    }
  }

  fireRoutineImpl = fireRoutine

  async function runRoutine(id: string): Promise<AppState> {
    const result = await scheduler.runNow(id)
    routines = { ...routines, activeId: id, toast: `已跑 · ${result.sessionId}` }
    return emit()
  }

  function startRoutines(): void {
    scheduler.start()
    syncRoutines()
    emit()
  }

  async function cancel(sessionId?: string): Promise<AppState> {
    const session = pickSession(sessionId)
    if (!liveTurn(session) && !session.pendingAsk) {
      throw new Error('这一轮已经结束，没有可取消的')
    }
    if (session.pendingAsk && bridge) {
      bridge.resolve(session.id, session.pendingAsk.engineRequestId, false)
    }
    session.pendingAsk = null
    dropQueued(session)
    const last = session.messages.at(-1)
    if (!last || last.text !== CANCELLED_TEXT) {
      addAssistant(session.id, CANCELLED_TEXT)
    }
    setSessionStatus(session.id, 'idle')
    if (bridge) await bridge.cancel(session.id)
    return snapshot()
  }

  function allow(sessionId?: string): AppState {
    const session = pickSession(sessionId)
    const ask = session.pendingAsk
    if (!ask) throw new Error('现在没有要批准的')
    if (!bridge) throw new Error('引擎还没接上')
    bridge.resolve(session.id, ask.engineRequestId, true)
    replaceMessage(session.id, ask.bubbleId, `已批准 · ${ask.action}`)
    mutateSession(session.id, (s) => {
      s.pendingAsk = null
      s.status = 'streaming'
    })
    return snapshot()
  }

  function deny(sessionId?: string): AppState {
    const session = pickSession(sessionId)
    const ask = session.pendingAsk
    if (!ask) throw new Error('现在没有要批准的')
    if (!bridge) throw new Error('引擎还没接上')
    bridge.resolve(session.id, ask.engineRequestId, false)
    replaceMessage(session.id, ask.bubbleId, `已拒绝 · ${ask.action}`)
    mutateSession(session.id, (s) => {
      s.pendingAsk = null
      s.status = 'streaming'
    })
    return snapshot()
  }

  async function submit(text: string): Promise<AppState> {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('empty')

    if (page === 'sign-in' || page === 'sign-up' || page === 'welcome') {
      return requestCode({ email: trimmed })
    }
    if (page === 'verify-email') {
      return verifyCode(trimmed)
    }

    if (page === 'onboarding-team') {
      team = { ...team, name: trimmed || team.name, created: true }
      page = 'settings-members'
      modal = 'plan'
      return emit()
    }

    if (page === 'settings-plan' && !modal) {
      account = { ...account, plan: 'pro' }
      saveAccount(account)
      page = 'agents-home'
      return emit()
    }

    if (isPluginPage(page)) {
      plugins = { ...plugins, query: trimmed, market: false, toast: null }
      page = 'settings-plugins'
      modal = null
      return emit()
    }

    if (isAutoPage(page)) {
      return addRoutine({
        name: titleFrom(trimmed),
        instruction: trimmed,
        cron: '0 9 * * *'
      })
    }

    if (isTaskPage(page)) {
      return sendChat(beginChat(trimmed, true), trimmed)
    }

    const session = beginChat(trimmed, false)
    page = 'chat'
    return sendChat(session, trimmed)
  }

  function newAgent(): AppState {
    activeSessionId = null
    desktopFull = false
    page = 'agents-home'
    return emit()
  }

  async function refreshWorktrees(): Promise<AppState> {
    worktrees = { ...worktrees, loading: true, error: null }
    emit()
    worktrees = await listOfficialWorktrees(workspacePath)
    return emit()
  }

  function adoptWorktreeSession(cwd: string, title: string, label: string | null): Session {
    const session: Session = {
      id: nid('s'),
      title,
      messages: [],
      kind: 'chat',
      workspacePath: cwd,
      worktreeLabel: label
    }
    sessions = [session, ...sessions]
    activeSessionId = session.id
    page = 'chat'
    desktopFull = false
    return session
  }

  async function startIsolated(label?: string): Promise<AppState> {
    if (!workspacePath) throw new Error(NO_WORKSPACE_TEXT)
    if (!bridge) throw new Error(NO_GROK_TEXT)
    const created = await bridge.createWorktree({
      sourcePath: workspacePath,
      label: label?.trim() || undefined
    })
    const cwd = created.sessionCwd || created.worktreePath
    const name = created.label || folderName(cwd)
    const session = adoptWorktreeSession(cwd, `隔离 · ${name}`, name)
    try {
      await bridge.ensure(session.id, cwd)
    } catch (err) {
      addAssistant(session.id, publicError(err))
      setSessionStatus(session.id, 'error')
    }
    await refreshWorktrees()
    page = 'chat'
    return emit()
  }

  async function openWorktree(path: string): Promise<AppState> {
    const cwd = resolveWorkspaceDir(path)
    const name = folderName(cwd)
    const session = adoptWorktreeSession(cwd, `隔离 · ${name}`, name)
    if (bridge) {
      try {
        await bridge.ensure(session.id, cwd)
      } catch (err) {
        addAssistant(session.id, publicError(err))
        setSessionStatus(session.id, 'error')
      }
    }
    return emit()
  }

  async function forkSession(input?: { id?: string; isolate?: boolean }): Promise<AppState> {
    if (!bridge) throw new Error(NO_GROK_TEXT)
    let sourceId = (input?.id ?? '').trim()
    if (!sourceId) {
      const cur = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : undefined
      sourceId = (cur?.cliSessionId || (cur?.kind === 'cli' ? cur.id : '') || '').trim()
    }
    if (!sourceId) throw new Error('分叉要一条 CLI 会话 id。用法：workbench fork <session-id>')
    if (!isSessionId(sourceId)) throw new Error('这不是 CLI 会话 id（需要完整 UUID）')

    const row = await lookupGrokSession(sourceId, { cwd: workspacePath })
    const sourceCwd = (row?.cwd && row.cwd.trim()) || workspacePath
    if (!sourceCwd) throw new Error('这条会话没有目录，也还没打开文件夹')

    let newCwd = sourceCwd
    let sessionKind = 'fork'
    let sourceWorkspaceDir: string | undefined
    if (input?.isolate) {
      const created = await bridge.createWorktree({
        sourcePath: sourceCwd,
        label: 'fork'
      })
      newCwd = created.sessionCwd || created.worktreePath
      sessionKind = 'worktree'
      sourceWorkspaceDir = sourceCwd
    }

    const forked = await bridge.forkSession({
      sourceSessionId: sourceId,
      sourceCwd,
      newCwd,
      sessionKind,
      sourceWorkspaceDir
    })
    const state = await resumeCli(forked.newSessionId)
    const opened = sessions.find((s) => s.cliSessionId === forked.newSessionId || s.id === forked.newSessionId)
    if (opened) {
      opened.workspacePath = forked.newCwd
      if (input?.isolate || isWorktreePath(forked.newCwd)) {
        opened.worktreeLabel = folderName(forked.newCwd)
      }
    }
    if (input?.isolate) await refreshWorktrees()
    return opened ? emit() : state
  }

  async function housekeepWorktree(input: {
    action: string
    ids?: string[]
    confirm?: boolean
    extra?: string[]
  }): Promise<AppState> {
    const action = String(input.action ?? '').trim()
    const ids = (input.ids ?? []).map((x) => String(x).trim()).filter(Boolean)
    const extra = (input.extra ?? []).map((x) => String(x).trim()).filter(Boolean)
    const argv = [action, ...ids, ...extra]
    const ran = await runWorktreeHousekeep({
      argv,
      cwd: workspacePath,
      confirm: input.confirm === true
    })
    if (!ran.ok) throw new Error(ran.error || '官方 housekeeping 失败')
    await refreshWorktrees()
    return emit()
  }

  return {
    get: snapshot,
    setReady,
    goto,
    setModal,
    setPlan,
    setSpendLimit,
    updateProfile,
    logout,
    deactivate,
    openSession,
    resumeCli,
    continueRecent,
    renameLocalTitle,
    dropCliSession,
    submit,
    setBridge,
    enginePolicy,
    engineModel,
    engineEffort,
    engineSandbox,
    setAgentMode,
    setAgentEffort,
    setAgentSandbox,
    setAgentPlan,
    followCliMode,
    setAgentModel,
    followCliModel,
    refreshModels,
    setGrok,
    setWorkspace,
    addUser,
    addAssistant,
    appendAssistant,
    replaceMessage,
    setSessionStatus,
    bindCliSessionId,
    noteStreamHint,
    setPendingAsk,
    cancel,
    allow,
    deny,
    requestCode,
    verifyCode,
    enter,
    newAgent,
    startIsolated,
    openWorktree,
    forkSession,
    refreshWorktrees,
    housekeepWorktree,
    addRoutine,
    toggleRoutine,
    removeRoutine,
    runRoutine,
    startRoutines,
    subscribe(fn: (state: AppState) => void): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
  }
}

export type Store = ReturnType<typeof createStore>
