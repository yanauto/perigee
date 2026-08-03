/**
 * Main 进程共享上下文：IPC / wireBus / createEngine 经此访问运行时状态。
 * 状态本体仍由 index 持有；此处只定义契约。
 */
import type { BrowserWindow } from 'electron'
import type { MediaPart, AgentEngine } from '@perigee/engine-protocol'
import type {
  EventBus,
  SessionManager,
  WorkspaceStore,
  FsService,
  DiffService,
  TurnTracker,
  ApprovalGate,
  TranscriptStore,
  SettingsStore,
  SessionStore,
  WorktreeService,
  ShellRunner,
  UsageLedger,
  UiStateStore,
  RoutineStore,
  RoutineScheduler,
  SessionRecord,
  AppSettings,
  Routine,
  RoutineFireResult
} from '@perigee/host-core'
import type { SessionEvent } from '@perigee/event-schema'
import type { PtyService } from './pty-service.js'

/** agentConfigFromCli 返回值 */
export type AgentConfigFromCli = {
  snap: ReturnType<typeof import('@perigee/host-core').loadGrokConfigSnapshot>
  permissionPolicy: AppSettings['permissionPolicy']
  permissionNote: string | undefined
  cliPermissionRaw: string | null | undefined
  model: string
  mcpServers: Array<{
    name: string
    command: string
    enabled: boolean
    args?: string[]
    env?: Record<string, string>
    headers?: Record<string, string>
    url?: string
    type: 'http' | 'stdio'
  }>
  acpMcp: ReturnType<typeof import('@perigee/host-core').toAcpMcpServers>
}

export type OpenWorkspaceResult =
  | { ok: true; path: string; state: ReturnType<WorkspaceStore['load']> }
  | { ok: false; reason: string }

/**
 * 所有 handler / wireBus / createEngine 需要的运行时面。
 * 可变字段为可写属性；方法绑定到 index 持有的状态。
 */
export interface MainCtx {
  mainWindow: BrowserWindow | null
  readonly bus: EventBus
  readonly turnTracker: TurnTracker
  settingsStore: SettingsStore
  workspaceStore: WorkspaceStore
  transcript: TranscriptStore
  sessionStore: SessionStore
  sessions: SessionManager
  fsService: FsService | null
  fsFallback: FsService | null
  diffs: DiffService | null
  worktrees: WorktreeService | null
  uiStateStore: UiStateStore
  usageLedger: UsageLedger
  routineStore: RoutineStore
  routineScheduler: RoutineScheduler
  readonly approvals: ApprovalGate
  currentWorkspace: string | null
  engine: AgentEngine
  engineModeActual: string
  readonly termBuffers: Map<string, string>
  readonly routineSessionIds: Set<string>
  readonly shellRunner: ShellRunner
  readonly ptyService: PtyService

  broadcast(channel: string, payload: unknown): void
  broadcastDiffs(): void
  notify(title: string, body: string): void
  flushDeltaBroadcast(): void
  enqueueDeltaBroadcast(event: SessionEvent): void
  fsAnyPath(): FsService
  revealInFinder(p: string): { ok: boolean; reason?: string }
  persistSession(rec: SessionRecord, engineSessionId?: string): void
  createEngine(settings: AppSettings): AgentEngine
  agentConfigFromCli(): AgentConfigFromCli
  loadMediaParts(relPaths: string[], workspaceRoot: string | null): MediaPart[]
  appendTerm(sessionId: string, chunk: string): void
  openWorkspace(path: string): OpenWorkspaceResult
  fireRoutineSession(routine: Routine): Promise<RoutineFireResult>
  grokVersion(): string | null
  numOrUndef(v: unknown): number | undefined
}
