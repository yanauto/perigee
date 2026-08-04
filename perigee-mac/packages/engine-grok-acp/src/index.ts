import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  killProcessTree,
  resolveGrokBinary,
  type AcpEngineCapabilities,
  type AgentEngine,
  type EngineHotApplyResult,
  type SessionHandle,
  type SessionStartOptions,
  type UserMessage
} from '@perigee/engine-protocol'
import {
  EVENT_SCHEMA_VERSION,
  extractDiffHints,
  extractPathsFromToolArgs,
  newEventId,
  nowIso,
  type SessionEvent
} from '@perigee/event-schema'
import { JsonRpcStdio, type JsonRpcMessage } from './jsonrpc.js'
import {
  allowsSilentClientWrite,
  autoApprovesToolPermission,
  buildAcpMcpServers,
  buildAcpStdioArgs,
  classifyToolPermission,
  deniesClientWrite,
  isComputerUseTool,
  isDangerousShell,
  normalizePermissionPolicy,
  pickDenyOptionId,
  policyToAcpModeId,
  type DesktopMcpServer,
  type PermissionPolicy
} from './permission-policy.js'
import {
  summarizeFsWrite,
  summarizePermissionRequest
} from './permission-summary.js'
import {
  buildAcpPromptBlocks,
  DEFAULT_PROMPT_CAPABILITIES,
  parsePromptCapabilities,
  type PromptCapabilities
} from './prompt-blocks.js'
import { resolveInWorkspace } from './workspace-path.js'
import {
  isExtSessionUpdateTag,
  mapExtSessionUpdate,
  normalizeAcpNotification,
  sessionUpdateTag
} from './subagent-map.js'

export type { PermissionPolicy, DesktopMcpServer } from './permission-policy.js'
export {
  allowsSilentClientWrite,
  autoApprovesToolPermission,
  buildAcpMcpServers,
  buildAcpStdioArgs,
  classifyToolPermission,
  deniesClientWrite,
  isComputerUseReadonly,
  isComputerUseTool,
  isDangerousShell,
  normalizePermissionPolicy,
  pickDenyOptionId,
  policyToAcpModeId
} from './permission-policy.js'
export {
  extractCommand,
  summarizeFsWrite,
  summarizePermissionRequest,
  type PermissionSummary
} from './permission-summary.js'
export { resolveInWorkspace } from './workspace-path.js'
export {
  normalizeAcpNotification,
  mapExtSessionUpdate,
  isExtSessionUpdateTag
} from './subagent-map.js'
export {
  buildAcpPromptBlocks,
  parsePromptCapabilities,
  mimeFromPath,
  classifyMediaPath,
  MEDIA_MAX_BYTES,
  type PromptCapabilities
} from './prompt-blocks.js'

export interface GrokAcpEngineOptions {
  binary?: string
  model?: string
  /** Desktop 四态：ask | accept_edits | plan | yolo */
  permissionPolicy?: PermissionPolicy | string
  clientVersion?: string
  /** session/new 注入的 MCP 服务器（settings 启用的子集） */
  mcpServers?: DesktopMcpServer[]
  onPermissionRequest?: (req: {
    id: string
    sessionId: string
    action: string
    detail: string
    risk: 'low' | 'medium' | 'high'
    engineRequestId: string | number
  }) => void
}

/** 热路径（set_mode / set_model / MCP 热更）最近一次结果 */
export type HotApplyResult = EngineHotApplyResult

export type AcpHotStatus = {
  mcp: { ok: boolean; detail: string; at: string | null }
  model: { ok: boolean; detail: string; at: string | null }
  mode: { ok: boolean; detail: string; at: string | null }
}

interface AcpSession {
  uiSessionId: string
  workspacePath: string
  engineSessionId?: string
  child?: ChildProcessWithoutNullStreams
  rpc?: JsonRpcStdio
  ready: Promise<void>
  resolveReady?: () => void
  rejectReady?: (e: Error) => void
  busy: boolean
  assistantBuf: string
  /** session/load 回放中：用于 flush 多轮 assistant */
  loading: boolean
  cancelled: boolean
  /** pending permission: engineRequestId -> */
  pendingPerm: Map<string | number, { uiId: string; allowOptionId?: string }>
  /** ask 下 client FS 写等待人审 */
  pendingFsWrite: Map<string | number, { path: string; content: string; uiId: string }>
  /** 已发过的 diff hint（callId:path），中间态与 completed 会重复携带 */
  diffHintsEmitted: Set<string>
  /** 最近 available_commands 名（compact/skills 探针缓存） */
  availableCommands: string[]
  /** 模型 context 窗口（来自 models._meta.totalContextTokens） */
  contextWindowTokens?: number
  modelId?: string
  /** 最近一轮已用 tokens（优先 totalTokens，否则 input+output） */
  lastUsedTokens?: number
  /**
   * T018：会话级权限覆盖（Routines 强制 yolo）。
   * 分类器 / set_mode / client 写盘均优先此字段。
   */
  permissionOverride?: PermissionPolicy
  /** T018：会话级模型（不改全局 this.model） */
  sessionModel?: string
  /** T018：会话级 reasoning effort */
  sessionEffort?: string
  /** T018：会话级 MCP 名单（已过滤）；缺省用引擎全局 */
  sessionMcpServers?: DesktopMcpServer[]
}

/**
 * 主路径引擎：长活 `grok agent stdio` + ACP JSON-RPC。
 * 一 UI 会话一子进程。
 */
export class GrokAcpEngine implements AgentEngine, AcpEngineCapabilities {
  readonly id = 'grok-acp'
  readonly displayName = 'Grok ACP (agent stdio)'
  private handlers = new Set<(e: SessionEvent) => void>()
  private sessions = new Map<string, AcpSession>()
  private binary: string
  private model?: string
  private permissionPolicy: PermissionPolicy
  private clientVersion: string
  private mcpServers: DesktopMcpServer[]
  private onPermissionRequest?: GrokAcpEngineOptions['onPermissionRequest']
  /** 最近一次 initialize 协商的 prompt 能力（全引擎共享，进程级） */
  private promptCapabilities: PromptCapabilities = { ...DEFAULT_PROMPT_CAPABILITIES }
  /** 热路径结果摘要（integrations.status 用） */
  private hotStatus: AcpHotStatus = {
    mcp: { ok: true, detail: '尚未热更', at: null },
    model: { ok: true, detail: '尚未热切', at: null },
    mode: { ok: true, detail: '尚未热切', at: null }
  }

