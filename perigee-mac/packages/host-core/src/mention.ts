/**
 * @mention 解析与展开（对齐 Claude Code Desktop：@文件 进上下文）
 * 纯函数，便于单测。
 */

// 不以字母数字/._ 开头前缀，避免 email@x.com 误匹配
const MENTION_RE = /(?<![A-Za-z0-9._])@("([^"]+)"|([^\s@]+))/g

/** 从用户输入提取 @路径（相对工作区） */
export function extractMentions(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(text)) !== null) {
    const raw = (m[2] ?? m[3] ?? '').trim()
    if (!raw || raw === '@') continue
    // 去掉尾部常见标点
    const path = raw.replace(/[.,;:!?)。，、；：！？]+$/u, '')
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

/** 补全候选：按 query 过滤相对路径，目录优先靠后（文件优先） */
export function filterMentionCandidates(query: string, files: string[], limit = 12): string[] {
  const q = query.trim().toLowerCase()
  const scored = files
    .filter((f) => !f.endsWith('/'))
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

export type MentionFile = { path: string; content: string; truncated?: boolean }

/**
 * 把用户原文 + 提及文件内容拼成发给引擎的 prompt。
 * 聊天展示仍用原文；引擎侧拿到展开版。
 */
export function buildMentionPrompt(userText: string, files: MentionFile[]): string {
  if (files.length === 0) return userText
  const blocks = files.map((f) => {
    const body = f.truncated ? `${f.content}\n…(截断)` : f.content
    return `### ${f.path}\n\`\`\`\n${body}\n\`\`\``
  })
  return (
    `用户消息中通过 @ 引用了以下文件，请优先阅读：\n\n` +
    blocks.join('\n\n') +
    `\n\n---\n\n${userText}`
  )
}

export const MENTION_MAX_BYTES = 48_000
