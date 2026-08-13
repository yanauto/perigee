import { describe, expect, it } from 'vitest'
import { engineEchoing } from './engine-health'

describe('engineEchoing', () => {
  it('info 未到不闪提示', () => {
    expect(engineEchoing(null)).toBe(false)
    expect(engineEchoing(undefined)).toBe(false)
  })

  it('实际 Stub 即回声', () => {
    expect(engineEchoing({ engineModeActual: 'stub', grokAvailable: true })).toBe(true)
  })

  it('CLI 缺失即回声', () => {
    expect(engineEchoing({ engineModeActual: 'acp', grokAvailable: false })).toBe(true)
  })

  it('ACP 且 CLI 可用则不是回声', () => {
    expect(engineEchoing({ engineModeActual: 'acp', grokAvailable: true })).toBe(false)
  })
})
