export type { PageId } from './pages.js'
import type { PageId } from './pages.js'
import type { WorktreeState } from './grok-worktree.js'

export type { WorktreeRow, WorktreeState } from './grok-worktree.js'

export type Role = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: Role
  text: string
  ts: number
}

export type SessionKind = 'chat' | 'setup' | 'task' | 'cli'

export type ChatStatus = 'idle' | 'streaming' | 'waiting' | 'error'

export type StreamHint = 'delta' | 'batch'

export type QueuedTurn = {
  text: string
  messageId: string
}

export type PendingAsk = {
  id: string
  engineRequestId: string
  action: string
  detail: string
  bubbleId: string
}

export type FlybyProbe = {
  ok: boolean
  bridgeUp: boolean
  extensionConnected: boolean
  detail: string
}

export type GrokProbe = {
  cli: boolean
  acp: boolean
  acpDetail: string
  hasConfig: boolean
  mcp: string[]
  flyby: FlybyProbe
}

export type Session = {
  id: string
  title: string
  messages: ChatMessage[]
  kind?: SessionKind
  badge?: string
  status?: ChatStatus
  unread?: boolean
  pendingAsk?: PendingAsk | null
  /** 本会话开口时钉住的目录；换工作区不会改这条 */
  workspacePath?: string
  /** 从 CLI session/load 接上时记下的官方会话 id */
  cliSessionId?: string
  /** 官方 worktree 标签；有则这条是隔离会话 */
  worktreeLabel?: string | null
  /** 这一轮开口时刻；用来画「已等几秒」，不是假进度 */
  turnStartedAt?: number
  /** 这一轮有没有接到 assistant 增量。没有就老实说整段到齐才显示 */
  streamHint?: StreamHint
  /** 发送中再打的下一句；回完自动发 */
  queued?: QueuedTurn[]
}

export type Workspace = {
  path: string | null
  name: string | null
}

/** 官方 CLI 三档：Ask / Auto / Always-approve */
export type AgentPermMode = 'ask' | 'auto' | 'always-approve'

/** 引擎 ACP 四态（plan 由 Plan 开关单独打开） */
export type AgentEnginePolicy = 'ask' | 'accept_edits' | 'plan' | 'yolo'

export type AgentModeState = {
  mode: AgentPermMode
  plan: boolean
  cliMode: AgentPermMode
  followCli: boolean
  policy: AgentEnginePolicy
  coverNote: string | null
  liveApply: string
  label: string
  official: string
  /** 官方 --effort；空 = 不传 */
  effort: string
  /** 官方 --sandbox / GROK_SANDBOX；off = 不传 */
  sandbox: string
}

/** 本机 `grok models` 一条 */
export type AgentModelEntry = {
  id: string
  isDefault?: boolean
}

/** 窗上当前模型。current 来自用户点选，或 CLI 默认标记 */
export type AgentModelState = {
  current: string
  defaultModel: string
  list: AgentModelEntry[]
  followCli: boolean
  liveApply: string
  detail: string
}

export type PlanId = 'free' | 'pro' | 'pro+' | 'ultra'

export type AccountModal =
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

export type AutoTab = 'settings' | 'history'

export type AutoTriggerKind = 'schedule' | 'pr-opened' | 'pr-pushed' | 'pr-merged'

export type AutoTrigger = {
  id: string
  kind: AutoTriggerKind
  repo: string
  branch?: string
  weekday?: string
  time?: string
  tz?: string
  who: string[]
}

export type AutoTool = {
  id: string
  kind: 'memories' | 'slack' | 'pr-comment'
  label: string
  extra?: string
}

export type Automation = {
  id: string
  name: string
  author: string
  created: string
  active: boolean
  saved: boolean
  instructions: string
  model: string
  triggers: AutoTrigger[]
  tools: AutoTool[]
  envOn: boolean
  slackWarn: boolean
}

export type AutoState = {
  items: Automation[]
  draft: Automation
  tab: AutoTab
  toast: string | null
  previewId: string
  testUrl: string
}

export type RoutineRunRow = {
  id: string
  sessionId: string
  startedAt: number
  durationMs: number
  status: 'ok' | 'fail'
  summary?: string
}

