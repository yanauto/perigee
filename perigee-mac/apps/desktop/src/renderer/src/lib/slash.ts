/** Composer `/` 斜杠菜单（skills 浏览） */

export type SlashItem = {
  id: string
  label: string
  description: string
  /** 插入到输入框的文本 */
  insert: string
}

export function getSlashQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  // 行首或空白后的 /
  const m = before.match(/(^|[\s])\/([^\s]*)$/)
  if (!m) return null
  const full = m[0]
  const start = before.length - full.length + (m[1] ? m[1].length : 0)
  return { start, query: m[2] ?? '' }
}

export function filterSlashItems(query: string, items: SlashItem[], limit = 12): SlashItem[] {
  const q = query.trim().toLowerCase()
  const scored = items
    .map((it) => {
      const name = it.label.toLowerCase()
      let score = 0
      if (!q) score = 1
      else if (name.startsWith(q)) score = 100
      else if (name.includes(q)) score = 50
      else if (it.description.toLowerCase().includes(q)) score = 20
      return { it, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.it.label.localeCompare(b.it.label))
  return scored.slice(0, limit).map((x) => x.it)
}

export function applySlashInsert(
  text: string,
  caret: number,
  slashStart: number,
  insert: string
): { text: string; caret: number } {
  const next = text.slice(0, slashStart) + insert + text.slice(caret)
  const nextCaret = slashStart + insert.length
  return { text: next, caret: nextCaret }
}
