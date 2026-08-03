import { describe, expect, it } from 'vitest'
import {
  computeNextRunAt,
  nextDailyAt,
  nextIntervalAt,
  nextWeeklyAt
} from './routine-schedule.js'

describe('routine-schedule · daily', () => {
  it('今天尚未到点 → 今天', () => {
    // 2026-08-02 10:00 本地
    const from = new Date(2026, 7, 2, 10, 0, 0, 0).getTime()
    const next = nextDailyAt('14:30', from)
    expect(next).toBe(new Date(2026, 7, 2, 14, 30, 0, 0).getTime())
  })

  it('今天已过 → 明天（跨天）', () => {
    const from = new Date(2026, 7, 2, 15, 0, 0, 0).getTime()
    const next = nextDailyAt('02:30', from)
    expect(next).toBe(new Date(2026, 7, 3, 2, 30, 0, 0).getTime())
  })

  it('刚好整点已过（= from 不算未来）', () => {
    const from = new Date(2026, 7, 2, 2, 30, 0, 0).getTime()
    const next = nextDailyAt('02:30', from)
    expect(next).toBe(new Date(2026, 7, 3, 2, 30, 0, 0).getTime())
  })

  it('非法 time → null', () => {
    expect(nextDailyAt('25:00', Date.now())).toBeNull()
    expect(nextDailyAt(undefined, Date.now())).toBeNull()
  })
})

describe('routine-schedule · weekly', () => {
  it('本周未到的 weekday', () => {
    // 2026-08-02 是周日 (getDay=0)
    const from = new Date(2026, 7, 2, 8, 0, 0, 0).getTime()
    expect(new Date(from).getDay()).toBe(0)
    // 下周一 = 2026-08-03
    const next = nextWeeklyAt(1, '09:00', from)
    expect(next).toBe(new Date(2026, 7, 3, 9, 0, 0, 0).getTime())
  })

  it('今天是目标 weekday 但时间已过 → 下周', () => {
    // 周日 10:00，要周日 09:00 → 下周日 08-09
    const from = new Date(2026, 7, 2, 10, 0, 0, 0).getTime()
    const next = nextWeeklyAt(0, '09:00', from)
    expect(next).toBe(new Date(2026, 7, 9, 9, 0, 0, 0).getTime())
  })

  it('跨周：周五要周一', () => {
    // 2026-08-07 周五
    const from = new Date(2026, 7, 7, 12, 0, 0, 0).getTime()
    expect(new Date(from).getDay()).toBe(5)
    const next = nextWeeklyAt(1, '09:00', from)
    expect(next).toBe(new Date(2026, 7, 10, 9, 0, 0, 0).getTime())
  })
})

describe('routine-schedule · interval', () => {
  it('无 lastFire → from + period', () => {
    const from = 1_000_000
    expect(nextIntervalAt(1, from)).toBe(from + 60_000)
    expect(nextIntervalAt(6 * 60, from)).toBe(from + 6 * 60 * 60_000)
  })

  it('有 lastFire 且未过 → lastFire + period', () => {
    const from = 1_000_000
    const last = from - 10_000
    expect(nextIntervalAt(1, from, last)).toBe(last + 60_000)
  })

  it('错过多个周期 → 跳到最近未来（不补跑）', () => {
    const period = 60_000
    const last = 1_000_000
    const from = last + period * 3 + 5_000 // 过了 3 个周期多 5s
    const next = nextIntervalAt(1, from, last)
    expect(next).toBeGreaterThan(from)
    expect((next! - last) % period).toBe(0)
  })

  it('everyMinutes < 1 → null', () => {
    expect(nextIntervalAt(0, Date.now())).toBeNull()
    expect(nextIntervalAt(0.5, Date.now())).toBeNull()
  })
})

describe('computeNextRunAt · 多触发器', () => {
  it('取最早', () => {
    const from = new Date(2026, 7, 2, 10, 0, 0, 0).getTime()
    const next = computeNextRunAt(
      [
        { kind: 'daily', time: '18:00' },
        { kind: 'daily', time: '14:00' }
      ],
      from
    )
    expect(next).toBe(new Date(2026, 7, 2, 14, 0, 0, 0).getTime())
  })

  it('空 / 非法 → undefined', () => {
    expect(computeNextRunAt([], Date.now())).toBeUndefined()
    expect(computeNextRunAt([{ kind: 'daily' }], Date.now())).toBeUndefined()
  })
})
