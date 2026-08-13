import { describe, expect, it } from 'vitest'
import { nextCronAt, parseCron } from './cron-next.js'

describe('parseCron', () => {
  it('5 字段合法', () => {
    const f = parseCron('0 9 * * 1')
    expect(f?.minute.has(0)).toBe(true)
    expect(f?.hour.has(9)).toBe(true)
    expect(f?.dow.has(1)).toBe(true)
  })
  it('7 = 周日', () => {
    const f = parseCron('0 0 * * 7')
    expect(f?.dow.has(0)).toBe(true)
    expect(f?.dow.has(7)).toBe(false)
  })
  it('非法拒绝', () => {
    expect(parseCron('')).toBeNull()
    expect(parseCron('* * *')).toBeNull()
    expect(parseCron('60 0 * * *')).toBeNull()
  })
})

describe('nextCronAt', () => {
  it('每天 09:00：上午未到 → 今天', () => {
    const from = new Date(2026, 7, 13, 8, 0, 0, 0).getTime()
    expect(nextCronAt('0 9 * * *', from)).toBe(new Date(2026, 7, 13, 9, 0, 0, 0).getTime())
  })
  it('每天 09:00：已过 → 明天', () => {
    const from = new Date(2026, 7, 13, 10, 0, 0, 0).getTime()
    expect(nextCronAt('0 9 * * *', from)).toBe(new Date(2026, 7, 14, 9, 0, 0, 0).getTime())
  })
  it('每周一 09:00', () => {
    // 2026-08-13 周四
    const from = new Date(2026, 7, 13, 8, 0, 0, 0).getTime()
    expect(new Date(from).getDay()).toBe(4)
    expect(nextCronAt('0 9 * * 1', from)).toBe(new Date(2026, 7, 17, 9, 0, 0, 0).getTime())
  })
  it('*/15 分钟', () => {
    const from = new Date(2026, 7, 13, 10, 7, 0, 0).getTime()
    expect(nextCronAt('*/15 * * * *', from)).toBe(new Date(2026, 7, 13, 10, 15, 0, 0).getTime())
  })
})
