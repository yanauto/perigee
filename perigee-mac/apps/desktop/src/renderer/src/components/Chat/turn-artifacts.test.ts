import { describe, expect, it } from 'vitest'
import type { FileDiff } from '../../lib/perigee-api'
import { diffsOfTurn, hasTurnArtifacts } from './turn-artifacts'

const diff = (turnId: string | undefined, status: FileDiff['status'] = 'pending'): FileDiff => ({
  id: `d-${turnId ?? 'none'}-${status}`,
  sessionId: 's1',
  relativePath: 'src/a.ts',
  absPath: '/repo/src/a.ts',
  before: 'a',
  after: 'b',
  status,
  createdAt: '2026-08-02T00:00:00.000Z',
  turnId
})

describe('hasTurnArtifacts（T023 产物条条件渲染）', () => {
  it('纯聊天轮次（无 filesChanged 无 diff）→ 不渲染', () => {
    expect(hasTurnArtifacts([], [])).toBe(false)
  })

  it('有 filesChanged → 渲染', () => {
    expect(hasTurnArtifacts(['src/a.ts'], [])).toBe(true)
  })

  it('filesChanged 为空但该轮有 diff → 仍渲染', () => {
    expect(hasTurnArtifacts([], [diff('t1')])).toBe(true)
  })

  it('计量（耗时/工具数/token）不参与判定：只看文件变更', () => {
    // 计量已从产物条删除，函数签名里也没有它们的位置——签名即约束
    expect(hasTurnArtifacts.length).toBe(2)
  })
})

describe('diffsOfTurn', () => {
  it('只取本轮 diff（turnId 严格匹配，undefined 不入选）', () => {
    const all = [diff('t1'), diff('t2'), diff(undefined)]
    expect(diffsOfTurn(all, 't1')).toHaveLength(1)
    expect(diffsOfTurn(all, 't1')[0]!.turnId).toBe('t1')
    expect(diffsOfTurn(all, 't3')).toHaveLength(0)
  })
})
