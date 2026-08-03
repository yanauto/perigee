import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../../lib/types'
import { TOOL_COLS, isApprovalKey, pendingApprovalOf, waitingSeconds } from './approval-flow'

const approvalBlock = (status: 'pending' | 'approved'): ChatBlock => ({
  kind: 'approval',
  id: 'ap1',
  requestId: 'req-1',
  action: 'write',
  detail: 'src/a.ts',
  risk: 'medium',
  status,
  ts: '2026-08-02T10:00:00.000Z'
})

describe('TOOL_COLS（工单钉死四列）', () => {
  it('列宽值钉死：action 56 / target 1fr / meter 64 / state 12', () => {
    expect(TOOL_COLS).toEqual({ action: 56, target: '1fr', meter: 64, state: 12 })
  })
})

describe('pendingApprovalOf', () => {
  it('取最早 pending；无 pending 返回 null', () => {
    expect(pendingApprovalOf([])).toBeNull()
    expect(pendingApprovalOf([approvalBlock('approved')])).toBeNull()
    const b = pendingApprovalOf([approvalBlock('approved'), approvalBlock('pending')])
    expect(b?.requestId).toBe('req-1')
  })
})

describe('isApprovalKey（A/D 键盘审批）', () => {
  const base = { metaKey: false, ctrlKey: false, altKey: false, target: null }
  it('A 允许 / D 拒绝（大小写均可）', () => {
    expect(isApprovalKey({ ...base, key: 'a' })).toBe('approve')
    expect(isApprovalKey({ ...base, key: 'D' })).toBe('reject')
  })
  it('修饰键在场不触发', () => {
    expect(isApprovalKey({ ...base, key: 'a', metaKey: true })).toBeNull()
    expect(isApprovalKey({ ...base, key: 'd', ctrlKey: true })).toBeNull()
  })
  it('输入框/textarea/contenteditable 聚焦时不误触', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as HTMLElement
    const ta = { tagName: 'TEXTAREA', isContentEditable: false } as unknown as HTMLElement
    const ce = { tagName: 'DIV', isContentEditable: true } as unknown as HTMLElement
    expect(isApprovalKey({ ...base, key: 'a', target: input })).toBeNull()
    expect(isApprovalKey({ ...base, key: 'd', target: ta })).toBeNull()
    expect(isApprovalKey({ ...base, key: 'a', target: ce })).toBeNull()
  })
  it('其它键不触发', () => {
    expect(isApprovalKey({ ...base, key: 'b' })).toBeNull()
    expect(isApprovalKey({ ...base, key: 'Escape' })).toBeNull()
  })
})

describe('waitingSeconds', () => {
  it('按 ts 到现在的秒数；非法 ts 归 0', () => {
    const now = new Date('2026-08-02T10:02:00.000Z').getTime()
    expect(waitingSeconds('2026-08-02T10:00:00.000Z', now)).toBe(120)
    expect(waitingSeconds('not-a-date', now)).toBe(0)
  })
})
