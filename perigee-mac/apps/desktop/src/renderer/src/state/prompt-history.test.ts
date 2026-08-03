import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadHistory,
  navNext,
  navPrev,
  recordEntry,
  resetNav,
  saveHistory,
  type HistoryNav
} from './prompt-history'

// vitest 默认 node 环境无 localStorage：内存版替身（不引 jsdom 依赖）
const store = new Map<string, string>()
const localStorageMock: Storage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (k: string) => store.get(k) ?? null,
  key: (i: number) => [...store.keys()][i] ?? null,
  removeItem: (k: string) => void store.delete(k),
  setItem: (k: string, v: string) => void store.set(k, v)
}
globalThis.localStorage = localStorageMock

beforeEach(() => store.clear())

describe('recordEntry', () => {
  it('最新在最前', () => {
    expect(recordEntry(['a'], 'b')).toEqual(['b', 'a'])
  })
  it('空白不记录', () => {
    expect(recordEntry(['a'], '   ')).toEqual(['a'])
  })
  it('连续重复不记录', () => {
    expect(recordEntry(['a'], 'a')).toEqual(['a'])
  })
  it('非连续重复允许', () => {
    expect(recordEntry(['b', 'a'], 'a')).toEqual(['a', 'b', 'a'])
  })
  it('上限截断', () => {
    const many = Array.from({ length: 100 }, (_, i) => `m${i}`)
    const next = recordEntry(many, 'new', 100)
    expect(next).toHaveLength(100)
    expect(next[0]).toBe('new')
    expect(next[99]).toBe('m98')
  })
})

describe('navPrev / navNext', () => {
  const entries = ['latest', 'mid', 'oldest']
  const idle: HistoryNav = { cursor: null, draft: '' }

  it('首次 ↑：暂存草稿，跳到最新', () => {
    const r = navPrev(entries, idle, '草稿')
    expect(r.nav).toEqual({ cursor: 0, draft: '草稿' })
    expect(r.value).toBe('latest')
  })
  it('连续 ↑ 走到最旧后停住', () => {
    let nav = idle
    nav = navPrev(entries, nav, '').nav
    nav = navPrev(entries, nav, '').nav
    const r = navPrev(entries, nav, '')
    expect(r.nav.cursor).toBe(2)
    expect(r.value).toBe('oldest')
    const r2 = navPrev(entries, r.nav, '')
    expect(r2.nav.cursor).toBe(2)
  })
  it('空历史 ↑ 不动', () => {
    const r = navPrev([], idle, 'x')
    expect(r.nav.cursor).toBeNull()
    expect(r.value).toBe('x')
  })
  it('↓ 回到底部还原草稿并离开历史', () => {
    let nav = idle
    nav = navPrev(entries, nav, '我的草稿').nav
    nav = navPrev(entries, nav, '').nav // cursor 1
    const down = navNext(entries, nav)
    expect(down.nav.cursor).toBe(0)
    expect(down.value).toBe('latest')
    const out = navNext(entries, down.nav)
    expect(out.nav.cursor).toBeNull()
    expect(out.value).toBe('我的草稿')
  })
  it('未在历史中 ↓ 保持草稿', () => {
    const r = navNext(entries, { cursor: null, draft: 'd' })
    expect(r.nav.cursor).toBeNull()
    expect(r.value).toBe('d')
  })
  it('resetNav 归位', () => {
    expect(resetNav()).toEqual({ cursor: null, draft: '' })
  })
})

describe('localStorage 持久化', () => {
  it('save → load 往返', () => {
    saveHistory('s1', ['a', 'b'])
    expect(loadHistory('s1')).toEqual(['a', 'b'])
  })
  it('无数据返回空', () => {
    expect(loadHistory('no-such-session')).toEqual([])
  })
  it('坏 JSON 返回空', () => {
    localStorage.setItem('grok.promptHistory.bad', '{oops')
    expect(loadHistory('bad')).toEqual([])
  })
  it('非字符串项被过滤', () => {
    localStorage.setItem('grok.promptHistory.mix', '["a", 1, null, "b"]')
    expect(loadHistory('mix')).toEqual(['a', 'b'])
  })
})
