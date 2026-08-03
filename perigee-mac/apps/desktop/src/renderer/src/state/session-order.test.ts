import { describe, expect, it } from 'vitest'
import type { ExternalCliSession, SessionRecord } from '../lib/perigee-api'
import {
  attentionOf,
  cliActivityTs,
  mixEntries,
  orderSessions,
  sessionActivityTs,
  sortEntriesByRecency
} from './session-order'

const iso = (s: string) => new Date(s).toISOString()

const desk = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  title: '会话',
  workspacePath: '/repo',
  status: 'idle',
  createdAt: iso('2026-08-01T00:00:00Z'),
  updatedAt: iso('2026-08-01T00:00:00Z'),
  engineId: 'grok-acp',
  ...over
})

const cli = (over: Partial<ExternalCliSession> = {}): ExternalCliSession => ({
  id: 'c1',
  title: 'CLI',
  cwd: '/repo',
  createdAt: iso('2026-08-01T00:00:00Z'),
  updatedAt: iso('2026-08-01T00:00:00Z'),
  summaryPath: '/x/summary.json',
  ...over
})

describe('时间口径（T025-返修 3：侧栏按最近活动降序）', () => {
  it('Desktop：lastActivityAt 优先，缺失回退 updatedAt，再回退 createdAt', () => {
    expect(sessionActivityTs(desk({ lastActivityAt: 12345 }))).toBe(12345)
    expect(sessionActivityTs(desk({ updatedAt: iso('2026-08-02T10:00:00Z') }))).toBe(
      Date.parse('2026-08-02T10:00:00Z')
    )
    expect(
      sessionActivityTs(
        desk({ updatedAt: 'not-a-date', createdAt: iso('2026-07-30T08:00:00Z') })
      )
    ).toBe(Date.parse('2026-07-30T08:00:00Z'))
  })

  it('Desktop：时间全坏 → 0（沉底不炸）', () => {
    expect(sessionActivityTs(desk({ updatedAt: 'x', createdAt: 'y' }))).toBe(0)
  })

  it('CLI：没有 lastActivityAt，用 updatedAt → 回退 createdAt', () => {
    expect(cliActivityTs(cli({ updatedAt: iso('2026-08-03T09:00:00Z') }))).toBe(
      Date.parse('2026-08-03T09:00:00Z')
    )
    expect(cliActivityTs(cli({ updatedAt: '', createdAt: iso('2026-08-01T05:00:00Z') }))).toBe(
      Date.parse('2026-08-01T05:00:00Z')
    )
  })
})

describe('orderSessions', () => {
  it('最近活动降序，side 会话不入列', () => {
    const list = [
      desk({ id: 'old', lastActivityAt: 100 }),
      desk({ id: 'new', lastActivityAt: 900 }),
      desk({ id: 'side', lastActivityAt: 999, kind: 'side' }),
      desk({ id: 'mid', lastActivityAt: 500 })
    ]
    expect(orderSessions(list).map((s) => s.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('两源混排（未分组区 / 已归档区共用）', () => {
  it('Desktop 与 CLI 按同一把尺子交错排序', () => {
    const entries = mixEntries(
      [
        desk({ id: 'd-新', lastActivityAt: Date.parse('2026-08-03T12:00:00Z') }),
        desk({ id: 'd-旧', lastActivityAt: Date.parse('2026-08-01T12:00:00Z') })
      ],
      [
        cli({ id: 'c-中', updatedAt: iso('2026-08-02T12:00:00Z') }),
        cli({ id: 'c-最旧', updatedAt: iso('2026-07-20T12:00:00Z') })
      ]
    )
    expect(entries.map((e) => (e.kind === 's' ? e.session.id : e.cli.id))).toEqual([
      'd-新',
      'c-中',
      'd-旧',
      'c-最旧'
    ])
  })

  it('sortEntriesByRecency 不改原数组，且同刻保持相对序（稳定）', () => {
    const a = mixEntries([desk({ id: 'a', lastActivityAt: 5 })], [])
    const b = mixEntries([desk({ id: 'b', lastActivityAt: 5 })], [])
    const input = [...a, ...b]
    const out = sortEntriesByRecency(input)
    expect(out).not.toBe(input)
    expect(out.map((e) => (e.kind === 's' ? e.session.id : e.cli.id))).toEqual(['a', 'b'])
  })

  it('空输入不炸', () => {
    expect(mixEntries([], [])).toEqual([])
  })
})

describe('attentionOf（既有行为回归）', () => {
  it('优先 attention 字段，其次按 status 映射', () => {
    expect(attentionOf(desk({ attention: 'unread' }))).toBe('unread')
    expect(attentionOf(desk({ status: 'waiting_approval' }))).toBe('needs_input')
    expect(attentionOf(desk({ status: 'streaming' }))).toBe('working')
    expect(attentionOf(desk({ status: 'idle' }))).toBe('read')
  })
})
