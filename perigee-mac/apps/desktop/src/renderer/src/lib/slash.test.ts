import { describe, expect, it } from 'vitest'
import { applySlashInsert, filterSlashItems, getSlashQuery } from './slash'

describe('getSlashQuery', () => {
  it('行首 /', () => {
    expect(getSlashQuery('/de', 3)).toEqual({ start: 0, query: 'de' })
  })
  it('空格后 /', () => {
    const t = 'hi /sk'
    expect(getSlashQuery(t, t.length)).toEqual({ start: 3, query: 'sk' })
  })
  it('非 slash 返回 null', () => {
    expect(getSlashQuery('hello', 5)).toBeNull()
  })
})

describe('applySlashInsert', () => {
  it('替换 query', () => {
    const r = applySlashInsert('/de', 3, 0, '/demo ')
    expect(r.text).toBe('/demo ')
  })
})

describe('filterSlashItems', () => {
  const items = [
    { id: 'a', label: 'demo', description: 'x', insert: '/demo ' },
    { id: 'b', label: 'other', description: 'y', insert: '/other ' }
  ]
  it('前缀优先', () => {
    expect(filterSlashItems('de', items)[0].label).toBe('demo')
  })
})
