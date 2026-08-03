import type { ChatBlock } from './types'

/**
 * 工具段聚合（T028）：一轮内**连续的工具调用**收敛成一句自然语言摘要，
 * 「搜索 12 次 · 执行 3 个命令 · 改 2 个文件」——默认只有这一行，点开才是逐条明细。
 * 治的是真机实锤的「连搜几十次刷穿屏幕」。
 *
 * 全是纯函数：分类只看工具名/kind，计数只数块，文案只拼串——可单测，不碰 DOM。
 */

export type ToolCategory = 'search' | 'command' | 'read' | 'edit' | 'web' | 'other'

export const TOOL_CATEGORY_ORDER: ToolCategory[] = [
  'search',
  'command',
  'read',
  'edit',
  'web',
  'other'
]

export type ToolTally = Record<ToolCategory, number>

export function emptyTally(): ToolTally {
  return { search: 0, command: 0, read: 0, edit: 0, web: 0, other: 0 }
}

/** 工具名 → 类别（引擎工具名五花八门，按关键词归类；kind 字段优先） */
export function classifyTool(name: string, toolKind?: string): ToolCategory {
  const n = `${toolKind ?? ''} ${name ?? ''}`.toLowerCase()
  // 先匹配写类（search_replace 含 search，必须在 search 分支之前 — 审计 Z6-04）
  if (
    /search_replace|str_replace|strreplace|write|edit|patch|apply|create|delete|remove|move|rename|mkdir/.test(
      n
    )
  ) {
    return 'edit'
  }
  if (/search|grep|glob|find|rg\b/.test(n)) return 'search'
  if (/bash|shell|exec|command|terminal|run\b/.test(n)) return 'command'
  if (/fetch|http|web|browser|url|curl/.test(n)) return 'web'
  if (/read|cat|open|view|list|ls\b|stat/.test(n)) return 'read'
  return 'other'
}

export type ToolSegmentStats = {
  tally: ToolTally
  /** 工具调用总数 */
  total: number
  /** 还在跑的数量（流式中 > 0） */
  running: number
  /** 段内是否有失败 */
  failed: number
}

/** 统计一段（连续 thought/tool/plan 块）里的工具调用 */
export function tallyToolBlocks(blocks: readonly ChatBlock[]): ToolSegmentStats {
  const tally = emptyTally()
  let total = 0
  let running = 0
  let failed = 0
  for (const b of blocks) {
    if (b.kind !== 'tool') continue
    total += 1
    tally[classifyTool(b.name, b.toolKind)] += 1
    if (b.status === 'running') running += 1
    if (b.status === 'error') failed += 1
  }
  return { tally, total, running, failed }
}

const ZH_LABEL: Record<ToolCategory, (n: number) => string> = {
  search: (n) => `搜索 ${n} 次`,
  command: (n) => `执行 ${n} 个命令`,
  read: (n) => `读 ${n} 个文件`,
  edit: (n) => `改 ${n} 个文件`,
  web: (n) => `访问 ${n} 个网页`,
  other: (n) => `其它工具 ${n} 次`
}

const EN_LABEL: Record<ToolCategory, (n: number) => string> = {
  search: (n) => `${n} search${n > 1 ? 'es' : ''}`,
  command: (n) => `${n} command${n > 1 ? 's' : ''}`,
  read: (n) => `read ${n} file${n > 1 ? 's' : ''}`,
  edit: (n) => `edited ${n} file${n > 1 ? 's' : ''}`,
  web: (n) => `${n} page${n > 1 ? 's' : ''}`,
  other: (n) => `${n} other call${n > 1 ? 's' : ''}`
}

/** 摘要文案：各类别按固定顺序拼「· 」；没有工具调用给空串（调用方据此不渲染） */
export function describeToolSegment(stats: ToolSegmentStats, lang: 'zh' | 'en' = 'zh'): string {
  if (stats.total === 0) return ''
  const label = lang === 'en' ? EN_LABEL : ZH_LABEL
  const parts = TOOL_CATEGORY_ORDER.filter((c) => stats.tally[c] > 0).map((c) =>
    label[c](stats.tally[c])
  )
  return parts.join(' · ')
}

/* ---------- 文件路径去重（治「同名文件 chips 重复」） ---------- */

/**
 * 归一：去 `./` 前缀、折叠重复斜杠、去尾斜杠；给了工作区根就把该根下的绝对路径折成相对。
 * host 的 turn-tracker 以 Map 去重，但键可能一次是绝对路径、一次是相对路径
 * （`normalizePath` 在 diffs 不可用时原样返回），于是同一个文件出现两条、chip 上显示同名。
 */
export function canonicalFilePath(p: string, workspaceRoot?: string | null): string {
  let s = (p ?? '').trim().replace(/\\/g, '/')
  if (!s) return ''
  s = s.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  s = s.replace(/^\.\//, '')
  if (workspaceRoot) {
    const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
    if (root && s.startsWith(`${root}/`)) s = s.slice(root.length + 1)
  }
  return s
}

/**
 * 同轮同路径去重（保持首次出现顺序）。
 * 绝对/相对混排时：若某条绝对路径以某条相对路径结尾（`/a/b/src/x.ts` vs `src/x.ts`），视为同一个文件，
 * 保留先出现的那条。
 */
export function dedupeFilePaths(
  files: readonly string[],
  workspaceRoot?: string | null
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of files) {
    const c = canonicalFilePath(raw, workspaceRoot)
    if (!c || seen.has(c)) continue
    // 绝对 ↔ 相对 的同一文件
    const dup = out.some((prev) => {
      const p = canonicalFilePath(prev, workspaceRoot)
      return p.endsWith(`/${c}`) || c.endsWith(`/${p}`)
    })
    if (dup) continue
    seen.add(c)
    out.push(c)
  }
  return out
}
