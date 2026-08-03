/**
 * 会话事件 schema v3 —— UI / Host / Engine 稳定契约
 * 变更须同步：docs/API-preload.md · docs/errors.md · renderer 类型
 */

export const EVENT_SCHEMA_VERSION = 3 as const

/** 结构化错误码（见 docs/errors.md） */
export type ErrorCode =
  | 'engine.unavailable'
  | 'engine.spawn_failed'
  | 'engine.exited'
  | 'engine.timeout'
  | 'engine.not_logged_in'
  | 'engine.rate_limited'
  | 'session.unknown'
  | 'session.busy'
  | 'session.empty_message'
  | 'workspace.required'
  | 'workspace.invalid'
  | 'path.outside_workspace'
  | 'path.not_found'
  | 'permission.denied'
  | 'permission.cancelled'
  | 'diff.not_found'
  | 'internal'

export type SessionStatus =
  | 'idle'
  | 'streaming'
  | 'tool_running'
  | 'waiting_approval'
  | 'error'
  | 'done'

export type RiskLevel = 'low' | 'medium' | 'high'

type Base = {
  schemaVersion: typeof EVENT_SCHEMA_VERSION
  sessionId: string
  id: string
  ts: string
}

export type SessionEvent =
  | (Base & { type: 'user.message'; text: string })
  | (Base & { type: 'assistant.delta'; text: string })
  | (Base & { type: 'assistant.message'; text: string })
  | (Base & { type: 'thought.delta'; text: string })
  | (Base & { type: 'thought.message'; text: string })
  | (Base & {
      type: 'tool.call'
      name: string
      args: unknown
      kind?: string
      /** 引擎侧 toolCallId，与 result.callId 对应 */
      callId?: string
    })
  | (Base & {
      type: 'tool.result'
      callId: string
      ok: boolean
      result: unknown
      name?: string
    })
  | (Base & {
      type: 'plan'
      entries: unknown
    })
  | (Base & {
      type: 'usage'
      inputTokens?: number
      outputTokens?: number
      raw?: unknown
    })
  | (Base & {
      type: 'turn.end'
      stopReason: string
      engineSessionId?: string
      requestId?: string
      raw?: unknown
    })
  | (Base & {
      /** 轮次验收摘要：host 在收轮时聚合发布（turn-tracker） */
      type: 'turn.summary'
      turnId: string
      filesChanged: string[]
      toolsRun: number
      /** 启发式：test 类工具调用全过=pass，有失败=fail，无=none */
      testSignal: 'pass' | 'fail' | 'none'
      risk: 'normal' | 'elevated'
      riskReasons: string[]
      durationMs?: number
      inputTokens?: number
      outputTokens?: number
    })
  | (Base & {
      type: 'approval.requested'
      action: string
      detail: string
      risk: RiskLevel
      /** 引擎侧 permission 请求 id（ACP） */
      engineRequestId?: string
      /** host 审批队列 id（approval.resolve 用） */
      requestId?: string
    })
  | (Base & {
      type: 'approval.resolved'
      requestId: string
      approved: boolean
    })
  | (Base & {
      type: 'file.changed'
      path: string
      kind: 'created' | 'modified' | 'deleted'
      /**
       * 引擎权威 diff 提示（可选）：grok write/search_replace 的 oldText/newText。
       * yolo 下 tool_call 与写盘有竞态，磁盘快照不可靠；有 hint 时以 hint 为准。
       */
      before?: string | null
      after?: string | null
    })
  | (Base & {
      type: 'session.status'
      status: SessionStatus
    })
  | (Base & {
      type: 'error'
      message: string
      code?: ErrorCode | string
      retriable?: boolean
    })
  | (Base & {
      type: 'lifecycle'
      name: string
      detail?: unknown
    })
  /** ACP 扩展：父会话 channel 上的子代理生命周期（vendor SessionUpdate） */
  | (Base & {
      type: 'subagent.spawned'
      subagentId: string
      childSessionId: string
      subagentType: string
      description: string
      parentPromptId?: string
      model?: string
      persona?: string
      capabilityMode?: string
      resumedFrom?: string
    })
  | (Base & {
      type: 'subagent.progress'
      subagentId: string
      childSessionId: string
      durationMs: number
      turnCount: number
      toolCallCount: number
      tokensUsed?: number
      contextWindowTokens?: number
      contextUsagePct?: number
      toolsUsed?: string[]
      errorCount?: number
    })
  | (Base & {
      type: 'subagent.finished'
      subagentId: string
      childSessionId: string
      status: string
      error?: string
      toolCalls?: number
      turns?: number
      durationMs?: number
      tokensUsed?: number
      output?: string
    })
  /** 后台 bash / monitor 任务 */
  | (Base & {
      type: 'task.backgrounded'
      taskId: string
      toolCallId?: string
      command?: string
      cwd?: string
      outputFile?: string
      monitorDescription?: string
      isMonitor?: boolean
    })
  | (Base & {
      type: 'task.completed'
      taskId: string
      snapshot?: unknown
      willWake?: boolean
    })

export function isSessionEvent(value: unknown): value is SessionEvent {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.type === 'string' &&
    v.schemaVersion === EVENT_SCHEMA_VERSION &&
    typeof v.sessionId === 'string' &&
    typeof v.id === 'string' &&
    typeof v.ts === 'string'
  )
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newEventId(prefix = 'evt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/** 从工具 rawInput 抽可能被改写的路径（供 Diff capture） */
export function extractPathsFromToolArgs(args: unknown): string[] {
  if (!args || typeof args !== 'object') return []
  const o = args as Record<string, unknown>
  const keys = [
    'path',
    'target_file',
    'file_path',
    'file',
    'filename',
    'old_path',
    'new_path',
    'to',
    'from'
  ]
  const out: string[] = []
  for (const k of keys) {
    if (typeof o[k] === 'string' && (o[k] as string).trim()) {
      out.push((o[k] as string).trim())
    }
  }
  if (Array.isArray(o.paths)) {
    for (const p of o.paths) {
      if (typeof p === 'string' && p.trim()) out.push(p.trim())
    }
  }
  return [...new Set(out)]
}

export interface DiffHint {
  path: string
  before: string | null
  after: string | null
}

/**
 * 从 tool_call_update.content 抽 CLI 权威 diff（type:'diff' 条目）。
 * oldText 为空串视为新文件（before=null）。headless 与 ACP 引擎共用。
 */
export function extractDiffHints(content: unknown): DiffHint[] {
  if (!Array.isArray(content)) return []
  const out: DiffHint[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (c.type !== 'diff' || typeof c.path !== 'string' || !c.path) continue
    const oldText = typeof c.oldText === 'string' ? c.oldText : null
    const newText = typeof c.newText === 'string' ? c.newText : null
    out.push({ path: c.path, before: oldText === '' ? null : oldText, after: newText })
  }
  return out
}