  constructor(opts: GrokAcpEngineOptions = {}) {
    this.binary = opts.binary ?? resolveGrokBinary()
    this.model = opts.model
    this.permissionPolicy = normalizePermissionPolicy(opts.permissionPolicy ?? 'ask')
    this.clientVersion = opts.clientVersion ?? 'perigee/0.2.0'
    this.mcpServers = opts.mcpServers ?? []
    this.onPermissionRequest = opts.onPermissionRequest
  }

  /**
   * Host 经 `engine.acp` 访问扩展能力（消灭平行 acpEngineRef）。
   * 自身即实现体；getter 避免 class field 初始化时 `= this` 的时序问题。
   */
  get acp(): AcpEngineCapabilities {
    return this
  }

  getPromptCapabilities(): PromptCapabilities {
    return { ...this.promptCapabilities }
  }

  getHotStatus(): AcpHotStatus {
    return {
      mcp: { ...this.hotStatus.mcp },
      model: { ...this.hotStatus.model },
      mode: { ...this.hotStatus.mode }
    }
  }

  getModel(): string | undefined {
    return this.model
  }

  /**
   * 更新 MCP 列表：写入内存，并对已活会话发 `x.ai/session/update_mcp_servers`。
   * 证据：vendor `session_admin.rs` UpdateMcpServers / ext method。
   */
  setMcpServers(servers: DesktopMcpServer[]): void {
    this.mcpServers = servers ?? []
    void this.broadcastMcpServers()
  }

  /** 异步热更；调用方可 await 结果 */
  async applyMcpServers(servers: DesktopMcpServer[]): Promise<HotApplyResult> {
    this.mcpServers = servers ?? []
    return this.broadcastMcpServers()
  }

  getMcpServers(): DesktopMcpServer[] {
    return [...this.mcpServers]
  }

  /**
   * 热更新权限策略（不杀 ACP 子进程）。
   * 会尽量对已活会话发 `session/set_mode`（plan/ask/default）；失败可观测 lifecycle。
   */
  setPermissionPolicy(policy: PermissionPolicy | string): void {
    this.permissionPolicy = normalizePermissionPolicy(policy)
    void this.broadcastSessionMode()
  }

  getPermissionPolicy(): PermissionPolicy {
    return this.permissionPolicy
  }

  /**
   * 热切模型：`session/set_model`（不重建子进程）。
   * `reasoningEffort` 经 params._meta.reasoningEffort 传递（与 CLI /effort 同 wire）。
   * 失败不自动 rebuild；由 Host 决定是否降级。
   */
  async setModel(
    modelId: string,
    opts?: { reasoningEffort?: string }
  ): Promise<HotApplyResult> {
    const id = (modelId ?? '').trim()
    this.model = id || undefined
    if (!id) {
      const r: HotApplyResult = { ok: true, detail: 'model 已清空（仅本地记录）', failed: 0, okCount: 0 }
      this.hotStatus.model = { ok: true, detail: r.detail, at: nowIso() }
      return r
    }
    return this.broadcastSetModel(id, opts?.reasoningEffort)
  }

  /**
   * 仅改 reasoning effort：用当前 modelId + _meta.reasoningEffort 调 set_model。
   */
  async setReasoningEffort(
    sessionId: string,
    effort: string
  ): Promise<HotApplyResult> {
    const s = this.sessions.get(sessionId)
    if (!s?.rpc || !s.engineSessionId) {
      return { ok: false, detail: '会话未就绪（需 ACP）', failed: 1, okCount: 0 }
    }
    const modelId = this.model || 'grok-4.5'
    try {
      await s.rpc.request(
        'session/set_model',
        {
          sessionId: s.engineSessionId,
          modelId,
          _meta: { reasoningEffort: effort }
        },
        15_000
      )
      const detail = `effort=${effort} model=${modelId}`
      this.hotStatus.model = { ok: true, detail, at: nowIso() }
      return { ok: true, detail, failed: 0, okCount: 1 }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      this.hotStatus.model = { ok: false, detail: err, at: nowIso() }
      return { ok: false, detail: err, failed: 1, okCount: 0 }
    }
  }

  getAvailableCommands(sessionId: string): string[] {
    return this.sessions.get(sessionId)?.availableCommands ?? []
  }

  /**
   * 上下文用量（T006）：窗口来自 models._meta.totalContextTokens；
   * 已用优先 usage.totalTokens / prompt _meta.totalTokens。
   */
  getContextInfo(sessionId: string): {
    ok: boolean
    usedTokens?: number
    windowTokens?: number
    usagePct?: number
    modelId?: string
    source: string
    detail?: string
  } {
    const s = this.sessions.get(sessionId)
    if (!s) {
      return { ok: false, source: 'none', detail: 'session not found on ACP engine' }
    }
    const used = s.lastUsedTokens
    const windowTokens = s.contextWindowTokens
    if (used == null && windowTokens == null) {
      return {
        ok: false,
        source: 'acp',
        modelId: s.modelId,
        detail: '尚无 usage，且未拿到 totalContextTokens（需至少完成一轮或 session/new 带回 models）'
      }
    }
    const usagePct =
      used != null && windowTokens && windowTokens > 0
        ? Math.min(100, Math.round((used / windowTokens) * 1000) / 10)
        : undefined
    return {
      ok: true,
      usedTokens: used,
      windowTokens,
      usagePct,
      modelId: s.modelId,
      source: 'acp+usage'
    }
  }

