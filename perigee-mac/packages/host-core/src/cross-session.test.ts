import { describe, expect, it } from 'vitest'
import { gateCrossSessionSend } from './cross-session.js'

describe('gateCrossSessionSend', () => {
  it('默认关', () => {
    const r = gateCrossSessionSend(
      { enabled: false },
      { fromSessionId: 'a', toSessionId: 'b', text: 'hi' }
    )
    expect(r.ok).toBe(false)
  })

  it('开启后包装文本', () => {
    const r = gateCrossSessionSend(
      { enabled: true },
      { fromSessionId: 'ses_from', toSessionId: 'ses_to', text: '请继续', fromKind: 'side' }
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.displayText).toBe('请继续')
      expect(r.engineText).toContain('跨会话投递')
      expect(r.engineText).toContain('请继续')
    }
  })

  it('禁止投递到 side', () => {
    const r = gateCrossSessionSend(
      { enabled: true },
      { fromSessionId: 'a', toSessionId: 'b', text: 'x', toKind: 'side' }
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('target_is_side')
  })
})
