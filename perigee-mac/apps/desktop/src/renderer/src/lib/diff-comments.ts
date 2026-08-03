/** Diff 行评论 → 发给 agent 的纠正消息（对齐 Claude Code Desktop 行评论提交） */

export type DiffLineComment = {
  /** 工作区相对路径 */
  path: string
  /** unified diff 中的 0-based 行号 */
  lineIndex: number
  /** 该行原文（含 +/- 前缀） */
  lineText: string
  comment: string
}

/** 组装多条行评论为一轮用户消息 */
export function formatDiffCommentsMessage(comments: DiffLineComment[]): string {
  const usable = comments
    .map((c) => ({
      ...c,
      comment: c.comment.trim(),
      path: c.path.trim(),
      lineText: c.lineText.replace(/\n$/, '')
    }))
    .filter((c) => c.comment.length > 0 && c.path.length > 0)

  if (usable.length === 0) return ''

  const byPath = new Map<string, DiffLineComment[]>()
  for (const c of usable) {
    const list = byPath.get(c.path) ?? []
    list.push(c)
    byPath.set(c.path, list)
  }

  const parts: string[] = [
    '请根据我对 diff 的行评论修改代码（对齐审查意见，不要扩大范围）：',
    ''
  ]

  for (const [path, list] of byPath) {
    parts.push(`### \`${path}\``)
    const ordered = [...list].sort((a, b) => a.lineIndex - b.lineIndex)
    for (const c of ordered) {
      const preview = c.lineText.length > 200 ? `${c.lineText.slice(0, 200)}…` : c.lineText
      parts.push(`- 行 ${c.lineIndex + 1}: \`${preview}\``)
      parts.push(`  > ${c.comment}`)
    }
    parts.push('')
  }

  return parts.join('\n').trimEnd() + '\n'
}

/** 同一文件同一行只保留最新评论 */
export function upsertComment(
  list: DiffLineComment[],
  next: DiffLineComment
): DiffLineComment[] {
  const comment = next.comment.trim()
  const without = list.filter((c) => !(c.path === next.path && c.lineIndex === next.lineIndex))
  if (!comment) return without
  return [...without, { ...next, comment }]
}