  /**
   * 恢复 CLI 会话：boot agent stdio + session/load（回放历史 notification）。
   * 与 startSession 互斥（同 ui sessionId）。
   */
  async loadSession(opts: {
    sessionId: string
    workspacePath: string
    cliSessionId: string
  }): Promise<SessionHandle> {
    if (this.sessions.has(opts.sessionId)) {
      return { sessionId: opts.sessionId, engineId: this.id }
    }
    const s: AcpSession = {
      uiSessionId: opts.sessionId,
      workspacePath: opts.workspacePath,
      ready: Promise.resolve(),
      busy: false,
      assistantBuf: '',
      loading: true,
      cancelled: false,
      pendingPerm: new Map(),
      pendingFsWrite: new Map(),
      diffHintsEmitted: new Set(),
      availableCommands: []
    }
    s.ready = new Promise((resolve, reject) => {
      s.resolveReady = resolve
      s.rejectReady = reject
    })
    this.sessions.set(opts.sessionId, s)
    try {
      await this.boot(s, { loadCliSessionId: opts.cliSessionId })
      s.loading = false
      this.flushAssistant(s)
      this.emitStatus(opts.sessionId, 'idle')
    } catch (e) {
      this.sessions.delete(opts.sessionId)
      throw e
    }
    return { sessionId: opts.sessionId, engineId: this.id }
  }

