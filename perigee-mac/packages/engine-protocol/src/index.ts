import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso,
  type SessionEvent
} from '@perigee/event-schema'

export { grokHome, resolveGrokBinary } from './grok-binary.js'
export { killProcessTree, type KillSignal } from './process-kill.js'
export {
  type PermissionPolicy,
  normalizePermissionPolicy
} from './permission-policy.js'

/** 多模态片段（D1-B：ACP image / embedded resource） */
export type MediaPart = {
  kind: 'image' | 'pdf' | 'file'
  name: string
  mimeType: string
  /** file:// URI */
  uri: string
  /** base64 载荷；缺省则仅 resource_link */
  dataBase64?: string
  byteLength?: number
}

/** 用户消息（文本 + 可选媒体） */
export interface UserMessage {
  text: string
  media?: MediaPart[]
}

export interface SessionStartOptions {
  sessionId: string
  workspacePath: string
  /** 引擎侧额外参数（模型名、flags 等） */
  meta?: Record<string, unknown>
}

export interface SessionHandle {
  sessionId: string
  engineId: string
}

/** ACP 热更/热切结果（model / mcp / effort 等） */
export type EngineHotApplyResult = {
  ok: boolean
  detail: string
  failed: number
  okCount: number
}

/** 注入 session/new 的 MCP 描述（与 Desktop/CLI 对齐的最小形状） */
export type AcpMcpServerConfig = {
  name: string
  command: string
  enabled: boolean
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  url?: string
  type?: 'stdio' | 'http' | 'sse'
}

export type AcpHotChannelStatus = {
  ok: boolean
  detail: string
  at: string | null
}

export type AcpHotStatus = {
  mcp: AcpHotChannelStatus
  model: AcpHotChannelStatus
  mode: AcpHotChannelStatus
}

export type AcpContextInfo = {
  ok: boolean
  usedTokens?: number
  windowTokens?: number
  usagePct?: number
  modelId?: string
  source: string
  detail?: string
}

/**
 * ACP 扩展能力（长活 agent stdio 才有）。
 * Headless / Stub 不实现；Host 经 `engine.acp?.…` 调用，禁止平行 acpEngineRef。
 */
export interface AcpEngineCapabilities {
  resolvePermission(
    sessionId: string,
    engineRequestId: string | number,
    approved: boolean
  ): void
  setPermissionPolicy(policy: string): void
  setModel(
    modelId: string,
    opts?: { reasoningEffort?: string }
  ): Promise<EngineHotApplyResult>
  setReasoningEffort(
    sessionId: string,
    effort: string
  ): Promise<EngineHotApplyResult>
  applyMcpServers(servers: AcpMcpServerConfig[]): Promise<EngineHotApplyResult>
  getContextInfo(sessionId: string): AcpContextInfo
  getHotStatus(): AcpHotStatus
  getPromptCapabilities(): {
    image: boolean
    audio: boolean
    embeddedContext: boolean
  }
  getModel(): string | undefined
}

/**
 * Agent 引擎适配器契约。
 * Host 只依赖此接口；Grok Build / API / 未来引擎各自实现。
 */
export interface AgentEngine {
  readonly id: string
  readonly displayName: string

  startSession(opts: SessionStartOptions): Promise<SessionHandle>
  send(sessionId: string, message: UserMessage): Promise<void>
  cancel(sessionId: string): Promise<void>
  disposeSession?(sessionId: string): Promise<void>
  getPid?(sessionId: string): number | undefined

  /** 引擎向 Host 推送事件 */
  onEvent(handler: (event: SessionEvent) => void): () => void

  /**
   * ACP 扩展能力。仅 `engine-grok-acp` 提供；
   * Host 一律 `engine.acp?.method()`，勿再维护平行 GrokAcpEngine 引用。
   */
  readonly acp?: AcpEngineCapabilities
}

/** 阶段 0 占位引擎：只回声，不调真实 Grok */
export class StubEngine implements AgentEngine {
  readonly id = 'stub'
  readonly displayName = 'Stub Engine'
  private handlers = new Set<(event: SessionEvent) => void>()
  private sessions = new Set<string>()

  async startSession(opts: SessionStartOptions): Promise<SessionHandle> {
    this.sessions.add(opts.sessionId)
    return { sessionId: opts.sessionId, engineId: this.id }
  }

  async send(sessionId: string, message: UserMessage): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`unknown session: ${sessionId}`)
    }
    const base = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      ts: nowIso()
    }
    this.emit({
      ...base,
      type: 'session.status',
      id: newEventId('st'),
      status: 'streaming'
    })
    this.emit({
      ...base,
      type: 'assistant.message',
      id: newEventId('as'),
      text: `(Stub) Message received — Grok engine is not connected yet.\n\nYou said: ${message.text}\n\nWorkspace sessions will connect to Grok Build / API in a later phase.`
    })
    this.emit({
      ...base,
      type: 'session.status',
      id: newEventId('st'),
      status: 'idle'
    })
  }

  async cancel(sessionId: string): Promise<void> {
    this.emit({
      type: 'session.status',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      id: newEventId('st'),
      ts: nowIso(),
      status: 'idle'
    })
  }

  async disposeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  onEvent(handler: (event: SessionEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emit(event: SessionEvent): void {
    for (const h of this.handlers) h(event)
  }
}
