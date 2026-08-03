/**
 * 解析 Grok ACP 扩展通知 → SessionEvent 字段（纯函数，可单测）。
 * 线协议：vendor xai-grok-shell SessionUpdate（snake_case tag + 字段）。
 */
import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso,
  type SessionEvent
} from '@perigee/event-schema'

export type NormalizedNotification = {
  engineSessionId?: string
  update: Record<string, unknown>
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string')
  return out.length ? out : undefined
}

/**
 * 归一多种 notification method 的 payload。
 * - session/update · x.ai/session_notification
 * - 双包 _x.ai/session_notification { method, params }
 * - x.ai/task_backgrounded / x.ai/task_completed 顶层字段
 */
export function normalizeAcpNotification(
  method: string,
  params: unknown
): NormalizedNotification | null {
  let p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>

  // 双包：{ method: 'x.ai/session_notification', params: { sessionId, update } }
  if (
    p.params &&
    typeof p.params === 'object' &&
    (p.method === 'x.ai/session_notification' ||
      p.method === '_x.ai/session_notification' ||
      method === '_x.ai/session_notification')
  ) {
    p = p.params as Record<string, unknown>
  }

  const engineSessionId = str(p.sessionId)

  if (p.update && typeof p.update === 'object') {
    return {
      engineSessionId,
      update: p.update as Record<string, unknown>
    }
  }

  // method 自身携带 sessionUpdate 或可合成
  if (typeof p.sessionUpdate === 'string') {
    return { engineSessionId, update: { ...p } }
  }

  const m = method.replace(/^_/, '')
  if (m === 'x.ai/task_backgrounded' || method.endsWith('task_backgrounded')) {
    return {
      engineSessionId,
      update: { sessionUpdate: 'task_backgrounded', ...p }
    }
  }
  if (m === 'x.ai/task_completed' || method.endsWith('task_completed')) {
    return {
      engineSessionId,
      update: { sessionUpdate: 'task_completed', ...p }
    }
  }

  return null
}

export function sessionUpdateTag(update: Record<string, unknown>): string {
  return String(update.sessionUpdate ?? '')
}

/** 将扩展 update 映射为 0..n 个 SessionEvent（uiSessionId 由调用方填） */
export function mapExtSessionUpdate(
  uiSessionId: string,
  update: Record<string, unknown>
): SessionEvent[] {
  const kind = sessionUpdateTag(update)
  const base = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId: uiSessionId,
    id: newEventId('sa'),
    ts: nowIso()
  } as const

  if (kind === 'subagent_spawned') {
    const subagentId = str(update.subagent_id ?? update.subagentId)
    const childSessionId = str(update.child_session_id ?? update.childSessionId) ?? subagentId
    if (!subagentId || !childSessionId) return []
    return [
      {
        ...base,
        type: 'subagent.spawned',
        subagentId,
        childSessionId,
        subagentType: str(update.subagent_type ?? update.subagentType) ?? 'general-purpose',
        description: str(update.description) ?? '',
        parentPromptId: str(update.parent_prompt_id ?? update.parentPromptId),
        model: str(update.model),
        persona: str(update.persona),
        capabilityMode: str(update.capability_mode ?? update.capabilityMode),
        resumedFrom: str(update.resumed_from ?? update.resumedFrom)
      }
    ]
  }

  if (kind === 'subagent_progress') {
    const subagentId = str(update.subagent_id ?? update.subagentId)
    const childSessionId = str(update.child_session_id ?? update.childSessionId) ?? subagentId
    if (!subagentId || !childSessionId) return []
    return [
      {
        ...base,
        type: 'subagent.progress',
        subagentId,
        childSessionId,
        durationMs: num(update.duration_ms ?? update.durationMs) ?? 0,
        turnCount: num(update.turn_count ?? update.turnCount) ?? 0,
        toolCallCount: num(update.tool_call_count ?? update.toolCallCount) ?? 0,
        tokensUsed: num(update.tokens_used ?? update.tokensUsed),
        contextWindowTokens: num(update.context_window_tokens ?? update.contextWindowTokens),
        contextUsagePct: num(update.context_usage_pct ?? update.contextUsagePct),
        toolsUsed: strArr(update.tools_used ?? update.toolsUsed),
        errorCount: num(update.error_count ?? update.errorCount)
      }
    ]
  }

  if (kind === 'subagent_finished') {
    const subagentId = str(update.subagent_id ?? update.subagentId)
    const childSessionId = str(update.child_session_id ?? update.childSessionId) ?? subagentId
    if (!subagentId || !childSessionId) return []
    return [
      {
        ...base,
        type: 'subagent.finished',
        subagentId,
        childSessionId,
        status: str(update.status) ?? 'completed',
        error: str(update.error),
        toolCalls: num(update.tool_calls ?? update.toolCalls),
        turns: num(update.turns),
        durationMs: num(update.duration_ms ?? update.durationMs),
        tokensUsed: num(update.tokens_used ?? update.tokensUsed),
        output: str(update.output)
      }
    ]
  }

  if (kind === 'task_backgrounded') {
    const taskId = str(update.task_id ?? update.taskId)
    if (!taskId) return []
    const mon = str(update.monitor_description ?? update.monitorDescription)
    return [
      {
        ...base,
        type: 'task.backgrounded',
        taskId,
        toolCallId: str(update.tool_call_id ?? update.toolCallId),
        command: str(update.command),
        cwd: str(update.cwd),
        outputFile: str(update.output_file ?? update.outputFile),
        monitorDescription: mon,
        isMonitor: !!mon
      }
    ]
  }

  if (kind === 'task_completed') {
    const snap =
      update.task_snapshot && typeof update.task_snapshot === 'object'
        ? (update.task_snapshot as Record<string, unknown>)
        : update.taskSnapshot && typeof update.taskSnapshot === 'object'
          ? (update.taskSnapshot as Record<string, unknown>)
          : null
    const taskId =
      str(snap?.task_id ?? snap?.taskId) ?? str(update.task_id ?? update.taskId)
    if (!taskId) return []
    return [
      {
        ...base,
        type: 'task.completed',
        taskId,
        snapshot: snap ?? undefined,
        willWake: update.will_wake === true || update.willWake === true
      }
    ]
  }

  return []
}

/** 是否为「应走扩展映射」的 tag（否则交给标准 mapSessionUpdate） */
export function isExtSessionUpdateTag(tag: string): boolean {
  return (
    tag === 'subagent_spawned' ||
    tag === 'subagent_progress' ||
    tag === 'subagent_finished' ||
    tag === 'task_backgrounded' ||
    tag === 'task_completed'
  )
}
