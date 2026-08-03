import { describe, expect, it } from 'vitest'
import { applyMention, filterMentionCandidates, getMentionQuery } from './mention'

describe('getMentionQuery', () => {
  it('光标在 @ 后提取 query', () => {
    const t = '请看 @src/Ap'
    expect(getMentionQuery(t, t.length)).toEqual({ start: 3, query: 'src/Ap' })
  })

  it('邮箱不触发', () => {
    const t = 'mail@x.com'
    expect(getMentionQuery(t, t.length)).toBeNull()
  })
})

describe('applyMention', () => {
  it('替换 query 并插入路径', () => {
    const t = '见 @Ap'
    const r = applyMention(t, t.length, 2, 'src/App.tsx')
    expect(r.text).toBe('见 @src/App.tsx ')
  })
})

describe('filterMentionCandidates', () => {
  it('basename 前缀优先', () => {
    expect(filterMentionCandidates('App', ['src/App.tsx', 'docs/a.md'])[0]).toBe('src/App.tsx')
  })
})
