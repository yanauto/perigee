/**
 * window.perigee 的前端类型契约（镜像 preload）。
 * 改 API 须同步：preload/index.ts + docs/API-preload.md
 *
 * SessionEvent / SessionStatus：**单源** `packages/event-schema`（勿再手写镜像）。
 */

import type {
  SessionEvent,
  SessionStatus,
  ErrorCode,
  RiskLevel
} from '@perigee/event-schema'
import { EVENT_SCHEMA_VERSION } from '@perigee/event-schema'

export type { SessionEvent, SessionStatus, ErrorCode, RiskLevel }
export { EVENT_SCHEMA_VERSION }

export type SessionAttention = 'working' | 'needs_input' | 'unread' | 'read'

export type SessionRecord = {
  id: string
  title: string
  workspacePath: string
  primaryWorkspacePath?: string
  worktreePath?: string
  worktreeBranch?: string
  kind?: 'main' | 'side'
  parentSessionId?: string
  status: SessionStatus | string
  createdAt: string
  updatedAt: string
  engineId: string
  /**
   * 引擎侧会话 id。**被 resumeExternal 恢复的 CLI 会话**会把 CLI transcript 的 id 写在这里
   * （host `resumeCli`），是 Desktop 会话 ↔ 外部 CLI 会话的唯一关联键。
   * T025-返修：类型镜像原来漏了这个字段，侧栏因此无法跨源去重（同一会话列两遍）。
   */
  engineSessionId?: string
  /** T008：会话状态归一（前端不自己拼；桥未就绪时缺省，UI 回退 status 映射） */
  attention?: SessionAttention
  lastActivityAt?: number
  lastReadAt?: number | null
}

/** T008：用量聚合（Desktop transcript + CLI summary 两路合并，按 sessionId 去重） */
export type UsageStats = {
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  peakHour: number | null
  favoriteModel: string | null
  daily: Array<{ date: string; tokens: number; messages: number }>
  byModel: Array<{
    model: string
    tokens: number
    messages: number
    /** T012：模型级 in/out 明细（未就绪时缺省，图例降级只列模型名） */
    inputTokens?: number
    outputTokens?: number
  }>
  /** T012：日期×模型矩阵（未就绪时缺省，图表降级单色柱） */
  dailyByModel?: Array<{ date: string; model: string; tokens: number }>
}

/* ---------- T005：CLI 桥类型（契约见 docs/API-preload.md session 段） ---------- */

export type ExternalCliSession = {
  id: string
  title: string
  cwd: string
  createdAt: string
  updatedAt: string
  modelId?: string
  reasoningEffort?: string
  numMessages?: number
  agentName?: string
  summaryPath: string
}

export type ResumeExternalResult = {
  ok: boolean
  session?: SessionRecord
  external?: ExternalCliSession
  reason?: string
  detail?: string
}

export type CommandSupport = 'full' | 'partial' | 'unsupported'

export type CommandCapability = {
  name: string // model | effort | compact | rewind | mcps | skill
  support: CommandSupport
  detail: string
  evidence?: string
}

export type SessionCommandResult = {
  ok: boolean
  status: 'ok' | 'unsupported' | 'error'
  command: string
  detail: string
  data?: unknown
}

export type WorktreeStatus = {
  ok: boolean
  reason?: string
  worktreePath?: string
  branch?: string
  dirty?: boolean
  dirtyCount?: number
  ahead?: number
  behind?: number
  shortstat?: string
  commitsAheadOfPrimary?: number
}

export type PromoteResult = {
  ok: boolean
  reason?: string
  branch?: string
  pushed?: boolean
  prUrl?: string
  prCreated?: boolean
  detail: string
}

export type DirEntry = {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size?: number
}

export type FileDiff = {
  id: string
  sessionId: string
  relativePath: string
  absPath: string
  before: string | null
  after: string | null
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  turnId?: string
  /** 预计算行统计；contentOmitted 广播时仍可用于 +/− 展示 */
  lineAdd?: number
  lineDel?: number
  contentOmitted?: boolean
}

/* ---------- routines（T018 契约镜像；字段以 docs/API-preload.md 为准，前端不自造） ---------- */

export type RoutineTrigger = {
  kind: 'daily' | 'weekly' | 'interval'
  /** 'HH:mm'，daily / weekly */
  time?: string
  /** 0–6，weekly */
  weekday?: number
  /** interval */
  everyMinutes?: number
}

export type RoutineRun = {
  id: string
  /** 产生的会话，可跳转 */
  sessionId: string
  startedAt: number
  durationMs: number
  status: 'ok' | 'fail'
  summary?: string
}

