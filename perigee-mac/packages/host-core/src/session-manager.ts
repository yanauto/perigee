import type { AgentEngine } from '@perigee/engine-protocol'
import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso,
  type SessionEvent,
  type SessionStatus
} from '@perigee/event-schema'
import { EventBus } from './event-bus.js'
import {
  computeSessionAttention,
  toEpochMs,
  type SessionAttention
} from './session-attention.js'

export type SessionKind = 'main' | 'side'
export type { SessionAttention }

export interface SessionRecord {
  id: string
  title: string
  /** 引擎 cwd（worktree 或主仓） */
  workspacePath: string
  /** 用户打开的工作区根（展示用） */
  primaryWorkspacePath: string
  worktreePath?: string
  /** worktree 分支名（ADR 0009 / promote） */
  worktreeBranch?: string
  kind: SessionKind
  parentSessionId?: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
  engineId: string
  /** ACP/CLI 侧 session id（resume 去重用） */
  engineSessionId?: string
  /** T008：侧栏四态（list 时计算） */
  attention?: SessionAttention
  /** T008：最后活动 ms epoch */
  lastActivityAt?: number
  /** T008：上次已读 ms epoch */
  lastReadAt?: number | null
}

export type SessionCreateOptions = {
  /** 可选固定 id（worktree 目录名对齐） */
  id?: string
  title?: string
  kind?: SessionKind
  parentSessionId?: string
  /** 引擎 cwd；默认 primary */
  engineCwd?: string
  worktreePath?: string
  worktreeBranch?: string
  primaryWorkspacePath?: string
  /**
   * 透传引擎 startSession.meta（T018 Routines：model/effort/permission/mcp 等）
   * Host 不解释字段，由具体引擎消费。
   */
  engineMeta?: Record<string, unknown>
  /**
   * 新建时 lastReadAt；默认 now（视为已读）。
   * Routine 会话可传 null 以便跑完自然 unread。
   */
  lastReadAt?: number | null
}

function isBusyStatus(status: SessionStatus): boolean {
  return status === 'streaming' || status === 'tool_running' || status === 'waiting_approval'
}

export class SessionManager {
  private sessions = new Map<string, SessionRecord>()
  private unsubEngine: (() => void) | null = null
  private steerQueues = new Map<string, string[]>()
  private draining = new Set<string>()
  /** 渲染进程当前正在看的会话：活动时 lastReadAt 跟随，避免「看着也未读」 */
  private focusedId: string | null = null

  constructor(
    private engine: AgentEngine,
    private bus: EventBus
  ) {
    this.unsubEngine = this.engine.onEvent((ev) => this.onEngineEvent(ev))
  }

  /** 默认只列主会话（侧问不进侧栏）；附带 attention / lastActivityAt / lastReadAt */
  list(opts?: { includeSide?: boolean }): SessionRecord[] {
    let all = [...this.sessions.values()]
    if (!opts?.includeSide) {
      all = all.filter((s) => s.kind !== 'side')
    }
    return all
      .map((s) => this.withAttention(s))
      .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
  }

  get(id: string): SessionRecord | undefined {
    const s = this.sessions.get(id)
    return s ? this.withAttention(s) : undefined
  }

  /** 用户查看会话时调用；持久化由 Host 层 upsert。同时设为焦点。 */
  markRead(sessionId: string, atMs?: number): SessionRecord | undefined {
    const cur = this.sessions.get(sessionId)
    if (!cur) return undefined
    const t = atMs ?? Date.now()
    this.focusedId = sessionId
    this.sessions.set(sessionId, {
      ...cur,
      lastReadAt: t,
      updatedAt: nowIso()
    })
    return this.withAttention(this.sessions.get(sessionId)!)
  }

  /** 离开对话（回首页等）：停止已读跟随，后台回合结束可标未读 */
  blur(): void {
    this.focusedId = null
  }

  private withAttention(s: SessionRecord): SessionRecord {
    const lastActivityAt =
      s.lastActivityAt ??
      toEpochMs(s.updatedAt) ??
      toEpochMs(s.createdAt) ??
      Date.now()
    const lastReadAt = s.lastReadAt ?? null
    const attention = computeSessionAttention({
      status: s.status,
      lastActivityAt,
      lastReadAt,
      hasPendingApproval: s.status === 'waiting_approval'
    })
    return {
      ...s,
      lastActivityAt,
      lastReadAt,
      attention
    }
  }

