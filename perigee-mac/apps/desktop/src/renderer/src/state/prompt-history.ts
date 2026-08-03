/**
 * 提示词历史（纲领 §3：Composer 空时 ↑ 召回，按会话持久化，renderer 本地实现）。
 * 纯函数 + localStorage 持久化，便于单测。
 */

export type HistoryNav = {
  /** 当前浏览位置；null = 未在历史中（编辑新草稿） */
  cursor: number | null
  /** 进入历史前暂存的草稿 */
  draft: string
}

const MAX_ENTRIES = 100
const key = (sessionId: string) => `grok.promptHistory.${sessionId}`

/** 追加一条（最新在最前；连续重复不记录；上限截断） */
export function recordEntry(entries: string[], text: string, max = MAX_ENTRIES): string[] {
  const t = text.trim()
  if (!t) return entries
  if (entries[0] === t) return entries
  return [t, ...entries].slice(0, max)
}

/**
 * 向上（更早）浏览。
 * - 未在历史中：暂存当前草稿，跳到最新一条
 * - 已到最旧：不动
 */
export function navPrev(
  entries: string[],
  nav: HistoryNav,
  currentText: string
): { nav: HistoryNav; value: string } {
  if (entries.length === 0) return { nav, value: currentText }
  if (nav.cursor === null) {
    return { nav: { cursor: 0, draft: currentText }, value: entries[0] }
  }
  if (nav.cursor >= entries.length - 1) return { nav, value: entries[nav.cursor] }
  const cursor = nav.cursor + 1
  return { nav: { ...nav, cursor }, value: entries[cursor] }
}

/**
 * 向下（更新）浏览。
 * - 回到最新一条再往下：离开历史，还原草稿
 */
export function navNext(
  entries: string[],
  nav: HistoryNav
): { nav: HistoryNav; value: string } {
  if (nav.cursor === null) return { nav, value: nav.draft }
  if (nav.cursor === 0) {
    return { nav: { cursor: null, draft: '' }, value: nav.draft }
  }
  const cursor = nav.cursor - 1
  return { nav: { ...nav, cursor }, value: entries[cursor] }
}

/** 离开历史（用户手动编辑 / 发送后） */
export function resetNav(): HistoryNav {
  return { cursor: null, draft: '' }
}

export function loadHistory(sessionId: string): string[] {
  try {
    const raw = localStorage.getItem(key(sessionId))
    if (!raw) return []
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((s): s is string => typeof s === 'string').slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

export function saveHistory(sessionId: string, entries: string[]): void {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    /* 配额满等场景静默 */
  }
}
