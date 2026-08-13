import type { ChatBlock } from '../lib/types'

function pendingApprovalAction(blocks: readonly ChatBlock[]): string | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b?.kind === 'approval' && b.status === 'pending') return b.action
  }
  return undefined
}

function approvalPreview(action: string | undefined): string {
  return action ? `等待审批 · ${action}` : '等待审批'
}

/** 侧栏队列「最后动态」：待审批优先，否则最近工具名 / 助手首行 / 用户消息。 */
export function lastActivityPreview(
  blocks: readonly ChatBlock[],
  status?: string
): string | undefined {
  const action = pendingApprovalAction(blocks)
  if (action !== undefined || status === 'waiting_approval') return approvalPreview(action)
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
  blocksMap: ReadonlyMap<string, readonly ChatBlock[]>,
  statusById?: ReadonlyMap<string, string>
): Map<string, string> {
  const m = new Map<string, string>()
  const seen = new Set<string>()
  for (const [sid, blocks] of blocksMap) {
    seen.add(sid)
    const preview = lastActivityPreview(blocks, statusById?.get(sid))
    if (preview) m.set(sid, preview)
  }
  if (statusById) {
    for (const [sid, status] of statusById) {
      if (seen.has(sid)) continue
      const preview = lastActivityPreview([], status)
      if (preview) m.set(sid, preview)
    }
  }
  return m
}