  pendingSteerCount(sessionId: string): number {
    return this.steerQueues.get(sessionId)?.length ?? 0
  }

  /**
   * 兼容：create(cwd, title?) 或 create(cwd, opts)
   */
  async create(
    primaryOrCwd: string,
    titleOrOpts?: string | SessionCreateOptions
  ): Promise<SessionRecord> {
    const opts: SessionCreateOptions =
      typeof titleOrOpts === 'string' || titleOrOpts === undefined
        ? { title: titleOrOpts }
        : titleOrOpts
    const id = opts.id ?? newEventId('ses')
    if (this.sessions.has(id)) throw new Error(`session id exists: ${id}`)
    const now = nowIso()
    const primary = opts.primaryWorkspacePath ?? primaryOrCwd
    const engineCwd = opts.engineCwd ?? primaryOrCwd
    const kind = opts.kind ?? 'main'
    const nowMs = Date.now()
    const lastReadAt =
      opts.lastReadAt !== undefined ? opts.lastReadAt : nowMs // 默认已读，避免空白 unread
    const record: SessionRecord = {
      id,
      title:
        opts.title ??
        (kind === 'side'
          ? '侧问'
          : `会话 ${[...this.sessions.values()].filter((s) => s.kind === 'main').length + 1}`),
      workspacePath: engineCwd,
      primaryWorkspacePath: primary,
      worktreePath: opts.worktreePath,
      worktreeBranch: opts.worktreeBranch,
      kind,
      parentSessionId: opts.parentSessionId,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      engineId: this.engine.id,
      lastActivityAt: nowMs,
      lastReadAt
    }
    await this.engine.startSession({
      sessionId: id,
      workspacePath: engineCwd,
      meta: opts.engineMeta
    })
    this.sessions.set(id, record)
    this.bus.publish({
      type: 'session.status',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: id,
      id: newEventId('st'),
      ts: now,
      status: 'idle'
    })
    return record
  }

  /**
   * 从 CLI 会话恢复：需引擎实现 loadSession（ACP session/load）。
   * 不创建 worktree；cwd 即 CLI 会话工作区。
   */
  async resumeCli(
    cliSessionId: string,
    workspacePath: string,
    opts?: { title?: string; primaryWorkspacePath?: string }
  ): Promise<SessionRecord> {
    const engine = this.engine as AgentEngine & {
      loadSession?: (o: {
        sessionId: string
        workspacePath: string
        cliSessionId: string
      }) => Promise<unknown>
    }
    if (typeof engine.loadSession !== 'function') {
      throw Object.assign(
        new Error('当前引擎不支持 session/load（需 ACP）'),
        { code: 'session.resume.unsupported' }
      )
    }
    const id = newEventId('ses')
    const now = nowIso()
    const primary = opts?.primaryWorkspacePath ?? workspacePath
    const nowMs = Date.now()
    const record: SessionRecord = {
      id,
      title: opts?.title ?? `CLI · ${cliSessionId.slice(0, 8)}`,
      workspacePath,
      primaryWorkspacePath: primary,
      kind: 'main',
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      engineId: this.engine.id,
      engineSessionId: cliSessionId,
      lastActivityAt: nowMs,
      lastReadAt: null // resume 后有历史，标未读直到用户查看
    }
    await engine.loadSession({
      sessionId: id,
      workspacePath,
      cliSessionId
    })
    this.sessions.set(id, record)
    this.bus.publish({
      type: 'session.status',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: id,
      id: newEventId('st'),
      ts: now,
      status: 'idle'
    })
    return record
  }

  hydrate(record: SessionRecord): void {
    const lastActivityAt =
      record.lastActivityAt ??
      toEpochMs(record.updatedAt) ??
      toEpochMs(record.createdAt) ??
      Date.now()
    const r: SessionRecord = {
      ...record,
      kind: record.kind ?? 'main',
      primaryWorkspacePath: record.primaryWorkspacePath ?? record.workspacePath,
      lastActivityAt,
      lastReadAt: record.lastReadAt ?? null
    }
    this.sessions.set(record.id, r)
  }

