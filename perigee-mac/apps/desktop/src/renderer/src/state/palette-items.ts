/**
 * ⌘K 统一命令面板的数据层（纲领 §2/§3：壳命令 + slash + 会话跳转 + 文件打开，一个模糊入口）。
 * 纯函数，便于单测；run 闭包由调用方组装。
 */

/** T017：侧栏工作区卡删除后，「最近工作区」归口到 ⌘K（数据走 wb.recent / wb.openRecent） */
export type PaletteGroup = '命令' | '最近工作区' | 'Slash' | '会话' | '文件'

export type PaletteItem = {
  id: string
  group: PaletteGroup
  title: string
  /** 副标题（路径 / 描述） */
  sub?: string
  /** 右侧键位或状态提示 */
  hint?: string
  /** 桥未就绪等置灰场景 */
  disabled?: boolean
  run: () => void
}

const GROUP_ORDER: PaletteGroup[] = ['命令', '最近工作区', 'Slash', '会话', '文件']

/** 子序列模糊匹配（与 v2 面板同一手感） */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = text.toLowerCase()
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i >= q.length) return true
  }
  return false
}

/** 过滤 + 保持组序与组内原序 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const matched = items.filter(
    (it) => fuzzyMatch(query, it.title) || (it.sub ? fuzzyMatch(query, it.sub) : false)
  )
  return matched.sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
  )
}

/** 分组渲染用：保持组序折叠为 [group, items][] */
export function groupPaletteItems(items: PaletteItem[]): [PaletteGroup, PaletteItem[]][] {
  const out: [PaletteGroup, PaletteItem[]][] = []
  for (const g of GROUP_ORDER) {
    const list = items.filter((it) => it.group === g)
    if (list.length > 0) out.push([g, list])
  }
  return out
}
