import { describe, expect, it } from 'vitest'
import { sessionIdsNeedingSeed } from './session-seed.js'

describe('sessionIdsNeedingSeed', () => {
  it('跳过已 seed 与 side，截到 limit', () => {
    const seeded = new Set(['a'])
    const ids = sessionIdsNeedingSeed(
      [
        { id: 'a' },
        { id: 'b' },
        { id: 'side1', kind: 'side' },
        { id: 'c' },
        { id: 'd' }
      ],
      seeded,
      2
    )
    expect(ids).toEqual(['b', 'c'])
  })

  it('空列表', () => {
    expect(sessionIdsNeedingSeed([], new Set())).toEqual([])
  })

  it('按 lastActivityAt 降序取最热的 N 个（冷启动预览优先后台活跃会话）', () => {
    const ids = sessionIdsNeedingSeed(
      [
        { id: 'old', lastActivityAt: 100 },
        { id: 'hot', lastActivityAt: 900 },
        { id: 'mid', lastActivityAt: 500 },
        { id: 'side1', kind: 'side', lastActivityAt: 999 }
      ],
      new Set(),
      2
    )
    expect(ids).toEqual(['hot', 'mid'])
  })
})