  async send(
    sessionId: string,
    displayText: string,
    engineText?: string,
    media?: import('@perigee/engine-protocol').MediaPart[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`session not found: ${sessionId}`)
    const shown = displayText.trim()
    const forEngine = (engineText ?? displayText).trim() || shown
    if (!shown && !(media && media.length)) throw new Error('empty message')

    this.bus.publish({
      type: 'user.message',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      id: newEventId('us'),
      ts: nowIso(),
      text: shown || (media?.length ? `[附件 ${media.length} 个]` : '')
    })

    if (isBusyStatus(session.status)) {
      const q = this.steerQueues.get(sessionId) ?? []
      // 忙碌入队仅文本；媒体随下一轮需重新附（简化）
      q.push(forEngine)
      this.steerQueues.set(sessionId, q)
      return
    }

    await this.dispatchToEngine(sessionId, forEngine, media)
  }

  private async dispatchToEngine(
    sessionId: string,
    engineText: string,
    media?: import('@perigee/engine-protocol').MediaPart[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.patch(sessionId, { status: 'streaming' })
    try {
      await this.engine.startSession({
        sessionId,
        workspacePath: session.workspacePath
      })
      await this.engine.send(sessionId, { text: engineText, media })
    } catch (e) {
      this.patch(sessionId, { status: 'error' })
      this.bus.publish({
        type: 'error',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId,
        id: newEventId('er'),
        ts: nowIso(),
        message: e instanceof Error ? e.message : String(e)
      })
      throw e
    }
  }

  private async drainSteerQueue(sessionId: string): Promise<void> {
    if (this.draining.has(sessionId)) return
    const session = this.sessions.get(sessionId)
    if (!session || isBusyStatus(session.status)) return
    const q = this.steerQueues.get(sessionId)
    if (!q?.length) return

    this.draining.add(sessionId)
    try {
      while (true) {
        const next = this.steerQueues.get(sessionId)?.shift()
        if (!next) break
        try {
          await this.dispatchToEngine(sessionId, next)
        } catch {
          break
        }
        const cur = this.sessions.get(sessionId)
        if (cur && isBusyStatus(cur.status)) break
      }
    } finally {
      this.draining.delete(sessionId)
      const again = this.sessions.get(sessionId)
      if (again && !isBusyStatus(again.status) && (this.steerQueues.get(sessionId)?.length ?? 0) > 0) {
        void this.drainSteerQueue(sessionId)
      }
    }
  }

  setEngine(engine: AgentEngine): void {
    this.unsubEngine?.()
    this.engine = engine
    this.unsubEngine = this.engine.onEvent((ev) => this.onEngineEvent(ev))
    for (const s of this.sessions.values()) {
      void this.engine.startSession({
        sessionId: s.id,
        workspacePath: s.workspacePath
      })
      this.patch(s.id, { engineId: engine.id })
    }
  }

  getEngineId(): string {
    return this.engine.id
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) return
    this.steerQueues.delete(sessionId)
    await this.engine.cancel(sessionId)
  }

  rename(sessionId: string, title: string): SessionRecord | undefined {
    const t = title.trim()
    if (!t) return undefined
    this.patch(sessionId, { title: t })
    return this.sessions.get(sessionId)
  }

  /**
   * 已 forget 的 sessionId（含 side）：丢弃迟到引擎事件，防止 transcript 复活。
   */
  private tombstones = new Set<string>()

  isForgotten(sessionId: string): boolean {
    return this.tombstones.has(sessionId)
  }

