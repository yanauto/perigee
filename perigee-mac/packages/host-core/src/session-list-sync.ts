/**
 * 多会话侧栏投影：哪些事件会改变 list() 里的 status / attention / lastActivityAt。
 * 不含 assistant.delta（太密）；status=streaming 与 tool.call 已覆盖「在跑」。
 */
const DIRTY_TYPES = new Set([
  'session.status',
  'error',
  'turn.end',
  'turn.summary',
  'approval.requested',
  'approval.resolved',
  'tool.call',
  'user.message',
  'assistant.message'
])

const DIRTY_LIFECYCLE = new Set(['queue.changed', 'sessions.changed', 'session.load.ok'])

export function sessionListDirty(event: { type: string; name?: string }): boolean {
  if (DIRTY_TYPES.has(event.type)) return true
  if (event.type === 'lifecycle' && event.name && DIRTY_LIFECYCLE.has(event.name)) {
    return true
  }
  return false
}

/** 侧栏投影合并窗口（ms）：一次 IPC 刷整表，避免每条 tool.call 打一次 list */
export const SESSION_LIST_FLUSH_MS = 32
