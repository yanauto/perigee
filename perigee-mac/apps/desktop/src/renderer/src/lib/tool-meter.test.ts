import { describe, expect, it } from 'vitest'
import { diffLineStats, formatToolMeter, toolDurationMs } from './tool-meter'

describe('diffLineStats', () => {
  it('unified diff 计 +/-，忽略 ---/+++ 头', () => {
    const result = [
      '--- a/x',
      '+++ b/x',
      '@@ -1,2 +1,3 @@',
      '-old',
      '+new',
      '+also'
    ].join('\n')
    expect(diffLineStats(result)).toEqual({ plus: 2, minus: 1 })
  })

  it('普通输出不装成 diff', () => {
    expect(diffLineStats('ok\n')).toBeNull()
    expect(diffLineStats('-v flag\n')).toBeNull()
  })
})

describe('toolDurationMs', () => {
  it('result 时刻减 call 时刻', () => {
    expect(toolDurationMs('2026-08-13T00:00:00.000Z', '2026-08-13T00:00:02.500Z')).toBe(2500)
  })
  it('非法或倒序 → undefined', () => {
    expect(toolDurationMs('nope', '2026-08-13T00:00:00.000Z')).toBeUndefined()
    expect(toolDurationMs('2026-08-13T00:00:05.000Z', '2026-08-13T00:00:01.000Z')).toBeUndefined()
  })
})

describe('formatToolMeter', () => {
  const t = (s: string) => (s === '行' ? 'lines' : s)
  it('running 为省略号', () => {
    expect(formatToolMeter({ status: 'running' }, t)).toBe('…')
  })
  it('普通结果用行数 + 耗时', () => {
    expect(formatToolMeter({ status: 'done', result: 'a\nb\n', durationMs: 1500 }, t)).toBe(
      '3 lines · 2s'
    )
  })
  it('diff 用 +/-', () => {
    const result = '@@ -1 +1 @@\n-a\n+b\n'
    expect(formatToolMeter({ status: 'done', result, durationMs: 800 }, t)).toBe('+1 −1 · <1s')
  })
})
