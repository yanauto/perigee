/** 渲染进程侧 @mention 补全（与 host-core/mention 语义对齐） */

// 不以字母数字/._ 前缀，避免邮箱误匹配
const AT_QUERY_RE = /(?<![A-Za-z0-9._])@("([^"]*)"|([^\s@]*))$/

export function getMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = before.match(AT_QUERY_RE)
  if (!m) return null
  const full = m[0]
  // full 可能以非 @ 开头的 lookbehind 字符——用 lastIndexOf @
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const raw = m[2] ?? m[3] ?? ''
  return { start: at, query: raw }
}

export function filterMentionCandidates(query: string, files: string[], limit = 12): string[] {
  const q = query.trim().toLowerCase()
  const scored = files
    .map((f) => {
      const lower = f.toLowerCase()
      const base = lower.split('/').pop() ?? lower
      let score = 0
      if (!q) score = 1
      else if (base.startsWith(q)) score = 100
      else if (lower.includes(q)) score = 50
      else if (base.includes(q)) score = 40
      return { f, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.localeCompare(b.f))
  return scored.slice(0, limit).map((x) => x.f)
}

/** 在光标处插入 @path（替换正在输入的 query） */
export function applyMention(
  text: string,
  caret: number,
  mentionStart: number,
  path: string
): { text: string; caret: number } {
  const insert = path.includes(' ') ? `@"${path}" ` : `@${path} `
  const next = text.slice(0, mentionStart) + insert + text.slice(caret)
  const nextCaret = mentionStart + insert.length
  return { text: next, caret: nextCaret }
}
