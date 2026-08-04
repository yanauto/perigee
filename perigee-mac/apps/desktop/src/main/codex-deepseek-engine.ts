import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso,
  type SessionEvent
} from '@perigee/event-schema'
import type {
  AgentEngine,
  SessionHandle,
  SessionStartOptions,
  UserMessage
} from '@perigee/engine-protocol'

export type CodexDeepSeekEngineOptions = {
  codexBinary?: string
  apiKey?: string
  model?: string
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  approvalPolicy?: 'untrusted' | 'on-request' | 'never'
  turnTimeoutMs?: number
}

type CodexSession = {
  workspacePath: string
  codexThreadId?: string
  child?: ChildProcess
  cancelled: boolean
  timedOut: boolean
}

const DEFAULT_MODEL = 'deepseek-v4-flash'

/**
 * DeepSeek engine backed by Codex CLI.
 * Perigee keeps an isolated CODEX_HOME under its own userData folder so this does not rewrite
 * the user's normal ~/.codex login/configuration.
 */
export class CodexDeepSeekEngine implements AgentEngine {
  readonly id = 'codex-deepseek'
  readonly displayName = 'Codex + DeepSeek'
  private handlers = new Set<(event: SessionEvent) => void>()
  private sessions = new Map<string, CodexSession>()
  private binary: string
  private apiKey: string
  private model: string
  private sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  private approvalPolicy: 'untrusted' | 'on-request' | 'never'
  private turnTimeoutMs: number
  private codexHome: string

  constructor(opts: CodexDeepSeekEngineOptions = {}) {
    this.binary = opts.codexBinary?.trim() || resolveCodexBinary()
    this.apiKey = opts.apiKey?.trim() || ''
    this.model = opts.model?.trim() || DEFAULT_MODEL
    this.sandbox = opts.sandbox ?? 'workspace-write'
    this.approvalPolicy = opts.approvalPolicy ?? 'never'
    this.turnTimeoutMs = opts.turnTimeoutMs ?? 600_000
    this.codexHome = join(app.getPath('userData'), 'codex-deepseek')
  }