export type RoutineRow = {
  id: string
  name: string
  instruction: string
  cron: string
  enabled: boolean
  nextRunAt?: number
  lastRunAt?: number
  lastStatus?: 'ok' | 'fail'
  lastSummary?: string
  lastSessionId?: string
  running: boolean
  runs: RoutineRunRow[]
}

export type RoutineState = {
  items: RoutineRow[]
  activeId: string | null
  toast: string | null
}

export type Account = {
  email: string | null
  firstName: string
  lastName: string
  signedIn: boolean
  plan: PlanId
  spendLimit: number | null
}

export type SetupPhase = 'running' | 'savable' | 'done'
export type AgentTab = 'setup' | 'secrets' | 'git' | 'desktop' | 'terminal'
export type TaskKind = 'setup' | 'task'

export type CloudApiKey = {
  id: string
  name: string
  tokenHint: string
  scope: string
  created: string
}

export type CloudSecret = {
  id: string
  name: string
  repos: string
  type: string
}

export type SetupRun = {
  id: string
  status: string
  snapshot: string
  pr: boolean
  created: string
}

export type CloudState = {
  envReady: boolean
  gitConnected: boolean
  selfHosted: boolean
  slackLinked: boolean
  slackNotify: boolean
  testingOn: boolean
  network: 'all' | 'restricted'
  defaultModel: string
  defaultRepo: string
  baseBranch: string
  branchPrefix: string
  snapshotId: string
  updateScript: string
  revealedKey: string | null
  apiKeys: CloudApiKey[]
  secrets: CloudSecret[]
  setupRuns: SetupRun[]
  routeRule: boolean
  gitlabConnected: boolean
  linearLinked: boolean
}

export type PluginMark =
  | 'slack'
  | 'datadog'
  | 'figma'
  | 'linear'
  | 'render'
  | 'jfrog'
  | 'planetscale'
  | 'cloudflare'
  | 'pendo'
  | 'gitlab'
  | 'langfuse'
  | 'plus'
  | 'plain'
  | 'learn'

export type PluginItem = {
  id: string
  name: string
  publisher: string
  blurb: string
  mcp: string
  mark: PluginMark
  user?: boolean
}

export type PluginTab = 'all' | 'user'

export type PluginState = {
  installed: string[]
  activeId: string
  query: string
  tab: PluginTab
  market: boolean
  visibility: 'private' | 'shared'
  toast: string | null
}

export type TeamSeats = '1' | '5' | '10' | 'custom'

export type TeamState = {
  name: string
  seats: TeamSeats
  customSeats: number
  yearly: boolean
  share: boolean
  created: boolean
}

export type BugbotView = 'home' | 'repos'

export type BugbotReview = {
  id: string
  title: string
  status: 'Open' | 'Merged'
  author: string
  issues: string
  date: string
}

export type BugbotRule = {
  id: string
  name: string
  repo: string
  org: string
  content: string
  enabled: boolean
  paths: string[]
}

export type BugbotRepo = {
  id: string
  name: string
  on: boolean
}

export type BugbotState = {
  enabled: boolean
  view: BugbotView
  reviews: BugbotReview[]
  rules: BugbotRule[]
  repos: BugbotRepo[]
  draft: BugbotRule
  toast: string | null
  mentionOnly: boolean
  runOnce: boolean
  draftPrs: string
  summaries: string
  autofix: string
  severity: string
  learningOn: boolean
  range: '1d' | '7d' | '30d'
}

export type AppState = {
  page: PageId
  sessions: Session[]
  activeSessionId: string | null
  ready: boolean
  shown: boolean
  account: Account
  pendingEmail: string | null
  modal: AccountModal
  cloud: CloudState
  setupPhase: SetupPhase
  agentTab: AgentTab
  taskKind: TaskKind
  desktopFull: boolean
  auto: AutoState
  routines: RoutineState
  bugbot: BugbotState
  plugins: PluginState
  team: TeamState
  grok: GrokProbe
  workspace: Workspace
  agent: AgentModeState
  models: AgentModelState
  worktrees: WorktreeState
}

export type ControlInfo = {
  host: '127.0.0.1'
  port: number
  pid: number
  shown: boolean
}