  private async broadcastSessionMode(): Promise<HotApplyResult> {
    const modeId = policyToAcpModeId(this.permissionPolicy)
    let okCount = 0
    let failed = 0
    let lastErr = ''
    for (const s of this.sessions.values()) {
      if (!s.rpc || !s.engineSessionId) continue
      try {
        await s.rpc.request(
          'session/set_mode',
          { sessionId: s.engineSessionId, modeId },
          10_000
        )
        okCount++
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'permission.set_mode.ok',
          detail: { modeId, policy: this.permissionPolicy }
        })
      } catch (e) {
        failed++
        lastErr = e instanceof Error ? e.message : String(e)
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'permission.set_mode.fail',
          detail: {
            modeId,
            policy: this.permissionPolicy,
            error: lastErr
          }
        })
      }
    }
    const detail =
      failed === 0
        ? okCount
          ? `set_mode=${modeId}（${okCount} 会话）`
          : `set_mode=${modeId}（无活会话，下次 session/new 后生效）`
        : `set_mode 失败 ${failed}：${lastErr}`
    const result: HotApplyResult = { ok: failed === 0, detail, failed, okCount }
    this.hotStatus.mode = { ok: result.ok, detail, at: nowIso() }
    return result
  }

  private async broadcastMcpServers(): Promise<HotApplyResult> {
    let okCount = 0
    let failed = 0
    let lastErr = ''
    for (const s of this.sessions.values()) {
      if (!s.rpc || !s.engineSessionId) continue
      // 会话级 MCP 白名单：热更时只刷新名单内服务器，不全量灌入（审计 Z3-03）
      let source = this.mcpServers
      if (s.sessionMcpServers?.length) {
        const allow = new Set(s.sessionMcpServers.map((m) => m.name))
        source = this.mcpServers.filter((m) => allow.has(m.name))
        // 同步会话侧缓存为过滤后列表
        s.sessionMcpServers = source
      }
      const mcpServers = buildAcpMcpServers(source)
      try {
        // vendor: x.ai/session/update_mcp_servers { sessionId, mcpServers }
        await s.rpc.request(
          'x.ai/session/update_mcp_servers',
          { sessionId: s.engineSessionId, mcpServers },
          30_000
        )
        okCount++
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'mcp.update.ok',
          detail: { count: mcpServers.length, sessionScoped: !!s.sessionMcpServers }
        })
      } catch (e) {
        failed++
        lastErr = e instanceof Error ? e.message : String(e)
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'mcp.update.fail',
          detail: { error: lastErr, count: mcpServers.length }
        })
      }
    }
    const n = this.mcpServers.length
    const detail =
      failed === 0
        ? okCount
          ? `MCP 热更 ${n} 项 → ${okCount} 会话`
          : `MCP 已记 ${n} 项（无活会话，下次 session/new 注入）`
        : `MCP 热更失败 ${failed}：${lastErr}（可重建会话）`
    const result: HotApplyResult = { ok: failed === 0, detail, failed, okCount }
    this.hotStatus.mcp = { ok: result.ok, detail, at: nowIso() }
    return result
  }

  private async broadcastSetModel(
    modelId: string,
    reasoningEffort?: string
  ): Promise<HotApplyResult> {
    let okCount = 0
    let failed = 0
    let lastErr = ''
    for (const s of this.sessions.values()) {
      if (!s.rpc || !s.engineSessionId) continue
      try {
        const params: Record<string, unknown> = {
          sessionId: s.engineSessionId,
          modelId
        }
        if (reasoningEffort) {
          params._meta = { reasoningEffort }
        }
        await s.rpc.request('session/set_model', params, 15_000)
        okCount++
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'model.set.ok',
          detail: { modelId, reasoningEffort }
        })
      } catch (e) {
        failed++
        lastErr = e instanceof Error ? e.message : String(e)
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'model.set.fail',
          detail: { modelId, reasoningEffort, error: lastErr }
        })
      }
    }
    const detail =
      failed === 0
        ? okCount
          ? `set_model=${modelId}${reasoningEffort ? ` effort=${reasoningEffort}` : ''}（${okCount} 会话，PID 不变）`
          : `model 已记 ${modelId}（无活会话）`
        : `set_model 失败 ${failed}：${lastErr}`
    const result: HotApplyResult = { ok: failed === 0, detail, failed, okCount }
    this.hotStatus.model = { ok: result.ok, detail, at: nowIso() }
    return result
  }

  static isAvailable(binary?: string): boolean {
    try {
      accessSync(binary ?? resolveGrokBinary(), constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  async startSession(opts: SessionStartOptions): Promise<SessionHandle> {
    if (this.sessions.has(opts.sessionId)) {
      return { sessionId: opts.sessionId, engineId: this.id }
    }
    const meta = (opts.meta && typeof opts.meta === 'object' ? opts.meta : {}) as Record<
      string,
      unknown
    >
    const s: AcpSession = {
      uiSessionId: opts.sessionId,
      workspacePath: opts.workspacePath,
      ready: Promise.resolve(),
      busy: false,
      assistantBuf: '',
      loading: false,
      cancelled: false,
      pendingPerm: new Map(),
      pendingFsWrite: new Map(),
      diffHintsEmitted: new Set(),
      availableCommands: []
    }
    // T018：会话级 meta（Routines）
    if (meta.permissionPolicy != null) {
      s.permissionOverride = normalizePermissionPolicy(meta.permissionPolicy)
    }
    if (typeof meta.model === 'string' && meta.model.trim()) {
      s.sessionModel = meta.model.trim()
    }
    if (typeof meta.reasoningEffort === 'string' && meta.reasoningEffort.trim()) {
      s.sessionEffort = meta.reasoningEffort.trim()
    } else if (typeof meta.effort === 'string' && meta.effort.trim()) {
      s.sessionEffort = meta.effort.trim()
    }
    if (Array.isArray(meta.mcpServerNames)) {
      const names = new Set(
        meta.mcpServerNames.filter((x): x is string => typeof x === 'string' && !!x)
      )
      if (names.size > 0) {
        s.sessionMcpServers = this.mcpServers.filter((m) => names.has(m.name) && m.enabled)
      } else {
        // 空名单 = 不注入任何 MCP（定时任务最小权限）
        s.sessionMcpServers = []
      }
    }
    s.ready = new Promise((resolve, reject) => {
      s.resolveReady = resolve
      s.rejectReady = reject
    })
    this.sessions.set(opts.sessionId, s)
    try {
      await this.boot(s)
    } catch (e) {
      this.sessions.delete(opts.sessionId)
      throw e
    }
    return { sessionId: opts.sessionId, engineId: this.id }
  }

  /** 会话有效权限：覆盖优先，否则全局 */
  private effectivePolicy(s: AcpSession): PermissionPolicy {
    return s.permissionOverride ?? this.permissionPolicy
  }

  async send(sessionId: string, message: UserMessage): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`unknown session: ${sessionId}`)
    if (s.busy) throw new Error('session busy')
    await s.ready
    if (!s.rpc || !s.engineSessionId) throw new Error('acp session not ready')

    s.busy = true
    s.cancelled = false
    s.assistantBuf = ''
    this.emitStatus(sessionId, 'streaming')

    try {
      const media = (message.media ?? []).map((m) => ({
        kind: m.kind,
        name: m.name,
        mimeType: m.mimeType,
        uri: m.uri,
        dataBase64: m.dataBase64
      }))
      const { blocks, warnings } = buildAcpPromptBlocks(
        message.text,
        media,
        this.promptCapabilities
      )
      for (const w of warnings) {
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'multimodal.fallback',
          detail: w
        })
      }
      const promptResult = (await s.rpc.request(
        'session/prompt',
        {
          sessionId: s.engineSessionId,
          prompt: blocks
        },
        600_000
      )) as Record<string, unknown> | undefined
      // prompt result._meta 含 totalTokens / inputTokens（T006 探针）
      this.recordUsageFromMeta(s, promptResult)
      // 部分实现用 notification 结束；若 request resolve 即回合结束
      if (s.assistantBuf.trim()) {
        this.emit({
          type: 'assistant.message',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('as'),
          ts: nowIso(),
          text: s.assistantBuf
        })
      }
      this.emit({
        type: 'turn.end',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId,
        id: newEventId('end'),
        ts: nowIso(),
        stopReason: 'end_turn',
        engineSessionId: s.engineSessionId
      })
      this.emitStatus(sessionId, 'idle')
    } catch (e) {
      if (!s.cancelled) {
        this.emit({
          type: 'error',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('er'),
          ts: nowIso(),
          message: e instanceof Error ? e.message : String(e),
          code: 'engine.exited',
          retriable: true
        })
        this.emitStatus(sessionId, 'error')
      } else {
        this.emitStatus(sessionId, 'idle')
      }
    } finally {
      s.busy = false
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.cancelled = true
    s.busy = false
    try {
      if (s.rpc && s.engineSessionId) {
        await s.rpc.request(
          'session/cancel',
          { sessionId: s.engineSessionId },
          5000
        ).catch(() => undefined)
      }
    } finally {
      // 不杀 agent 子进程：取消本轮后会话应可续聊（审计 Z3-02）
      // 杀进程留给 disposeSession
      this.emitStatus(sessionId, 'idle')
    }
  }

  async disposeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.cancelled = true
    s.busy = false
    try {
      if (s.rpc && s.engineSessionId) {
        await s.rpc
          .request('session/cancel', { sessionId: s.engineSessionId }, 5000)
          .catch(() => undefined)
      }
    } catch {
      /* */
    }
    if (s.child) {
      killProcessTree(s.child, 'SIGTERM')
      setTimeout(() => {
        if (s.child) killProcessTree(s.child, 'SIGKILL')
      }, 1500)
    }
    this.sessions.delete(sessionId)
  }

  /** 人审结果回写 ACP（含 ask 下 client FS 写闸） */
  resolvePermission(
    sessionId: string,
    engineRequestId: string | number,
    approved: boolean
  ): void {
    const s = this.sessions.get(sessionId)
    if (!s?.rpc) return

    // client fs/write_text_file 挂起的写盘（id 可能是 number/string；或误传了 uiId=apr_*）
    let fsKey = mapKey(s.pendingFsWrite, engineRequestId)
    if (fsKey === undefined) {
      fsKey = findPendingByUiId(s.pendingFsWrite, engineRequestId)
    }
    const fsPend = fsKey !== undefined ? s.pendingFsWrite.get(fsKey) : undefined
    if (fsPend && fsKey !== undefined) {
      s.pendingFsWrite.delete(fsKey)
      if (approved) {
        try {
          mkdirSync(dirname(fsPend.path), { recursive: true })
          writeFileSync(fsPend.path, fsPend.content, 'utf8')
          s.rpc.respond(fsKey, {})
          this.emit({
            type: 'file.changed',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId: s.uiSessionId,
            id: newEventId('fc'),
            ts: nowIso(),
            path: fsPend.path,
            kind: 'modified'
          })
        } catch (e) {
          s.rpc.respondError(fsKey, -32000, e instanceof Error ? e.message : String(e))
        }
      } else {
        s.rpc.respondError(fsKey, -32000, 'write denied by user')
      }
      this.emitStatus(s.uiSessionId, 'streaming')
      return
    }

    // agent-client-protocol SelectedPermissionOutcome
    let permKey = mapKey(s.pendingPerm, engineRequestId)
    if (permKey === undefined) {
      permKey = findPendingByUiId(s.pendingPerm, engineRequestId)
    }
    if (permKey === undefined) {
      // 无可匹配挂起请求：勿对错误 id 乱 respond（会污染 JSON-RPC）
      this.emit({
        type: 'lifecycle',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId: s.uiSessionId,
        id: newEventId('lc'),
        ts: nowIso(),
        name: 'permission.resolve.miss',
        detail: { engineRequestId: String(engineRequestId), approved }
      })
      return
    }
    const allowId = s.pendingPerm.get(permKey)?.allowOptionId ?? 'allow-once'
    if (approved) {
      s.rpc.respond(permKey, {
        outcome: {
          outcome: 'selected',
          optionId: allowId
        }
      })
    } else {
      s.rpc.respond(permKey, {
        outcome: { outcome: 'cancelled' }
      })
    }
    s.pendingPerm.delete(permKey)
    // T021：工具审批放行后恢复 streaming（旧代码仅 FS 路径有 emitStatus）
    this.emitStatus(s.uiSessionId, 'streaming')
  }

  getPid(sessionId: string): number | undefined {
    return this.sessions.get(sessionId)?.child?.pid
  }

  onEvent(handler: (e: SessionEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private async boot(
    s: AcpSession,
    opts?: { loadCliSessionId?: string }
  ): Promise<void> {
    const child = spawn(this.binary, buildAcpStdioArgs(), {
      cwd: s.workspacePath,
      env: {
        ...process.env,
        GROK_CLIENT_VERSION: this.clientVersion,
        NO_COLOR: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams
    s.child = child
    const rpc = new JsonRpcStdio(child)
    s.rpc = rpc

    rpc.on('notification', (method: string, params: unknown) => {
      this.onNotification(s, method, params)
    })
    rpc.on('server_request', (msg: JsonRpcMessage) => {
      this.onServerRequest(s, msg)
    })
    rpc.on('exit', (code: number | null) => {
      this.emit({
        type: 'error',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId: s.uiSessionId,
        id: newEventId('er'),
        ts: nowIso(),
        message: `acp process exited (${code})`,
        code: 'engine.exited',
        retriable: true
      })
      this.emitStatus(s.uiSessionId, 'error')
    })

    try {
      const initResult = await rpc.request(
        'initialize',
        {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true }
          },
          clientInfo: {
            name: 'perigee',
            version: this.clientVersion.replace(/^perigee\//, '')
          }
        },
        60_000
      )
      this.promptCapabilities = parsePromptCapabilities(initResult)
      // initialize._meta.modelState 含 totalContextTokens（T006 探针实证）
      this.applyModelsMeta(s, initResult)

      const mcpSource = s.sessionMcpServers ?? this.mcpServers
      const mcpServers = buildAcpMcpServers(mcpSource)
      if (opts?.loadCliSessionId) {
        s.loading = true
        // session/load：回放历史为 session/update notifications（探针 277 条/0.7s）
        const loadResult = (await rpc.request(
          'session/load',
          {
            sessionId: opts.loadCliSessionId,
            cwd: s.workspacePath,
            mcpServers
          },
          120_000
        )) as { sessionId?: string; models?: unknown; _meta?: { sessionId?: string } }
        s.engineSessionId =
          loadResult?.sessionId ||
          loadResult?._meta?.sessionId ||
          opts.loadCliSessionId
        this.applyModelsMeta(s, loadResult)
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'session.load.ok',
          detail: {
            cliSessionId: opts.loadCliSessionId,
            engineSessionId: s.engineSessionId,
            contextWindowTokens: s.contextWindowTokens
          }
        })
      } else {
        const newResult = (await rpc.request(
          'session/new',
          {
            cwd: s.workspacePath,
            mcpServers
          },
          120_000
        )) as { sessionId?: string; models?: unknown }

        if (!newResult?.sessionId) {
          throw new Error('session/new missing sessionId')
        }
        s.engineSessionId = newResult.sessionId
        this.applyModelsMeta(s, newResult)
      }
      // 初始 mode / model 对齐 Desktop（best-effort；失败不阻塞会话）
      // T018：会话级 permissionOverride 优先（Routines → yolo）
      const sessionPolicy = this.effectivePolicy(s)
      try {
        const modeId = policyToAcpModeId(sessionPolicy)
        await rpc.request(
          'session/set_mode',
          { sessionId: s.engineSessionId, modeId },
          10_000
        )
      } catch {
        /* set_mode 非必须成功；Host 分类器仍兜底 */
      }
      const modelId = s.sessionModel || this.model
      if (modelId && !opts?.loadCliSessionId) {
        try {
          const params: Record<string, unknown> = {
            sessionId: s.engineSessionId,
            modelId
          }
          if (s.sessionEffort) {
            params._meta = { reasoningEffort: s.sessionEffort }
          }
          await rpc.request('session/set_model', params, 15_000)
        } catch {
          /* 非法 modelId 等：用户可稍后改 */
        }
      }
      s.resolveReady?.()
    } catch (e) {
      try {
        child.kill('SIGKILL')
      } catch {
        /* */
      }
      s.rejectReady?.(e instanceof Error ? e : new Error(String(e)))
      throw e
    }
  }

  private onNotification(s: AcpSession, method: string, params: unknown): void {
    // 标准 + 扩展 method 统一归一
    const norm = normalizeAcpNotification(method, params)
    if (norm?.update) {
      const tag = sessionUpdateTag(norm.update)
      if (isExtSessionUpdateTag(tag)) {
        for (const ev of mapExtSessionUpdate(s.uiSessionId, norm.update)) {
          this.emit(ev)
        }
        return
      }
      // 标准 ACP update 或其它 tag
      this.mapSessionUpdate(s, { update: norm.update, sessionId: norm.engineSessionId })
    }

    // prompt 结束 usage（turn 结束仍以 session/prompt resolve 为准）
    if (
      method === '_x.ai/session/prompt_complete' ||
      method.includes('prompt_complete')
    ) {
      const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>
      const update = (p.update as Record<string, unknown>) || p
      const usage = update.usage as Record<string, unknown> | undefined
      if (usage) {
        this.emitUsage(s, usage)
      }
    }
  }

  private mapSessionUpdate(s: AcpSession, params: Record<string, unknown>): void {
    const update = params.update as Record<string, unknown> | undefined
    if (!update) return
    const kind = String(update.sessionUpdate ?? '')
    // 扩展 tag 若误入此处再映射一次
    if (isExtSessionUpdateTag(kind)) {
      for (const ev of mapExtSessionUpdate(s.uiSessionId, update)) this.emit(ev)
      return
    }
    const sessionId = s.uiSessionId

    if (kind === 'user_message_chunk') {
      const text = extractContentText(update.content)
      if (text) {
        // T021：仅 session/load 回放时 emit user.message。
        // 正常 send 路径由 SessionManager 已 publish 一条；再 echo 会双气泡。
        if (!s.loading) return
        this.flushAssistant(s)
        this.emit({
          type: 'user.message',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('um'),
          ts: nowIso(),
          text
        })
      }
      return
    }
    if (kind === 'agent_message_chunk') {
      const text = extractContentText(update.content)
      if (text) {
        s.assistantBuf += text
        this.emit({
          type: 'assistant.delta',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('ad'),
          ts: nowIso(),
          text
        })
      }
      return
    }
    if (kind === 'agent_thought_chunk') {
      const text = extractContentText(update.content)
      if (text) {
        this.emit({
          type: 'thought.delta',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('th'),
          ts: nowIso(),
          text
        })
      }
      return
    }
    if (kind === 'turn_completed' || kind === 'session_info_update') {
      if (s.loading) this.flushAssistant(s)
      const usage = update.usage as Record<string, unknown> | undefined
      if (usage && !s.loading) {
        this.emitUsage(s, usage)
      }
      return
    }
    if (kind === 'available_commands_update') {
      const list = update.availableCommands ?? update.available_commands
      if (Array.isArray(list)) {
        s.availableCommands = list
          .map((c) =>
            c && typeof c === 'object' && 'name' in c
              ? String((c as { name: unknown }).name)
              : ''
          )
          .filter(Boolean)
      }
      if (s.loading) this.flushAssistant(s)
      return
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      if (kind === 'tool_call') {
        const callId = String(
          (update.toolCallId as string) ||
            (update.toolCall as { toolCallId?: string })?.toolCallId ||
            newEventId('tc')
        )
        const name = String(
          update.title || update.toolName || update.name || 'tool'
        )
        const rawInput = update.rawInput ?? update.input ?? {}
        this.emitStatus(sessionId, 'tool_running')
        this.emit({
          type: 'tool.call',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: callId,
          ts: nowIso(),
          name,
          args: rawInput,
          kind: update.kind != null ? String(update.kind) : undefined,
          callId
        })
        for (const path of extractPathsFromToolArgs(rawInput)) {
          this.emit({
            type: 'file.changed',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('fc'),
            ts: nowIso(),
            path,
            kind: 'modified'
          })
        }
      } else {
        const callId = String(update.toolCallId ?? '')
        // CLI 自带权威 diff（write/search_replace 的 oldText/newText），绕过写盘竞态
        for (const hint of extractDiffHints(update.content)) {
          const key = `${callId}:${hint.path}`
          if (s.diffHintsEmitted.has(key)) continue
          s.diffHintsEmitted.add(key)
          this.emit({
            type: 'file.changed',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('fc'),
            ts: nowIso(),
            path: hint.path,
            kind: hint.before == null ? 'created' : 'modified',
            before: hint.before,
            after: hint.after
          })
        }
        const status = update.status
        if (status === 'completed' || status === 'failed') {
          this.emit({
            type: 'tool.result',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('tr'),
            callId: callId || newEventId('tc'),
            ts: nowIso(),
            ok: status === 'completed',
            result: update.rawOutput ?? update.content ?? null
          })
          const locs = update.locations
          if (Array.isArray(locs)) {
            for (const loc of locs) {
              const path =
                typeof loc === 'string'
                  ? loc
                  : loc && typeof loc === 'object' && 'path' in loc
                    ? String((loc as { path: unknown }).path)
                    : ''
              if (path) {
                this.emit({
                  type: 'file.changed',
                  schemaVersion: EVENT_SCHEMA_VERSION,
                  sessionId,
                  id: newEventId('fc'),
                  ts: nowIso(),
                  path,
                  kind: 'modified'
                })
              }
            }
          }
          this.emitStatus(sessionId, 'streaming')
        }
      }
    }
  }

  private onServerRequest(s: AcpSession, msg: JsonRpcMessage): void {
    const method = msg.method || ''
    const id = msg.id!
    const params = (msg.params || {}) as Record<string, unknown>

    // 权限（§12.2b Host 分类器兜底；yolo 全放）
    if (
      method.includes('request_permission') ||
      method === 'session/request_permission'
    ) {
      const allowOptionId = pickAllowOptionId(params.options)
      const denyOptionId = pickDenyOptionId(params.options)
      // 人话摘要给 UI；分类器用原始 toolName/kind + 命令/路径正文（禁止 dump 整包 JSON）
      const summary = summarizePermissionRequest(params)
      const { action, detail, toolName, kind, paths } = summary
      const policy = this.effectivePolicy(s)
      const classifyCtx = { toolName, kind, detail, paths }
      const verdict = autoApprovesToolPermission(policy)
        ? 'allow'
        : classifyToolPermission(policy, classifyCtx)

      if (verdict === 'allow') {
        s.rpc?.respond(id, {
          outcome: {
            outcome: 'selected',
            optionId: allowOptionId ?? 'allow-once'
          }
        })
        return
      }
      if (verdict === 'deny') {
        if (denyOptionId) {
          s.rpc?.respond(id, {
            outcome: { outcome: 'selected', optionId: denyOptionId }
          })
        } else {
          s.rpc?.respond(id, { outcome: { outcome: 'cancelled' } })
        }
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'permission.host_deny',
          detail: { action, policy }
        })
        return
      }
      // pending → 人审
      const uiId = newEventId('apr')
      s.pendingPerm.set(id, { uiId, allowOptionId })
      const highRisk =
        !!kind.match(/execute|shell/i) ||
        isDangerousShell(detail) ||
        isDangerousShell(toolName) ||
        isComputerUseTool(classifyCtx)
      const risk: 'low' | 'medium' | 'high' = highRisk ? 'high' : 'medium'
      this.emitStatus(s.uiSessionId, 'waiting_approval')
      this.emit({
        type: 'approval.requested',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId: s.uiSessionId,
        id: uiId,
        ts: nowIso(),
        action,
        detail,
        risk,
        engineRequestId: String(id)
      })
      this.onPermissionRequest?.({
        id: uiId,
        sessionId: s.uiSessionId,
        action,
        detail,
        risk,
        engineRequestId: id
      })
      return
    }

    // 反向 FS：agent 请 client 读/写（读写均走工作区 path-guard，防任意读本机）
    if (method.includes('read_text_file') || method.endsWith('fs/read_text_file')) {
      const rawPath = String(params.path || '')
      try {
        const path = resolveInWorkspace(s.workspacePath, rawPath)
        const content = readFileSync(path, 'utf8')
        s.rpc?.respond(id, { content })
      } catch (e) {
        s.rpc?.respondError(
          id,
          -32000,
          e instanceof Error ? e.message : String(e)
        )
      }
      return
    }
    if (method.includes('write_text_file') || method.endsWith('fs/write_text_file')) {
      const rawPath = String(params.path || '')
      const content = String(params.content ?? '')
      let path: string
      try {
        path = resolveInWorkspace(s.workspacePath, rawPath)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        s.rpc?.respondError(id, -32000, msg)
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'permission.host_deny',
          detail: { action: `write ${rawPath}`, policy: this.permissionPolicy, reason: 'path_guard' }
        })
        return
      }
      // plan：禁止 client 写盘（对标 CCD Plan 不改源码）
      const writePolicy = this.effectivePolicy(s)
      if (deniesClientWrite(writePolicy)) {
        s.rpc?.respondError(id, -32000, 'plan mode: client file write denied')
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: s.uiSessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'permission.host_deny',
          detail: { action: `write ${path}`, policy: 'plan', reason: 'plan_no_write' }
        })
        return
      }
      // yolo / accept_edits：静默写（含 T018 Routine 会话 override）
      if (allowsSilentClientWrite(writePolicy)) {
        try {
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, content, 'utf8')
          s.rpc?.respond(id, {})
          this.emit({
            type: 'file.changed',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId: s.uiSessionId,
            id: newEventId('fc'),
            ts: nowIso(),
            path,
            kind: 'modified'
          })
        } catch (e) {
          s.rpc?.respondError(
            id,
            -32000,
            e instanceof Error ? e.message : String(e)
          )
        }
        return
      }
      // ask：升格为人审（禁止直写绕过）
      const uiId = newEventId('apr')
      s.pendingFsWrite.set(id, { path, content, uiId })
      const { action, detail } = summarizeFsWrite(path, content.length)
      this.emitStatus(s.uiSessionId, 'waiting_approval')
      this.emit({
        type: 'approval.requested',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId: s.uiSessionId,
        id: uiId,
        ts: nowIso(),
        action,
        detail,
        risk: 'medium',
        engineRequestId: String(id)
      })
      this.onPermissionRequest?.({
        id: uiId,
        sessionId: s.uiSessionId,
        action,
        detail,
        risk: 'medium',
        engineRequestId: id
      })
      return
    }

    // 未知 server request：取消以免挂死
    s.rpc?.respondError(id, -32601, `unsupported client method ${method}`)
  }

  private emitStatus(
    sessionId: string,
    status: 'idle' | 'streaming' | 'tool_running' | 'waiting_approval' | 'error' | 'done'
  ): void {
    this.emit({
      type: 'session.status',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      id: newEventId('st'),
      ts: nowIso(),
      status
    })
  }

  private flushAssistant(s: AcpSession): void {
    if (!s.assistantBuf.trim()) return
    this.emit({
      type: 'assistant.message',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: s.uiSessionId,
      id: newEventId('as'),
      ts: nowIso(),
      text: s.assistantBuf
    })
    s.assistantBuf = ''
  }

  /** 从 initialize / session/new|load 的 models 元数据取窗口大小 */
  private applyModelsMeta(s: AcpSession, result: unknown): void {
    if (!result || typeof result !== 'object') return
    const r = result as Record<string, unknown>
    // session/new|load: { models: { currentModelId, availableModels: [{ modelId, _meta: { totalContextTokens } }] } }
    const models = (r.models as Record<string, unknown>) || undefined
    // initialize: { _meta: { modelState: { currentModelId, availableModels } } }
    const modelState =
      models ||
      ((r._meta as Record<string, unknown> | undefined)?.modelState as
        | Record<string, unknown>
        | undefined)
    if (!modelState) return
    const currentId = String(modelState.currentModelId ?? this.model ?? '')
    if (currentId) s.modelId = currentId
    const list = modelState.availableModels
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const m = item as Record<string, unknown>
      const id = String(m.modelId ?? '')
      const meta = (m._meta as Record<string, unknown>) || {}
      const win = num(meta.totalContextTokens ?? meta.total_context_tokens)
      if (win && (!currentId || id === currentId || !s.contextWindowTokens)) {
        s.contextWindowTokens = win
        if (id) s.modelId = id
        if (id === currentId) break
      }
    }
  }

  /**
   * 更新「上下文占用」估计（给 session.contextInfo 分子用）。
   * 优先 context/prompt 明确字段，其次 inputTokens；
   * **不用** input+output / 无界 totalTokens 冒充上下文（会飞涨）。
   */
  private noteUsage(s: AcpSession, usage: Record<string, unknown>): void {
    const inputOnly = num(usage.inputTokens ?? usage.input_tokens)
    const explicitCtx = num(
      usage.contextTokens ??
        usage.context_tokens ??
        usage.promptTokens ??
        usage.prompt_tokens ??
        usage.cachedTokens ??
        usage.cached_tokens
    )
    let used = explicitCtx ?? inputOnly
    const billedTotal = num(usage.totalTokens ?? usage.total_tokens)
    // 仅当没有更好信号、且 total 不超过窗口时，才把 totalTokens 当作上下文
    if (used == null && billedTotal != null) {
      if (!s.contextWindowTokens || billedTotal <= s.contextWindowTokens * 1.05) {
        used = billedTotal
      }
    }
    // 仍无：绝不把 in+out 当上下文
    if (used != null) {
      if (s.contextWindowTokens && used > s.contextWindowTokens * 1.05 && inputOnly != null) {
        s.lastUsedTokens = inputOnly
      } else if (!s.contextWindowTokens || used <= s.contextWindowTokens * 1.05) {
        s.lastUsedTokens = used
      }
      // 否则丢弃离谱值，保留上一轮 lastUsedTokens
    }
    const mid = this.modelIdFromUsagePayload(usage)
    if (mid) s.modelId = mid
  }

  /**
   * T020：从 usage payload / 会话态解析实际模型。
   * 实况 ACP：`modelUsage: { "grok-4.5-build": {...} }`，常无顶层 modelId。
   */
  private modelIdFromUsagePayload(usage: Record<string, unknown>): string | undefined {
    const tryStr = (v: unknown): string | undefined => {
      if (v == null) return undefined
      const s = String(v).trim()
      return s || undefined
    }
    const explicit =
      tryStr(usage.modelId) ?? tryStr(usage.model) ?? tryStr(usage.model_id)
    if (explicit) return explicit
    const mu = usage.modelUsage
    if (mu && typeof mu === 'object' && !Array.isArray(mu)) {
      const keys = Object.keys(mu as object).filter((k) => k.trim())
      if (keys.length === 1) return keys[0]
      if (keys.length > 1) {
        let best: string | undefined
        let bestTok = -1
        for (const k of keys) {
          const u = (mu as Record<string, unknown>)[k]
          let tok = 0
          if (u && typeof u === 'object') {
            const o = u as Record<string, unknown>
            tok = num(o.totalTokens ?? o.total_tokens) ?? 0
          }
          if (tok > bestTok) {
            bestTok = tok
            best = k
          }
        }
        return best ?? keys[0]
      }
    }
    return undefined
  }

  /** 写入 usage 事件 raw 的 modelId（供账本 T020 归因） */
  private enrichUsageRaw(
    s: AcpSession,
    usage: Record<string, unknown>
  ): Record<string, unknown> {
    const modelId =
      this.modelIdFromUsagePayload(usage) ?? s.modelId ?? this.model ?? undefined
    if (!modelId) return usage
    if (usage.modelId != null && String(usage.modelId).trim()) return usage
    return { ...usage, modelId }
  }

  private emitUsage(s: AcpSession, usage: Record<string, unknown>): void {
    this.noteUsage(s, usage)
    const raw = this.enrichUsageRaw(s, usage)
    this.emit({
      type: 'usage',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: s.uiSessionId,
      id: newEventId('usg'),
      ts: nowIso(),
      inputTokens: num(usage.inputTokens ?? usage.input_tokens),
      outputTokens: num(usage.outputTokens ?? usage.output_tokens),
      raw
    })
  }

  private recordUsageFromMeta(s: AcpSession, promptResult: unknown): void {
    if (!promptResult || typeof promptResult !== 'object') return
    const meta = (promptResult as Record<string, unknown>)._meta as
      | Record<string, unknown>
      | undefined
    if (!meta) return
    const usage =
      meta.usage && typeof meta.usage === 'object'
        ? (meta.usage as Record<string, unknown>)
        : meta
    this.noteUsage(s, usage)
    if (s.lastUsedTokens != null) {
      this.emitUsage(s, usage)
    }
  }

  private emit(e: SessionEvent): void {
    for (const h of this.handlers) h(e)
  }
}

