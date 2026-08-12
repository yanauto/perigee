import type { ChatBlock } from '../lib/types'

/** 侧栏队列「最后动态」：最近工具名 / 助手首行 / 用户消息。 */
export function lastActivityPreview(blocks: readonly ChatBlock[]): string | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (!b) continue
    if (b.kind === 'tool') return `⚙ ${b.name}`
    if (b.kind === 'assistant' && b.text.trim()) {
      const line = b.text.trim().split('\n')[0] ?? ''
      return line.length > 40 ? `${line.slice(0, 40)}…` : line
    }
    if (b.kind === 'user') {
      const line = b.text.trim().split('\n')[0] ?? ''
      return `你：${line.length > 36 ? `${line.slice(0, 36)}…` : line}`
    }
  }
  return undefined
}

export function lastActivityBySession(
  blocksMap: ReadonlyMap<string, readonly ChatBlock[]>
): Map<string, string> {
  const m = new Map<string, string>()
  for (const [sid, blocks] of blocksMap) {
    const preview = lastActivityPreview(blocks)
    if (preview) m.set(sid, preview)
  }
  return m
}
