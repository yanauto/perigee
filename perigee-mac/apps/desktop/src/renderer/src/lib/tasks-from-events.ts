/**
 * 从原生 SessionEvent（subagent.* / task.*）归约 Tasks 列表。
 * 与 tasks-from-blocks 合并时：native 优先。
 */
import type { SessionEvent } from './perigee-api'
import type { TaskEntry } from './tasks-from-blocks'

export type TaskEntryKind = 'subagent' | 'bg_task' | 'monitor'

export type NativeTaskEntry = TaskEntry & {
  source: 'native'
  kind: TaskEntryKind
  subagentId?: string
  childSessionId?: string
  progress?: {
    durationMs: number
    turnCount: number
    toolCallCount: number
    tokensUsed?: number
    contextUsagePct?: number
  }
  command?: string
}

function statusFromFinished(s: string): TaskEntry['status'] {
  if (s === 'failed' || s === 'error') return 'error'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'done'
}

/** 将单条原生事件应用到条目 map（key = subagentId | taskId） */
export function applyNativeTaskEvent(
  map: Map<string, NativeTaskEntry>,
  ev: SessionEvent
): Map<string, NativeTaskEntry> {
  if (
    ev.type !== 'subagent.spawned' &&
    ev.type !== 'subagent.progress' &&
    ev.type !== 'subagent.finished' &&
    ev.type !== 'task.backgrounded' &&
    ev.type !== 'task.completed'
  ) {
    return map
  }

  const next = new Map(map)

  if (ev.type === 'subagent.spawned') {
    next.set(ev.subagentId, {
      id: ev.subagentId,
      callId: ev.subagentId,
      name: 'subagent',
      title: ev.description || ev.subagentType,
      subagentType: ev.subagentType,
      status: 'running',
      ts: ev.ts,
      source: 'native',
      kind: 'subagent',
      subagentId: ev.subagentId,
      childSessionId: ev.childSessionId
    })
    return next
  }

  if (ev.type === 'subagent.progress') {
    const prev = next.get(ev.subagentId)
    next.set(ev.subagentId, {
      id: ev.subagentId,
      callId: ev.subagentId,
      name: 'subagent',
      title: prev?.title ?? ev.subagentId,
      subagentType: prev?.subagentType,
      status: 'running',
      ts: ev.ts,
      source: 'native',
      kind: 'subagent',
      subagentId: ev.subagentId,
      childSessionId: ev.childSessionId,
      progress: {
        durationMs: ev.durationMs,
        turnCount: ev.turnCount,
        toolCallCount: ev.toolCallCount,
        tokensUsed: ev.tokensUsed,
        contextUsagePct: ev.contextUsagePct
      },
      resultPreview: prev?.resultPreview
    })
    return next
  }

  if (ev.type === 'subagent.finished') {
    const prev = next.get(ev.subagentId)
    const st = statusFromFinished(ev.status)
    next.set(ev.subagentId, {
      id: ev.subagentId,
      callId: ev.subagentId,
      name: 'subagent',
      title: prev?.title ?? ev.subagentId,
      subagentType: prev?.subagentType,
      status: st === 'cancelled' ? 'cancelled' : st,
      ts: ev.ts,
      source: 'native',
      kind: 'subagent',
      subagentId: ev.subagentId,
      childSessionId: ev.childSessionId,
      progress: prev?.progress
        ? { ...prev.progress, durationMs: ev.durationMs ?? prev.progress.durationMs }
        : ev.durationMs != null
          ? {
              durationMs: ev.durationMs,
              turnCount: ev.turns ?? 0,
              toolCallCount: ev.toolCalls ?? 0,
              tokensUsed: ev.tokensUsed
            }
          : prev?.progress,
      resultPreview: ev.error || (ev.output ? ev.output.slice(0, 120) : prev?.resultPreview)
    })
    return next
  }

  if (ev.type === 'task.backgrounded') {
    const kind: TaskEntryKind = ev.isMonitor ? 'monitor' : 'bg_task'
    next.set(ev.taskId, {
      id: ev.taskId,
      callId: ev.toolCallId ?? ev.taskId,
      name: kind === 'monitor' ? 'monitor' : 'bash-bg',
      title: ev.monitorDescription || ev.command || ev.taskId,
      status: 'running',
      ts: ev.ts,
      source: 'native',
      kind,
      command: ev.command,
      resultPreview: ev.cwd
    })
    return next
  }

  if (ev.type === 'task.completed') {
    const prev = next.get(ev.taskId)
    next.set(ev.taskId, {
      id: ev.taskId,
      callId: prev?.callId ?? ev.taskId,
      name: prev?.name ?? 'bash-bg',
      title: prev?.title ?? ev.taskId,
      status: 'done',
      ts: ev.ts,
      source: 'native',
      kind: prev?.kind ?? 'bg_task',
      command: prev?.command,
      resultPreview: prev?.resultPreview
    })
    return next
  }

  return next
}

export function nativeTasksList(map: Map<string, NativeTaskEntry>): NativeTaskEntry[] {
  return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
}

/**
 * 合并原生与 tool 派生：同 id 原生优先；tool 独有条目保留 source=tool。
 */
export function mergeTaskEntries(
  native: NativeTaskEntry[],
  tool: TaskEntry[]
): Array<TaskEntry & { source?: 'native' | 'tool'; kind?: TaskEntryKind }> {
  const map = new Map<string, TaskEntry & { source?: 'native' | 'tool'; kind?: TaskEntryKind }>()
  for (const t of tool) {
    map.set(t.id, { ...t, source: 'tool' })
  }
  for (const n of native) {
    map.set(n.id, n)
  }
  return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
}
