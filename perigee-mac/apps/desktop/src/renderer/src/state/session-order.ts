import type { ExternalCliSession, SessionAttention, SessionRecord } from '../lib/perigee-api'

/**
 * 会话排序与状态（T009：砍掉状态分组，一张统一列表）。
 * 侧栏展示顺序 = ⌘1…⌘9 键盘切换顺序（同一函数保证一致）。
 *
 * T025-返修 3：侧栏**所有**区块（未分组 / 各分组内 / CLI 外部条目 / 已归档）统一走这里的
 * 「最近活动时间降序」口径，两源混排按同一把尺子比。时间字段取值：
 * - Desktop `SessionRecord`：`lastActivityAt`（epoch ms，host 维护，最贴近「最近动过」）
 *   → 缺失回退 `updatedAt`（ISO）→ 再回退 `createdAt`
 * - 外部 `ExternalCliSession`：**没有** lastActivityAt，只有 `updatedAt` / `createdAt`（ISO），
 *   取 `updatedAt` → 回退 `createdAt`
 * 一律归一成 epoch ms 再比；解析不了给 0（沉底，不炸）。
 */

const parseTs = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = Date.parse(String(v ?? ''))
  return Number.isNaN(t) ? 0 : t
}

/** Desktop 会话的「最近活动」时刻（epoch ms） */
export function sessionActivityTs(s: SessionRecord): number {
  if (typeof s.lastActivityAt === 'number' && Number.isFinite(s.lastActivityAt)) {
    return s.lastActivityAt
  }
  return parseTs(s.updatedAt) || parseTs(s.createdAt)
}

/** 外部 CLI 会话的「最近活动」时刻（epoch ms） */
export function cliActivityTs(c: ExternalCliSession): number {
  return parseTs(c.updatedAt) || parseTs(c.createdAt)
}

/** 统一扁平序：最近活动倒序；side 会话不进列表 */
export function orderSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions
    .filter((s) => s.kind !== 'side')
    .sort((a, b) => sessionActivityTs(b) - sessionActivityTs(a))
}

/** 侧栏可混排的行：Desktop 会话（s:）与 CLI 历史会话（c:） */
export type SidebarEntry =
  | { kind: 's'; ts: number; session: SessionRecord }
  | { kind: 'c'; ts: number; cli: ExternalCliSession }

export function sessionEntry(session: SessionRecord): SidebarEntry {
  return { kind: 's', ts: sessionActivityTs(session), session }
}

export function cliEntry(cli: ExternalCliSession): SidebarEntry {
  return { kind: 'c', ts: cliActivityTs(cli), cli }
}

/** 混排排序：最近活动降序（同刻保持传入相对序——Array.prototype.sort 稳定） */
export function sortEntriesByRecency(entries: SidebarEntry[]): SidebarEntry[] {
  return [...entries].sort((a, b) => b.ts - a.ts)
}

/** 便捷：Desktop + CLI 一把排（未分组区与已归档区共用同一口径） */
export function mixEntries(
  sessions: readonly SessionRecord[],
  cli: readonly ExternalCliSession[]
): SidebarEntry[] {
  return sortEntriesByRecency([...sessions.map(sessionEntry), ...cli.map(cliEntry)])
}

/**
 * 四态状态点取值：T008 桥就绪用权威 attention 字段；
 * 未就绪回退 status 映射（无已读概念，空闲一律 read）。
 */
export function attentionOf(s: SessionRecord, viewing = false): SessionAttention {
  const att: SessionAttention = s.attention
    ? s.attention
    : s.status === 'waiting_approval' || s.status === 'error'
      ? 'needs_input'
      : s.status === 'streaming' || s.status === 'tool_running'
        ? 'working'
        : 'read'
  if (viewing && att === 'unread') return 'read'
  return att
}