export type Routine = {
  id: string
  name: string
  /** 派活指令（首条 prompt） */
  instruction: string
  enabled: boolean
  /** 工作区绝对路径 */
  workspace: string
  model: string
  effort?: string
  triggers: RoutineTrigger[]
  /** 允许的 MCP 连接器名 */
  mcpServers: string[]
  notify: boolean
  createdAt: number
  /** 新在前，最多 50 */
  runs: RoutineRun[]
}

/** 派生 nextRunAt；仅 enabled 时有值 */
export type RoutineView = Routine & { nextRunAt?: number }
export type RoutineCreateInput = Omit<Routine, 'id' | 'createdAt' | 'runs'>
export type RoutinePatch = Partial<Omit<Routine, 'id' | 'createdAt' | 'runs'>>

export type EngineMode = 'acp' | 'headless' | 'stub'

/** Desktop 四态：ask≈Manual · accept_edits · plan · yolo≈Bypass */
export type PermissionPolicy = 'ask' | 'accept_edits' | 'plan' | 'yolo'

export type AppSettings = {
  engineMode: EngineMode
  grokBinary: string
  model: string
  maxTurns: number
  alwaysApproveTools: boolean
  /** 权限策略（发送区与设置可热切；ask 需 ACP 才能真·人审） */
  permissionPolicy: PermissionPolicy
  useWorktree?: boolean
  notifyOnTurnEnd?: boolean
  /** E：终端真执行 shell（非完整交互 PTY） */
  terminalShellEnabled?: boolean
  /** F2：跨会话投递闸 */
  crossSessionSendEnabled?: boolean
  lastPreviewUrl?: string
  terminalMode?: 'echo' | 'shell-c' | 'pty'
  theme: 'dark' | 'light'
  fontSize: number
  layout: {
    railWidth: number
    contextWidth: number
    filePaneWidth?: number
    inspectorWidth?: number
    terminalHeight?: number
    viewMode?: 'normal' | 'verbose' | 'summary'
    /** chat | 双会话分屏 | diff 主区 | 文件主区 */
    mainPane?: 'chat' | 'split' | 'diff' | 'file'
    contextTab: 'files' | 'md' | 'diff' | 'terminal' | 'settings'
    panes?: {
      file: boolean
      terminal: boolean
      inspector: boolean
    }
  }
  mcp: {
    servers: {
      name: string
      command: string
      enabled: boolean
      args?: string[]
      url?: string
      type?: 'stdio' | 'http' | 'sse'
    }[]
  }
  gcu: { bridgeUrl: string }
}

export type GhRepoStatus = {
  ok: boolean
  detail: string
  /** 当前工作区是否为 git 仓；主页 worktree chip 门闩 */
  isGit: boolean
  branch?: string
  remote?: string
  ahead?: number
  behind?: number
  dirty?: boolean
  prUrl?: string
  prNumber?: number
  prTitle?: string
  ghAvailable: boolean
}

export type AppInfo = {
  name: string
  version: string
  phase: string
  engineId: string
  engineName: string
  engineModeConfigured?: string
  engineModeActual?: string
  grokAvailable: boolean
  platform: string
  security: { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean }
}

export type SkillEntry = {
  name: string
  path: string
  description: string
  source: 'user' | 'bundled'
}

/** ADR 0010 · GCU 效应器探测 */
export type GcuProbe = {
  ok: boolean
  bridgeUp: boolean
  extensionConnected: boolean
  version?: string
  detail: string
  bridgeUrl: string
  mcpCommand?: string
  mcpCommandResolved: boolean
  hint?: string
}

export type IntegrationsStatus = {
  gcu: GcuProbe
  mcp: { name: string; command: string; enabled: boolean }[]
  grokBinary: string
  grokAvailable: boolean
  skills?: SkillEntry[]
  multimodal?: {
    supported: boolean
    image?: boolean
    embeddedContext?: boolean
    detail: string
  }
  modelHotSwitch?: { policy: 'rebuild' | 'hot'; detail: string }
  terminalShell?: { enabled: boolean; detail: string }
  crossSession?: { enabled: boolean; detail: string }
  mcpHotReload?: { ok: boolean; detail: string; at?: string | null }
  permissionHot?: { ok: boolean; detail: string; at?: string | null }
  acpHot?: {
    mcp: { ok: boolean; detail: string; at: string | null }
    model: { ok: boolean; detail: string; at: string | null }
    mode: { ok: boolean; detail: string; at: string | null }
  } | null
  liveSessionCount?: number
  gh?: GhRepoStatus
}

