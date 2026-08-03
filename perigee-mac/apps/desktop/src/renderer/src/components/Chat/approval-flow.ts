import type { ChatBlock } from '../../lib/types'

type ApprovalBlock = Extract<ChatBlock, { kind: 'approval' }>

/** 工具行四列列宽（工单钉死值；ToolRow 网格与 DOM 量具核对都以此为准） */
export const TOOL_COLS = { action: 56, target: '1fr', meter: 64, state: 12 } as const

/** CSS grid-template-columns 串（icon 12 在四列之外：图标 · 动作 · 目标 · 计量 · 状态） */
export const TOOL_GRID = `12px ${TOOL_COLS.action}px minmax(0, ${TOOL_COLS.target}) ${TOOL_COLS.meter}px ${TOOL_COLS.state}px`

/** 当前待处理的审批块（取最早一条 pending；无 → null） */
export function pendingApprovalOf(blocks: ChatBlock[]): ApprovalBlock | null {
  for (const b of blocks) {
    if (b.kind === 'approval' && b.status === 'pending') return b
  }
  return null
}

/** A/D 审批键判定：仅当无修饰键、且焦点不在输入类元素（输入框聚焦时不误触） */
export function isApprovalKey(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  target: EventTarget | null
}): 'approve' | 'reject' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return null
  const k = e.key.toLowerCase()
  if (k === 'a') return 'approve'
  if (k === 'd') return 'reject'
  return null
}

/** 等待时长文案数据（展示层按语言格式化） */
export function waitingSeconds(ts: string, now: number = Date.now()): number {
  const start = new Date(ts).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.round((now - start) / 1000))
}