  /**
   * T029：**同步**把会话移出内存态（含子侧问）与事件历史。
   * 删除链路要「当下消失」，不能被引擎 dispose（ACP 内部等 session/cancel 最长 5s）挡住；
   * 引擎侧清理由调用方在后台继续做。
   * @returns 被移出的 side session id 列表（dispose 必须用它清引擎，Map 里已找不到 side）
   */
  forget(sessionId: string): string[] {
    const sideIds: string[] = []
    for (const s of [...this.sessions.values()]) {
      if (s.parentSessionId === sessionId && s.kind === 'side') {
        sideIds.push(s.id)
        this.tombstones.add(s.id)
        this.sessions.delete(s.id)
        this.bus.clearSession(s.id)
        this.steerQueues.delete(s.id)
      }
    }
    this.tombstones.add(sessionId)
    this.steerQueues.delete(sessionId)
    this.sessions.delete(sessionId)
    this.bus.clearSession(sessionId)
    if (this.focusedId === sessionId) this.focusedId = null
    return sideIds
  }

  /**
   * 引擎侧清理。sideIds 来自 forget() 返回值（forget 后 Map 已无 side）。
   */
  async dispose(sessionId: string, sideIds?: string[]): Promise<void> {
    this.steerQueues.delete(sessionId)
    const sides =
      sideIds ??
      [...this.sessions.values()]
        .filter((s) => s.parentSessionId === sessionId && s.kind === 'side')
        .map((s) => s.id)
    for (const sid of sides) {
      try {
        await this.engine.disposeSession?.(sid)
      } catch {
        /* 尽力清理 */
      }
      this.sessions.delete(sid)
      this.bus.clearSession(sid)
      this.steerQueues.delete(sid)
    }
    try {
      await this.engine.disposeSession?.(sessionId)
    } catch {
      /* */
    }
    this.sessions.delete(sessionId)
    this.bus.clearSession(sessionId)
  }

  /**
   * 退出前清理：对每个会话（含 side）尽力 dispose 引擎子进程，再清空内存。
   * 旧实现只 clear Map，不杀 grok agent（审计 C3-03 / before-quit 泄漏）。
   */
  disposeAll(): void {
    this.unsubEngine?.()
    this.unsubEngine = null
    const ids = [...this.sessions.keys()]
    this.steerQueues.clear()
    this.draining.clear()
    this.sessions.clear()
    this.tombstones.clear()
    this.focusedId = null
    for (const id of ids) {
      try {
        void this.engine.disposeSession?.(id)
      } catch {
        /* best-effort on quit */
      }
    }
  }

  private touchActivity(
    sessionId: string,
    actMs: number,
    extra?: Partial<SessionRecord>
  ): void {
    const follow = this.focusedId === sessionId ? { lastReadAt: actMs } : {}
    this.patch(sessionId, { lastActivityAt: actMs, ...follow, ...extra })
  }

  private onEngineEvent(event: SessionEvent): void {
    // 已删除会话：丢弃事件（不 publish、不 patch），防 transcript/历史复活
    if (this.tombstones.has(event.sessionId)) return

    const actMs = toEpochMs(event.ts) ?? Date.now()
    if (event.type === 'session.status') {
      this.touchActivity(event.sessionId, actMs, { status: event.status })
      if (!isBusyStatus(event.status)) {
        void this.drainSteerQueue(event.sessionId)
      }
    } else if (event.type === 'error') {
      this.touchActivity(event.sessionId, actMs, { status: 'error' })
    } else if (event.type === 'turn.end') {
      const engId =
        'engineSessionId' in event && typeof event.engineSessionId === 'string'
          ? event.engineSessionId
          : undefined
      this.touchActivity(
        event.sessionId,
        actMs,
        engId ? { engineSessionId: engId } : undefined
      )
    } else if (
      event.type === 'user.message' ||
      event.type === 'assistant.message' ||
      event.type === 'assistant.delta' ||
      event.type === 'tool.call' ||
      event.type === 'approval.requested' ||
      event.type === 'turn.summary' ||
      event.type === 'approval.resolved'
    ) {
      this.touchActivity(event.sessionId, actMs)
    } else if (event.type === 'lifecycle' && event.name === 'queue.changed') {
      this.touchActivity(event.sessionId, actMs)
    }
    this.bus.publish(event)
  }

  private patch(id: string, partial: Partial<SessionRecord>): void {
    const cur = this.sessions.get(id)
    if (!cur) return
    this.sessions.set(id, {
      ...cur,
      ...partial,
      updatedAt: nowIso()
    })
  }
}
