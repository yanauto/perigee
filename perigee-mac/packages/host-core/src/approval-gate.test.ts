import { describe, expect, it } from 'vitest'
import { ApprovalGate } from './approval-gate.js'

describe('ApprovalGate', () => {
  it('未知 id resolve 返回 null', () => {
    const g = new ApprovalGate()
    expect(g.resolve('nope', true)).toBeNull()
  })

  it('session-allow 后 isPreapproved 为 true', async () => {
    const g = new ApprovalGate()
    const p = g.request({
      id: 'a1',
      sessionId: 's1',
      action: 'shell',
      detail: 'ls',
      risk: 'medium'
    })
    expect(g.listPending('s1')).toHaveLength(1)
    g.resolve('a1', true, 'session-allow')
    await expect(p).resolves.toBe(true)
    expect(g.isPreapproved('s1', 'shell')).toBe(true)
    expect(g.isPreapproved('s2', 'shell')).toBe(false)
    // 再次 request 短路，不进 pending
    const p2 = g.request({
      id: 'a2',
      sessionId: 's1',
      action: 'shell',
      detail: 'pwd',
      risk: 'low'
    })
    expect(g.listPending()).toHaveLength(0)
    await expect(p2).resolves.toBe(true)
  })

  it('always-allow 跨会话生效', async () => {
    const g = new ApprovalGate()
    const p = g.request({
      id: 'b1',
      sessionId: 's1',
      action: 'write',
      detail: 'x',
      risk: 'low'
    })
    g.resolve('b1', true, 'always-allow')
    await p
    expect(g.isPreapproved('s9', 'write')).toBe(true)
  })

  it('reject 不进入 allow 集', async () => {
    const g = new ApprovalGate()
    const p = g.request({
      id: 'c1',
      sessionId: 's1',
      action: 'shell',
      detail: 'rm',
      risk: 'high'
    })
    g.resolve('c1', false, 'session-allow')
    await expect(p).resolves.toBe(false)
    expect(g.isPreapproved('s1', 'shell')).toBe(false)
  })

  it('isDangerousShell 识别高危', () => {
    const g = new ApprovalGate()
    expect(g.isDangerousShell('rm -rf /')).toBe(true)
    expect(g.isDangerousShell('echo hi')).toBe(false)
  })
})
