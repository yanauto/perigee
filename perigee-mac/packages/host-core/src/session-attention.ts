/**
 * 会话侧栏 attention 四态（T008）。
 * 优先级：needs_input > working > unread > read
 */

export type SessionAttention = 'working' | 'needs_input' | 'unread' | 'read'

export type AttentionInput = {
  /** SessionStatus 或字符串 */
  status: string
  /** 最后活动时间（ms epoch） */
  lastActivityAt: number
  /** 用户上次已读（ms epoch）；null = 从未标记已读 */
  lastReadAt: number | null
  /** 是否有 pending 审批（可选，status=waiting_approval 也算） */
  hasPendingApproval?: boolean
}

const WORKING = new Set(['streaming', 'tool_running'])

/**
 * host 统一判定，前端不拼。
 * needs_input 压过 working（审批/等人优先于「还在跑」）。
 */
export function computeSessionAttention(input: AttentionInput): SessionAttention {
  const status = String(input.status || 'idle')
  const needsInput =
    input.hasPendingApproval === true || status === 'waiting_approval'
  if (needsInput) return 'needs_input'
  if (WORKING.has(status)) return 'working'
  const lastRead = input.lastReadAt
  if (lastRead == null || input.lastActivityAt > lastRead) return 'unread'
  return 'read'
}

/** ISO 或已是 number → ms */
export function toEpochMs(ts: string | number | null | undefined): number | null {
  if (ts == null) return null
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  const n = Date.parse(String(ts))
  return Number.isFinite(n) ? n : null
}
