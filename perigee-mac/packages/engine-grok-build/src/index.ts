import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { accessSync, constants } from 'node:fs'
import {
  killProcessTree,
  resolveGrokBinary,
  type AgentEngine,
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

export interface GrokBuildEngineOptions {
  /** grok 可执行文件，默认探测 ~/.grok/bin/grok 与 PATH */
  binary?: string
  /** 额外 CLI 参数 */
  extraArgs?: string[]
  /** 默认 true：无 TTY 时 headless 必须自动批工具，否则会卡审批 */
  alwaysApprove?: boolean
  maxTurns?: number
  model?: string
  /** 单回合超时 ms，默认 10 分钟 */
  turnTimeoutMs?: number
}

interface SessionState {
  workspacePath: string
  /** Grok 侧 session UUID（end 事件带回，后续 --resume） */
  grokSessionId?: string
  child?: ChildProcess
  cancelled: boolean
  /** 与 cancel 区分：超时不得被当成用户 cancel 后刷成「成功 idle」 */
  timedOut: boolean
}

/**
 * Grok Build 引擎适配器。
 * 每轮：`grok -p <msg> --cwd <ws> --output-format streaming-json`
 * 首轮可用 --session-id；后续 --resume <id>。
 */
export class GrokBuildEngine implements AgentEngine {
  readonly id = 'grok-build'
  readonly displayName = 'Grok Build'
  private handlers = new Set<(event: SessionEvent) => void>()
  private sessions = new Map<string, SessionState>()
  private binary: string
  private extraArgs: string[]
  private alwaysApprove: boolean
  private maxTurns: number
  private model?: string
  private turnTimeoutMs: number

  constructor(opts: GrokBuildEngineOptions = {}) {
    this.binary = opts.binary ?? resolveGrokBinary()
    this.extraArgs = opts.extraArgs ?? []
    this.alwaysApprove = opts.alwaysApprove ?? true
    this.maxTurns = opts.maxTurns ?? 30
    this.model = opts.model
    this.turnTimeoutMs = opts.turnTimeoutMs ?? 600_000
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
    const existing = this.sessions.get(opts.sessionId)
    if (existing) {
      // 幂等：保留 grokSessionId，避免多轮 --resume 失效（审计 Z4-01）
      existing.workspacePath = opts.workspacePath
      return { sessionId: opts.sessionId, engineId: this.id }
    }
    this.sessions.set(opts.sessionId, {
      workspacePath: opts.workspacePath,
      cancelled: false,
      timedOut: false
    })
    return { sessionId: opts.sessionId, engineId: this.id }
  }

  async send(sessionId: string, message: UserMessage): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state) throw new Error(`unknown session: ${sessionId}`)
    if (state.child) throw new Error('session already running a turn')
    state.cancelled = false
    state.timedOut = false

    this.emitStatus(sessionId, 'streaming')

    const args = this.buildArgs(state, message.text)
    let child: ChildProcess
    try {
      child = spawn(this.binary, args, {
        cwd: state.workspacePath,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        // 独立进程组，cancel 时可杀整组
        detached: process.platform !== 'win32'
      })
    } catch (e) {
      this.emit({
        type: 'error',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId,
        id: newEventId('er'),
        ts: nowIso(),
        message: e instanceof Error ? e.message : String(e),
        code: 'engine.spawn_failed',
        retriable: true
      })
      this.emitStatus(sessionId, 'error')
      throw e
    }
    state.child = child
    const timeout = setTimeout(() => {
      if (!state.child) return
      state.timedOut = true
      this.killTree(state.child)
      this.emit({
        type: 'error',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sessionId,
        id: newEventId('er'),
        ts: nowIso(),
        message: `turn timeout after ${this.turnTimeoutMs}ms`,
        code: 'engine.timeout',
        retriable: true
      })
      this.emitStatus(sessionId, 'error')
    }, this.turnTimeoutMs)

    let assistantBuf = ''
    let stderrBuf = ''
    const pendingTools = new Map<string, { name: string; args: unknown }>()
    /** 已发过的 diff hint（callId:path），status 中间态与 completed 会重复携带 */
    const emittedDiffHints = new Set<string>()

    const onLine = (line: string) => {
      if (!line.trim()) return
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }
      const type = String(obj.type ?? '')

      if (type === 'text') {
        const data = String(obj.data ?? '')
        assistantBuf += data
        this.emit({
          type: 'assistant.delta',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('ad'),
          ts: nowIso(),
          text: data
        })
        return
      }

      if (type === 'thought') {
        const data = String(obj.data ?? '')
        this.emit({
          type: 'thought.delta',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('th'),
          ts: nowIso(),
          text: data
        })
        return
      }

      if (type === 'plan') {
        this.emit({
          type: 'plan',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('pl'),
          ts: nowIso(),
          entries: obj.entries ?? obj
        })
        return
      }

      if (type === 'usage') {
        const u = (obj.usage && typeof obj.usage === 'object' ? obj.usage : obj) as Record<
          string,
          unknown
        >
        this.emit({
          type: 'usage',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('usg'),
          ts: nowIso(),
          inputTokens: num(u.input_tokens ?? u.inputTokens),
          outputTokens: num(u.output_tokens ?? u.outputTokens),
          raw: obj
        })
        return
      }

      if (type === 'tool_call') {
        const callId = String(obj.toolCallId ?? newEventId('tc'))
        const name = String(obj.toolName ?? obj.title ?? 'tool')
        const rawInput = obj.rawInput ?? {}
        const kind = obj.kind != null ? String(obj.kind) : undefined
        pendingTools.set(callId, { name, args: rawInput })
        this.emitStatus(sessionId, 'tool_running')
        this.emit({
          type: 'tool.call',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: callId,
          ts: nowIso(),
          name,
          args: rawInput,
          kind,
          callId
        })
        // 写类工具：尽早发出 path 意图（Host 应在此刻 captureBefore）
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
        return
      }

      if (type === 'tool_call_update') {
        const callId = String(obj.toolCallId ?? '')
        // CLI 自带权威 diff（write/search_replace 的 oldText/newText）：
        // 绕过「tool_call 与写盘竞态」，直接给 Host 可还原的 before/after
        for (const hint of extractDiffHints(obj.content)) {
          const key = `${callId}:${hint.path}`
          if (emittedDiffHints.has(key)) continue
          emittedDiffHints.add(key)
          this.emit({
            type: 'file.changed',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('fc'),
            ts: nowIso(),
            path: hint.path,
            kind: hint.before == null || hint.before === '' ? 'created' : 'modified',
            before: hint.before,
            after: hint.after
          })
        }
        const status = obj.status
        if (status === 'completed' || status === 'failed' || status === 'error') {
          const meta = pendingTools.get(callId)
          const content = extractToolText(obj)
          this.emit({
            type: 'tool.result',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('tr'),
            callId: callId || newEventId('tc'),
            ts: nowIso(),
            ok: status === 'completed',
            result: content || obj.rawOutput || obj.content || null,
            name: meta?.name
          })
          const locs = obj.locations
          if (Array.isArray(locs)) {
            for (const loc of locs) {
              const p =
                typeof loc === 'string'
                  ? loc
                  : loc && typeof loc === 'object' && 'path' in loc
                    ? String((loc as { path: unknown }).path)
                    : ''
              if (p) {
                this.emit({
                  type: 'file.changed',
                  schemaVersion: EVENT_SCHEMA_VERSION,
                  sessionId,
                  id: newEventId('fc'),
                  ts: nowIso(),
                  path: p,
                  kind: 'modified'
                })
              }
            }
          }
          this.emitStatus(sessionId, 'streaming')
        }
        return
      }

      if (type === 'error') {
        this.emit({
          type: 'error',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('er'),
          ts: nowIso(),
          message: String(obj.message ?? 'engine error'),
          code: 'engine.exited',
          retriable: true
        })
        return
      }

      if (type === 'max_turns_reached') {
        this.emit({
          type: 'lifecycle',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('lc'),
          ts: nowIso(),
          name: 'max_turns_reached'
        })
        return
      }

      if (type === 'end') {
        if (typeof obj.sessionId === 'string' && obj.sessionId) {
          state.grokSessionId = obj.sessionId
        }
        this.emit({
          type: 'turn.end',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId,
          id: newEventId('end'),
          ts: nowIso(),
          stopReason: String(obj.stopReason ?? 'end_turn'),
          engineSessionId:
            typeof obj.sessionId === 'string' ? obj.sessionId : state.grokSessionId,
          requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
          raw: obj
        })
      }
    }

    await new Promise<void>((resolve, reject) => {
      if (!child.stdout || !child.stderr) {
        reject(new Error('grok spawn missing stdio'))
        return
      }
      const rl = createInterface({ input: child.stdout })
      rl.on('line', onLine)
      child.stderr.on('data', (buf: Buffer) => {
        stderrBuf += buf.toString('utf8')
      })
      child.on('error', (err) => {
        state.child = undefined
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        state.child = undefined
        rl.close()
        // 超时已 emit error+error status；用户 cancel 回 idle；勿把超时刷成成功 idle
        if (state.timedOut) {
          resolve()
          return
        }
        if (state.cancelled) {
          this.emitStatus(sessionId, 'idle')
          resolve()
          return
        }
        if (assistantBuf.trim()) {
          this.emit({
            type: 'assistant.message',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('as'),
            ts: nowIso(),
            text: assistantBuf
          })
        } else if (code !== 0) {
          const msg = stderrBuf.trim() || `grok exited with code ${code}`
          const lower = msg.toLowerCase()
          const codeStr =
            /login|auth|not signed|unauthorized/.test(lower)
              ? 'engine.not_logged_in'
              : /rate.?limit|429/.test(lower)
                ? 'engine.rate_limited'
                : 'engine.exited'
          this.emit({
            type: 'error',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('er'),
            ts: nowIso(),
            message: msg,
            code: codeStr,
            retriable: codeStr === 'engine.rate_limited'
          })
        } else if (stderrBuf.trim()) {
          this.emit({
            type: 'assistant.message',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('as'),
            ts: nowIso(),
            text: stderrBuf.trim()
          })
        }
        this.emitStatus(sessionId, code === 0 ? 'idle' : 'error')
        resolve()
      })
    })
  }

  async cancel(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state?.child) return
    state.cancelled = true
    this.killTree(state.child)
    this.emitStatus(sessionId, 'idle')
  }

  private killTree(child: ChildProcess): void {
    killProcessTree(child, 'SIGTERM')
    setTimeout(() => {
      killProcessTree(child, 'SIGKILL')
    }, 2000)
  }

  async disposeSession(sessionId: string): Promise<void> {
    await this.cancel(sessionId)
    this.sessions.delete(sessionId)
  }

  onEvent(handler: (event: SessionEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private buildArgs(state: SessionState, text: string): string[] {
    const args = [
      '--no-auto-update',
      '-p',
      text,
      '--cwd',
      state.workspacePath,
      '--output-format',
      'streaming-json',
      '--max-turns',
      String(this.maxTurns),
      '--no-memory'
    ]
    if (this.alwaysApprove) args.push('--always-approve')
    if (this.model) args.push('-m', this.model)
    if (state.grokSessionId) {
      args.push('--resume', state.grokSessionId)
    }
    args.push(...this.extraArgs)
    return args
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

  private emit(event: SessionEvent): void {
    for (const h of this.handlers) h(event)
  }
}

export { resolveGrokBinary } from '@perigee/engine-protocol'

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function extractToolText(obj: Record<string, unknown>): string {
  const content = obj.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const c = (item as { content?: unknown }).content
      if (c && typeof c === 'object' && 'text' in (c as object)) {
        parts.push(String((c as { text: unknown }).text))
      } else if (typeof (item as { text?: unknown }).text === 'string') {
        parts.push(String((item as { text: string }).text))
      }
    }
    return parts.join('\n')
  }
  if (obj.rawOutput != null) {
    try {
      return typeof obj.rawOutput === 'string'
        ? obj.rawOutput
        : JSON.stringify(obj.rawOutput)
    } catch {
      return String(obj.rawOutput)
    }
  }
  return ''
}

export type { DiffHint } from '@perigee/event-schema'
export { extractDiffHints } from '@perigee/event-schema'
