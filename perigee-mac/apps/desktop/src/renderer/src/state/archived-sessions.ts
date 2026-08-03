/**
 * 会话归档（T025）：**后端没有归档能力**，这是纯前端的收纳视图——
 * 只记「哪些条目被折叠到侧栏底部的『已归档』区」，不动任何会话数据、不删不改后端状态。
 * 持久化与分组同一套路数：uiState 桶为准，桥未就绪降级 localStorage（同 key 同 schema）。
 * 纯函数便于单测。
 *
 * T025-返修 3：归档能力扩到**外部 CLI 会话**。两类 id 同存一个 ids 数组，用前缀区分命名空间：
 * - Desktop 会话：原样存 sessionId（如 `ses_xxx`），旧数据无需迁移
 * - 外部 CLI 会话：存 `cli:<uuid>`（`cliArchiveKey()`）
 * 前缀还有一个要紧作用：**对账只清理 Desktop 侧的幽灵 id**——CLI 列表是 listExternal 的
 * top-N 分页结果，看不见的不代表不存在，拿它做对账会误删（见 pruneArchived）。
 */

export type ArchivedState = {
  /** 归档的 sessionId 列表（保持归档先后序，展示时再按活动时间排） */
  ids: string[]
  /** 「已归档」区是否折叠（默认折叠） */
  collapsed: boolean
}

export const ARCHIVED_KEY = 'sidebar.archived.v1'

export const EMPTY_ARCHIVED: ArchivedState = { ids: [], collapsed: true }

/** 外部 CLI 会话的归档键（与 Desktop sessionId 分命名空间） */
export const CLI_PREFIX = 'cli:'

export function cliArchiveKey(cliSessionId: string): string {
  return `${CLI_PREFIX}${cliSessionId}`
}

export function isCliKey(key: string): boolean {
  return key.startsWith(CLI_PREFIX)
}

export function isArchived(st: ArchivedState, key: string): boolean {
  return st.ids.includes(key)
}

/** 归档（幂等）；key = Desktop sessionId 或 cliArchiveKey(cliId) */
export function archive(st: ArchivedState, key: string): ArchivedState {
  if (!key || st.ids.includes(key)) return st
  return { ...st, ids: [...st.ids, key] }
}

/** 取消归档（幂等） */
export function unarchive(st: ArchivedState, key: string): ArchivedState {
  if (!st.ids.includes(key)) return st
  return { ...st, ids: st.ids.filter((id) => id !== key) }
}

export function toggleArchivedCollapsed(st: ArchivedState): ArchivedState {
  return { ...st, collapsed: !st.collapsed }
}

/**
 * 与真实会话列表对账：已经不存在的 Desktop 会话（被删/换工作区）从归档表里剔除，
 * 避免归档表变成幽灵 id 的垃圾场。返回同一引用表示无需持久化。
 * **只清理 Desktop 侧**：`cli:` 条目一律保留——CLI 列表是 top-N 分页结果，
 * 「这次没返回」不等于「不存在了」，拿它对账会把翻页外的归档记录误删。
 */
export function pruneArchived(st: ArchivedState, liveIds: readonly string[]): ArchivedState {
  const live = new Set(liveIds)
  const kept = st.ids.filter((id) => isCliKey(id) || live.has(id))
  return kept.length === st.ids.length ? st : { ...st, ids: kept }
}

/** 反序列化（坏数据安全回退空态） */
export function parseArchived(raw: unknown): ArchivedState {
  if (!raw || typeof raw !== 'object') return EMPTY_ARCHIVED
  const r = raw as Record<string, unknown>
  const ids = Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === 'string') : []
  return { ids: [...new Set(ids)], collapsed: r.collapsed !== false }
}

/* ---------- 持久化（与 sidebar-groups 同款） ---------- */

export async function loadArchived(uiStateReady: boolean): Promise<ArchivedState> {
  try {
    if (uiStateReady) return parseArchived(await window.perigee.uiState.get(ARCHIVED_KEY))
    const raw = localStorage.getItem(ARCHIVED_KEY)
    return parseArchived(raw ? JSON.parse(raw) : null)
  } catch {
    return EMPTY_ARCHIVED
  }
}

export async function saveArchived(st: ArchivedState, uiStateReady: boolean): Promise<void> {
  try {
    if (uiStateReady) {
      await window.perigee.uiState.set(ARCHIVED_KEY, st)
      return
    }
    localStorage.setItem(ARCHIVED_KEY, JSON.stringify(st))
  } catch {
    /* 配额/序列化异常静默 */
  }
}