  static isAvailable(binary?: string): boolean {
    try {
      accessSync(binary?.trim() || resolveCodexBinary(), constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  async startSession(opts: SessionStartOptions): Promise<SessionHandle> {
    const existing = this.sessions.get(opts.sessionId)
    if (existing) {
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

    if (!this.apiKey) {
      this.emitError(sessionId, 'DeepSeek API Key 未配置', 'engine.not_logged_in')
      this.emitStatus(sessionId, 'error')
      return
    }
    if (!CodexDeepSeekEngine.isAvailable(this.binary)) {
      this.emitError(sessionId, `Codex CLI 不可用: ${this.binary}`, 'engine.spawn_failed')
      this.emitStatus(sessionId, 'error')
      return
    }

    this.ensureCodexConfig()
    this.emitStatus(sessionId, 'streaming')

    const args = this.buildArgs(state, message.text)
    let child: ChildProcess
    try {
      child = spawn(this.binary, args, {
        cwd: state.workspacePath,
        env: {
          ...process.env,
          CODEX_HOME: this.codexHome,
          NO_COLOR: '1',
          FORCE_COLOR: '0'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
    } catch (e) {
      this.emitError(sessionId, e instanceof Error ? e.message : String(e), 'engine.spawn_failed')
      this.emitStatus(sessionId, 'error')
      throw e
    }

    state.child = child
    let assistantText = ''
    let stderrText = ''
    const timeout = setTimeout(() => {
      if (!state.child) return
      state.timedOut = true
      this.kill(state.child)
      this.emitError(sessionId, `turn timeout after ${this.turnTimeoutMs}ms`, 'engine.timeout')
      this.emitStatus(sessionId, 'error')
    }, this.turnTimeoutMs)

    await new Promise<void>((resolve, reject) => {
      child.stdout?.on('data', (buf: Buffer) => {
        for (const rawLine of buf.toString('utf8').split('\n')) {
          const line = rawLine.trim()
          if (!line) continue
          let obj: Record<string, unknown>
          try {
            obj = JSON.parse(line) as Record<string, unknown>
          } catch {
            continue
          }
          const type = String(obj.type ?? '')
          if (type === 'thread.started' && typeof obj.thread_id === 'string') {
            state.codexThreadId = obj.thread_id
            return
          }
          if (type === 'item.completed') {
            const item = obj.item && typeof obj.item === 'object' ? obj.item as Record<string, unknown> : {}
            const itemType = String(item.type ?? '')
            const text = typeof item.text === 'string' ? item.text : ''
            if (itemType === 'agent_message' && text) {
              assistantText += text
              this.emit({
                type: 'assistant.delta',
                schemaVersion: EVENT_SCHEMA_VERSION,
                sessionId,
                id: newEventId('ad'),
                ts: nowIso(),
                text
              })
            }
            if ((itemType === 'tool_call' || itemType === 'function_call') && item.name) {
              this.emitStatus(sessionId, 'tool_running')
              this.emit({
                type: 'tool.call',
                schemaVersion: EVENT_SCHEMA_VERSION,
                sessionId,
                id: String(item.id ?? newEventId('tc')),
                ts: nowIso(),
                name: String(item.name),
                args: item.arguments ?? item.input ?? {},
                callId: String(item.id ?? newEventId('tc'))
              })
            }
            return
          }
          if (type === 'turn.completed') {
            const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage as Record<string, unknown> : {}
            this.emit({
              type: 'usage',
              schemaVersion: EVENT_SCHEMA_VERSION,
              sessionId,
              id: newEventId('usg'),
              ts: nowIso(),
              inputTokens: num(usage.input_tokens ?? usage.inputTokens),
              outputTokens: num(usage.output_tokens ?? usage.outputTokens),
              raw: { ...usage, modelId: this.model }
            })
            return
          }
        }
      })
      child.stderr?.on('data', (buf: Buffer) => {
        stderrText += buf.toString('utf8')
      })
      child.on('error', (err) => {
        state.child = undefined
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        state.child = undefined
        if (state.timedOut) {
          resolve()
          return
        }
        if (state.cancelled) {
          this.emitStatus(sessionId, 'idle')
          resolve()
          return
        }
        if (assistantText.trim()) {
          this.emit({
            type: 'assistant.message',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('as'),
            ts: nowIso(),
            text: assistantText
          })
          this.emit({
            type: 'turn.end',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('end'),
            ts: nowIso(),
            stopReason: 'end_turn',
            engineSessionId: state.codexThreadId
          })
          this.emitStatus(sessionId, 'idle')
        } else if (code !== 0) {
          const msg = sanitizeSecret(stderrText.trim() || `codex exited with code ${code}`, this.apiKey)
          const lower = msg.toLowerCase()
          const codeStr = /auth|api key|unauthorized|401|login/.test(lower)
            ? 'engine.not_logged_in'
            : /rate.?limit|429/.test(lower)
              ? 'engine.rate_limited'
              : 'engine.exited'
          this.emitError(sessionId, msg, codeStr)
          this.emitStatus(sessionId, 'error')
        } else {
          this.emit({
            type: 'turn.end',
            schemaVersion: EVENT_SCHEMA_VERSION,
            sessionId,
            id: newEventId('end'),
            ts: nowIso(),
            stopReason: 'end_turn',
            engineSessionId: state.codexThreadId
          })
          this.emitStatus(sessionId, 'idle')
        }
        resolve()
      })
    })
  }

  async cancel(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state?.child) return
    state.cancelled = true
    this.kill(state.child)
    this.emitStatus(sessionId, 'idle')
  }

  async disposeSession(sessionId: string): Promise<void> {
    await this.cancel(sessionId)
    this.sessions.delete(sessionId)
  }

  onEvent(handler: (event: SessionEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private buildArgs(state: CodexSession, text: string): string[] {
    const common = [
      '--json',
      '--skip-git-repo-check',
      '-m',
      this.model,
      '-s',
      this.sandbox,
      '-a',
      this.approvalPolicy
    ]
    if (state.codexThreadId) {
      return ['exec', 'resume', ...common, state.codexThreadId, text]
    }
    return ['exec', ...common, '-C', state.workspacePath, text]
  }

  private ensureCodexConfig(): void {
    mkdirSync(this.codexHome, { recursive: true })
    const modelsPath = join(this.codexHome, 'models.json')
    const configPath = join(this.codexHome, 'config.toml')
    writeFileSync(modelsPath, JSON.stringify(buildModelCatalog(), null, 2), 'utf8')
    writeFileSync(
      configPath,
      [
        `model = ${tomlString(this.model)}`,
        'model_provider = "deepseek"',
        'preferred_auth_method = "apikey"',
        'forced_login_method = "api"',
        'model_reasoning_effort = "high"',
        `model_catalog_json = ${tomlString(modelsPath)}`,
        '',
        '[model_providers.deepseek]',
        'name = "deepseek"',
        'base_url = "https://api.deepseek.com/"',
        'wire_api = "responses"',
        `experimental_bearer_token = ${tomlString(this.apiKey)}`,
        ''
      ].join('\n'),
      'utf8'
    )
  }

  private kill(child: ChildProcess): void {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
      else child.kill('SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
    setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        /* */
      }
    }, 2000)
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

  private emitError(sessionId: string, message: string, code: string): void {
    this.emit({
      type: 'error',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      id: newEventId('er'),
      ts: nowIso(),
      message,
      code,
      retriable: code !== 'engine.not_logged_in'
    })
  }

  private emit(event: SessionEvent): void {
    for (const h of this.handlers) h(event)
  }
}

export function resolveCodexBinary(): string {
  const candidates = [
    process.env.CODEX_BINARY,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/ChatGPT.app/Contents/Resources/native/codex-macos',
    'codex'
  ].filter((x): x is string => !!x && x.trim().length > 0)
  for (const c of candidates) {
    if (c === 'codex') return c
    try {
      if (existsSync(c)) return c
    } catch {
      /* */
    }
  }
  return 'codex'
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function sanitizeSecret(text: string, secret: string): string {
  if (!secret) return text
  return text.split(secret).join('[redacted]')
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function buildModelCatalog(): { models: Array<Record<string, unknown>> } {
  return {
    models: [
      {
        slug: DEFAULT_MODEL,
        prefer_websockets: false,
        support_verbosity: true,
        default_verbosity: 'low',
        apply_patch_tool_type: 'freeform',
        web_search_tool_type: 'text',
        input_modalities: ['text'],
        supports_image_detail_original: false,
        truncation_policy: { mode: 'tokens', limit: 10000 },
        supports_parallel_tool_calls: true,
        tool_mode: null,
        multi_agent_version: 'v2',
        use_responses_lite: false,
        include_skills_usage_instructions: false,
        auto_review_model_override: null,
        context_window: 1048576,
        max_context_window: 1048576,
        effective_context_window_percent: 95,
        auto_compact_token_limit: null,
        comp_hash: '3000',
        reasoning_summary_format: 'experimental',
        default_reasoning_summary: 'none',
        display_name: 'DeepSeek-V4-Flash',
        description: 'DeepSeek V4 Flash via Responses API.',
        default_reasoning_level: 'high',
        supported_reasoning_levels: [
          { effort: 'low', description: 'Fast responses with lighter reasoning' },
          { effort: 'high', description: 'Extra reasoning depth for complex problems' },
          { effort: 'max', description: 'Maximum reasoning depth for the hardest problems' }
        ],
        shell_type: 'shell_command',
        visibility: 'list',
        minimal_client_version: '0.144.0',
        supported_in_api: true,
        availability_nux: null,
        upgrade: null,
        priority: 1
      }
    ]
  }
}
