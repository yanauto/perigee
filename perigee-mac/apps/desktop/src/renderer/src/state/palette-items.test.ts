import { describe, expect, it } from 'vitest'
import {
  filterPaletteItems,
  fuzzyMatch,
  groupPaletteItems,
  type PaletteItem
} from './palette-items'

const item = (id: string, group: PaletteItem['group'], title: string, sub?: string): PaletteItem => ({
  id,
  group,
  title,
  sub,
  run: () => {}
})

describe('fuzzyMatch', () => {
  it('子序列命中', () => {
    expect(fuzzyMatch('np', '新建会话')).toBe(false) // 中文不按拼音
    expect(fuzzyMatch('op', 'open-workspace')).toBe(true)
    expect(fuzzyMatch('ow', 'open-workspace')).toBe(true)
  })
  it('空查询全命中', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true)
    expect(fuzzyMatch('  ', 'anything')).toBe(true)
  })
  it('大小写不敏感', () => {
    expect(fuzzyMatch('MD', 'model')).toBe(true)
  })
  it('未命中', () => {
    expect(fuzzyMatch('xyz', 'model')).toBe(false)
  })
})

describe('filterPaletteItems', () => {
  const items: PaletteItem[] = [
    item('s1', '会话', '修复登录 bug'),
    item('c1', '命令', '新建会话'),
    item('f1', '文件', 'src/login.ts'),
    item('sl1', 'Slash', '/model')
  ]
  it('保持组序：命令 → Slash → 会话 → 文件', () => {
    const out = filterPaletteItems(items, '')
    expect(out.map((i) => i.group)).toEqual(['命令', 'Slash', '会话', '文件'])
  })
  it('按 title 过滤', () => {
    const out = filterPaletteItems(items, 'model')
    expect(out.map((i) => i.id)).toEqual(['sl1'])
  })
  it('sub 也参与匹配', () => {
    const withSub: PaletteItem[] = [
      { id: 'x', group: '会话', title: '会话A', sub: '登录页面重构', run: () => {} }
    ]
    expect(filterPaletteItems(withSub, '重构')).toHaveLength(1)
  })
})

describe('groupPaletteItems', () => {
  it('按组折叠且跳过空组', () => {
    const items = filterPaletteItems(
      [item('a', '命令', '新建会话'), item('b', '文件', 'x.ts')],
      ''
    )
    const groups = groupPaletteItems(items)
    expect(groups.map(([g]) => g)).toEqual(['命令', '文件'])
    expect(groups[0][1]).toHaveLength(1)
  })
})