export type WorkspaceState = {
  recentWorkspaces: { path: string; name: string; lastOpenedAt: string }[]
  lastWorkspacePath: string | null
  currentWorkspace: string | null
}

/** T006：上下文占比 */
export type SessionContextInfo = {
  ok: boolean
  usedTokens?: number
  windowTokens?: number
  usagePct?: number
  modelId?: string
  source: string
  detail?: string
  raw?: unknown
}

export type PerigeeApi = {
  getAppInfo: () => Promise<AppInfo>
  settings: {
    get: () => Promise<AppSettings>
    update: (partial: Partial<AppSettings>) => Promise<AppSettings>
    onChanged: (cb: (s: AppSettings) => void) => () => void
  }
  workspace: {
    getState: () => Promise<WorkspaceState>
    openDialog: () => Promise<{ ok: boolean; path?: string; reason?: string }>
    openPath: (path: string) => Promise<{ ok: boolean; path?: string; reason?: string }>
    close: () => Promise<{ ok: boolean }>
    reveal: (path: string) => Promise<void>
    onChanged: (
      cb: (payload: { currentWorkspace: string | null; state: WorkspaceState }) => void
    ) => () => void
  }
  fs: {
    list: (rel: string, depth?: number) => Promise<DirEntry[]>
    read: (rel: string) => Promise<{ path: string; content: string; truncated: boolean }>
    write: (rel: string, content: string) => Promise<{ path: string }>
    /** T006：webUtils.getPathForFile（同步） */
    pathForFile: (file: File) => string
  }
  md: {
    render: (source: string) => Promise<{
      html: string
      toc: { id: string; level: number; text: string }[]
    }>
  }
  session: {
    list: () => Promise<SessionRecord[]>
    /** T005：枚举本机 CLI 会话（~/.grok/sessions，磁盘扫描，不依赖 ACP 活进程） */
    listExternal: (opts?: { cwd?: string; limit?: number }) => Promise<ExternalCliSession[]>
    /** T005：ACP session/load 恢复 CLI 会话（需 engineMode=acp）；历史经事件流回放 */
    resumeExternal: (cliSessionId: string) => Promise<ResumeExternalResult>
    /** T030：物理删除外部 CLI 会话的 transcript 目录（不可恢复；安全闸在 host-core） */
    removeExternal: (
      cliSessionId: string
    ) => Promise<
      { ok: true; removed: string } | { ok: false; reason: string; detail?: string }
    >
    /** T005：Slash/命令路由，如 `model grok-4.5` / `effort low` / `compact` / `mcps list` / skill 名 */
    command: (sessionId: string, cmd: string) => Promise<SessionCommandResult>
    /** T005：各命令支持状态（feature-detect 用） */
    commandCapabilities: () => Promise<CommandCapability[]>
    /** T008：用户查看会话时标记已读（驱动 attention 归一） */
    markRead: (sessionId: string) => Promise<void>
    get: (id: string) => Promise<SessionRecord | null>
    create: (title?: string) => Promise<SessionRecord>
    createSide: (parentSessionId: string) => Promise<SessionRecord>
    revealWorktree: (sessionId: string) => Promise<{ ok: boolean; path?: string; reason?: string }>
    discardWorktree: (
      sessionId: string
    ) => Promise<{ ok: boolean; discarded?: boolean; reason?: string }>
    worktreeStatus: (sessionId: string) => Promise<WorktreeStatus>
    promote: (
      sessionId: string,
      opts?: { pushOnly?: boolean; title?: string; body?: string; base?: string }
    ) => Promise<PromoteResult>
    send: (
      sessionId: string,
      text: string,
      opts?: { mediaPaths?: string[] }
    ) => Promise<{ ok: boolean; mediaCount?: number }>
    sendCross: (
      fromSessionId: string,
      toSessionId: string,
      text: string
    ) => Promise<{ ok: boolean; reason?: string }>
    history: (sessionId: string) => Promise<SessionEvent[]>
    cancel: (sessionId: string) => Promise<{ ok: boolean }>
    export: (sessionId: string) => Promise<{ ok: boolean; path?: string }>
    restart: (sessionId: string) => Promise<{ ok: boolean }>
    rename: (sessionId: string, title: string) => Promise<SessionRecord>
    remove: (sessionId: string) => Promise<{ ok: boolean }>
    /** T006：上下文窗口占比 */
    contextInfo: (sessionId: string) => Promise<SessionContextInfo>
    onEvent: (cb: (event: SessionEvent) => void) => () => void
    onUpdated: (cb: (sessions: SessionRecord[]) => void) => () => void
  }
  diff: {
    list: (sessionId?: string) => Promise<FileDiff[]>
    unified: (id: string) => Promise<string>
    accept: (id: string) => Promise<FileDiff>
    reject: (id: string) => Promise<FileDiff>
    acceptAll: (sessionId: string) => Promise<FileDiff[]>
    rejectAll: (sessionId: string) => Promise<FileDiff[]>
    revertTurn: (sessionId: string, turnId: string) => Promise<FileDiff[]>
    onUpdated: (cb: (list: FileDiff[]) => void) => () => void
  }
  approval: {
    list: (sessionId?: string) => Promise<unknown[]>
    resolve: (id: string, approved: boolean, policy?: string) => Promise<unknown>
    onUpdated: (cb: (list: unknown) => void) => () => void
  }
  terminal: {
    read: (sessionId: string) => Promise<string>
    clear: (sessionId: string) => Promise<{ ok: boolean }>
    write: (
      sessionId: string,
      line: string
    ) => Promise<{ ok: boolean; mode?: string; reason?: string }>
    writeRaw?: (sessionId: string, data: string) => Promise<{ ok: boolean; reason?: string }>
    resize?: (
      sessionId: string,
      cols: number,
      rows: number
    ) => Promise<{ ok: boolean; reason?: string }>
    attach?: (
      sessionId: string,
      size?: { cols: number; rows: number }
    ) => Promise<{ ok: boolean; mode?: string; reason?: string }>
    availability?: () => Promise<{
      pty: boolean
      reason?: string
      shell: string
      fallback: 'shell-c' | 'echo'
    }>
    kill: (sessionId: string) => Promise<{ ok: boolean }>
    status: (sessionId: string) => Promise<{
      cwd: string | null
      shellEnabled: boolean
      running: boolean
      mode: string
      ptyAlive?: boolean
    }>
    onData: (cb: (payload: { sessionId: string; chunk: string }) => void) => () => void
    onExit?: (cb: (payload: { sessionId: string; exitCode: number | null }) => void) => () => void
  }
  preview: {
    open: (url: string) => Promise<{ ok: boolean; url?: string; reason?: string }>
  }
  /** T027：系统级打开（应用内读不了的文件的兜底出口） */
  system: {
    /** 系统默认应用打开（shell.openPath） */
    openPath: (path: string) => Promise<{ ok: boolean; reason?: string }>
    /** Finder 中显示（与 workspace.reveal 同一实现） */
    revealInFinder: (path: string) => Promise<{ ok: boolean; reason?: string }>
  }
  integrations: {
    status: () => Promise<IntegrationsStatus>
    listSkills: () => Promise<SkillEntry[]>
    listModels: () => Promise<{
      defaultModel?: string
      models: { id: string; isDefault?: boolean }[]
      detail: string
    }>
    setMcpEnabled: (
      name: string,
      enabled: boolean
    ) => Promise<{ name: string; command: string; enabled: boolean }[]>
    ghStatus: () => Promise<GhRepoStatus>
    gcuStatus: () => Promise<GcuProbe>
    gcuAlignMcpCommand: () => Promise<{
      ok: boolean
      command: string
      resolved: boolean
      source: string
      servers: { name: string; command: string; enabled: boolean }[]
    }>
    rebuildEngine: () => Promise<{ ok: boolean; engineId?: string; engineModeActual?: string }>
  }
  clipboard: {
    write: (text: string) => Promise<{ ok: boolean }>
    /** T006：剪贴板图落盘，绝对路径；无图 null */
    saveImage: () => Promise<string | null>
  }
  /** T008：用量聚合（Desktop + CLI 两路合并） */
  stats: {
    usage: (range?: 'all' | '30d' | '7d') => Promise<UsageStats>
  }
  /** T018：定时任务（数据落 userData/routines.json；契约见 docs/API-preload.md） */
  routines: {
    list: () => Promise<RoutineView[]>
    create: (input: RoutineCreateInput) => Promise<RoutineView>
    update: (id: string, patch: RoutinePatch) => Promise<RoutineView>
    remove: (id: string) => Promise<void>
    toggle: (id: string, enabled: boolean) => Promise<RoutineView>
    runNow: (id: string) => Promise<{ runId: string; sessionId: string }>
    /** 全量推送 */
    onChanged: (cb: (routines: RoutineView[]) => void) => () => void
  }
  /** T008：通用 UI 状态小桶（schema 归前端管） */
  uiState: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
  menu: {
    on: (name: string, cb: () => void) => () => void
  }
  securityProbe: {
    hasRequire: boolean
  }
}

declare global {
  interface Window {
    perigee: PerigeeApi
  }
}

export {}
