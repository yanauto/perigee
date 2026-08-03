import { describe, expect, it } from 'vitest'
import { aggregateDiffStats, lineDiffStats } from './diff-stats'

describe('lineDiffStats', () => {
  it('纯新增', () => {
    expect(lineDiffStats(null, 'a\nb')).toEqual({ add: 2, del: 0 })
  })

  it('纯删除', () => {
    expect(lineDiffStats('a\nb', null)).toEqual({ add: 0, del: 2 })
  })

  it('改动行', () => {
    expect(lineDiffStats('a\nb\nc', 'a\nB\nc')).toEqual({ add: 1, del: 1 })
  })

  it('聚合多文件', () => {
    expect(
      aggregateDiffStats([
        { before: 'x', after: 'x\ny' },
        { before: 'a\nb', after: 'a' }
      ])
    ).toEqual({ add: 1, del: 1 })
  })

  it('超大文件不抛且给出有限变更量', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `L${i}`).join('\n')
    const b = Array.from({ length: 2000 }, (_, i) => `L${i === 100 ? 'X' : i}`).join('\n')
    const s = lineDiffStats(a, b)
    expect(s.add).toBeGreaterThanOrEqual(0)
    expect(s.del).toBeGreaterThanOrEqual(0)
    expect(s.add + s.del).toBeGreaterThan(0)
  })
})
