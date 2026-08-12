import { describe, expect, it } from 'vitest'
import { sessionListDirty } from './session-list-sync.js'

describe('sessionListDirty', () => {
  it('status / 审批 / 工具 / 回合结束会脏侧栏', () => {
    expect(sessionListDirty({ type: 'session.status' })).toBe(true)
    expect(sessionListDirty({ type: 'error' })).toBe(true)
    expect(sessionListDirty({ type: 'turn.end' })).toBe(true)
    expect(sessionListDirty({ type: 'approval.requested' })).toBe(true)
    expect(sessionListDirty({ type: 'tool.call' })).toBe(true)
    expect(sessionListDirty({ type: 'user.message' })).toBe(true)
  })

  it('流式 delta 不脏（靠 status=streaming 已广播）', () => {
    expect(sessionListDirty({ type: 'assistant.delta' })).toBe(false)
    expect(sessionListDirty({ type: 'thought.delta' })).toBe(false)
    expect(sessionListDirty({ type: 'file.changed' })).toBe(false)
  })

  it('grok 1.0 队列/名册 lifecycle 脏侧栏', () => {
    expect(sessionListDirty({ type: 'lifecycle', name: 'queue.changed' })).toBe(true)
    expect(sessionListDirty({ type: 'lifecycle', name: 'sessions.changed' })).toBe(true)
    expect(sessionListDirty({ type: 'lifecycle', name: 'mcp.update.ok' })).toBe(false)
  })
})
