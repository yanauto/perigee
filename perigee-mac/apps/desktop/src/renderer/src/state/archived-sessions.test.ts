import { describe, expect, it } from 'vitest'
import {
  EMPTY_ARCHIVED,
  archive,
  cliArchiveKey,
  isArchived,
  isCliKey,
  parseArchived,
  pruneArchived,
  toggleArchivedCollapsed,
  unarchive
} from './archived-sessions'

describe('会话归档（T025 · 纯前端收纳，不动后端数据）', () => {
  it('归档 / 取消归档幂等', () => {
    const a = archive(EMPTY_ARCHIVED, 's1')
    expect(a.ids).toEqual(['s1'])
    expect(archive(a, 's1')).toBe(a) // 幂等：同一引用
    const b = unarchive(a, 's1')
    expect(b.ids).toEqual([])
    expect(unarchive(b, 's1')).toBe(b)
  })

  it('空 id 不入表', () => {
    expect(archive(EMPTY_ARCHIVED, '').ids).toEqual([])
  })

  it('isArchived / 折叠开关', () => {
    const a = archive(EMPTY_ARCHIVED, 's1')
    expect(isArchived(a, 's1')).toBe(true)
    expect(isArchived(a, 's2')).toBe(false)
    expect(EMPTY_ARCHIVED.collapsed).toBe(true) // 默认折叠
    expect(toggleArchivedCollapsed(a).collapsed).toBe(false)
  })

  it('与真实列表对账：Desktop 幽灵 id 剔除，无变化时返回同一引用', () => {
    const a = { ids: ['s1', 's2', 'gone'], collapsed: true }
    const pruned = pruneArchived(a, ['s1', 's2'])
    expect(pruned.ids).toEqual(['s1', 's2'])
    expect(pruneArchived(pruned, ['s1', 's2'])).toBe(pruned)
  })

  /* T025-返修 3：CLI 归档 */
  it('CLI 归档键带前缀，与 Desktop sessionId 分命名空间', () => {
    expect(cliArchiveKey('019fc0cd-dbe8')).toBe('cli:019fc0cd-dbe8')
    expect(isCliKey('cli:019fc0cd-dbe8')).toBe(true)
    expect(isCliKey('ses_abc')).toBe(false)
    const st = archive(EMPTY_ARCHIVED, cliArchiveKey('u1'))
    expect(isArchived(st, cliArchiveKey('u1'))).toBe(true)
    expect(isArchived(st, 'u1')).toBe(false) // 裸 id 不算命中，前缀是硬边界
  })

  it('对账**不碰** cli: 条目（CLI 列表是 top-N 分页，看不见 ≠ 不存在）', () => {
    const st = { ids: ['ses_live', 'ses_gone', 'cli:a', 'cli:b'], collapsed: true }
    const pruned = pruneArchived(st, ['ses_live'])
    expect(pruned.ids).toEqual(['ses_live', 'cli:a', 'cli:b'])
  })

  it('反序列化：坏数据回退空态、去重、collapsed 缺省为 true', () => {
    expect(parseArchived(null)).toEqual(EMPTY_ARCHIVED)
    expect(parseArchived('x')).toEqual(EMPTY_ARCHIVED)
    expect(parseArchived({ ids: ['a', 'a', 1, null], collapsed: false })).toEqual({
      ids: ['a'],
      collapsed: false
    })
    expect(parseArchived({ ids: ['a'] }).collapsed).toBe(true)
  })
})
