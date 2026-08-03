import { describe, expect, it } from 'vitest'
import { computeSessionAttention, toEpochMs } from './session-attention.js'

describe('computeSessionAttention', () => {
  const base = { lastActivityAt: 2000, lastReadAt: 1000 as number | null }

  it('needs_input 压过 working（status=waiting_approval）', () => {
    expect(
      computeSessionAttention({
        ...base,
        status: 'waiting_approval'
      })
    ).toBe('needs_input')
  })

  it('needs_input 压过 streaming（hasPendingApproval）', () => {
    expect(
      computeSessionAttention({
        ...base,
        status: 'streaming',
        hasPendingApproval: true
      })
    ).toBe('needs_input')
  })

  it('streaming / tool_running → working', () => {
    expect(computeSessionAttention({ ...base, status: 'streaming' })).toBe('working')
    expect(computeSessionAttention({ ...base, status: 'tool_running' })).toBe('working')
  })

  it('空闲且 lastActivityAt > lastReadAt → unread', () => {
    expect(
      computeSessionAttention({
        status: 'idle',
        lastActivityAt: 5000,
        lastReadAt: 1000
      })
    ).toBe('unread')
  })

  it('从未 markRead（lastReadAt null）→ unread', () => {
    expect(
      computeSessionAttention({
        status: 'idle',
        lastActivityAt: 100,
        lastReadAt: null
      })
    ).toBe('unread')
  })

  it('空闲且已读到最新 → read', () => {
    expect(
      computeSessionAttention({
        status: 'idle',
        lastActivityAt: 1000,
        lastReadAt: 1000
      })
    ).toBe('read')
    expect(
      computeSessionAttention({
        status: 'idle',
        lastActivityAt: 1000,
        lastReadAt: 2000
      })
    ).toBe('read')
  })

  it('toEpochMs', () => {
    expect(toEpochMs(123)).toBe(123)
    expect(toEpochMs('2026-08-01T00:00:00.000Z')).toBe(
      Date.parse('2026-08-01T00:00:00.000Z')
    )
    expect(toEpochMs(null)).toBe(null)
  })
})