export { resolveGrokBinary } from '@perigee/engine-protocol'

/** ACP content 块 → 纯文本（单测与 mapSessionUpdate 共用） */
export function extractContentText(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (typeof content === 'object' && content && 'text' in content) {
    return String((content as { text: unknown }).text ?? '')
  }
  // 部分 payload 用 { type, text } 数组
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const item of content) {
      if (typeof item === 'string') parts.push(item)
      else if (item && typeof item === 'object' && 'text' in item) {
        parts.push(String((item as { text: unknown }).text ?? ''))
      }
    }
    return parts.join('')
  }
  return ''
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return undefined
}

/**
 * 从 ACP request_permission 的 options 里挑「允许一次」的 optionId。
 * 优先 kind=allow_once；退化按 id 含 allow+once；再退化第一个含 allow。
 */
export function pickAllowOptionId(options: unknown): string | undefined {
  if (!Array.isArray(options)) return undefined
  const opts = options
    .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}))
    .map((o) => ({ id: String(o.optionId ?? o.id ?? ''), kind: String(o.kind ?? '') }))
    .filter((o) => o.id)
  const by = (pred: (o: { id: string; kind: string }) => boolean) => opts.find(pred)?.id
  return (
    by((o) => o.kind === 'allow_once') ??
    by((o) => /allow/i.test(o.id) && /once/i.test(o.id)) ??
    by((o) => /allow/i.test(o.id))
  )
}

function mapKey<V>(
  m: Map<string | number, V>,
  id: string | number
): string | number | undefined {
  if (m.has(id)) return id
  const s = String(id)
  if (m.has(s)) return s
  const n = Number(id)
  if (!Number.isNaN(n) && m.has(n)) return n
  return undefined
}

/** T021：Host 误把 uiId(apr_*) 当 engineRequestId 时，按 uiId 反查挂起项 */
export function findPendingByUiId<V extends { uiId: string }>(
  m: Map<string | number, V>,
  maybeUiId: string | number
): string | number | undefined {
  const want = String(maybeUiId)
  for (const [k, v] of m) {
    if (v.uiId === want) return k
  }
  return undefined
}

/** 导出供单测；resolvePermission 查找 JSON-RPC id */
export function mapPermissionKey<V>(
  m: Map<string | number, V>,
  id: string | number
): string | number | undefined {
  return mapKey(m, id)
}
