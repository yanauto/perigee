import { describe, expect, it } from 'vitest'
import {
  buildMentionPrompt,
  extractMentions,
  filterMentionCandidates
} from './mention.js'

describe('extractMentions', () => {
  it('提取 @path 与带引号路径', () => {
    expect(extractMentions('请看 @src/App.tsx 和 @"docs/a b.md"')).toEqual([
      'src/App.tsx',
      'docs/a b.md'
    ])
  })

  it('去重并剥尾部标点', () => {
    expect(extractMentions('见 @foo.ts, 再看 @foo.ts。')).toEqual(['foo.ts'])
  })

  it('无 mention 返回空；邮箱不算', () => {
    expect(extractMentions('普通消息 email@x.com 不算')).toEqual([])
  })
})

describe('filterMentionCandidates', () => {
  const files = ['src/App.tsx', 'src/main.ts', 'docs/README.md', 'package.json']

  it('按 basename 前缀优先', () => {
    expect(filterMentionCandidates('App', files)[0]).toBe('src/App.tsx')
  })

  it('空 query 返回前若干文件', () => {
    expect(filterMentionCandidates('', files).length).toBeGreaterThan(0)
  })
})

describe('buildMentionPrompt', () => {
  it('无文件则原文', () => {
    expect(buildMentionPrompt('hi', [])).toBe('hi')
  })

  it('有文件则前置上下文', () => {
    const out = buildMentionPrompt('改这个', [{ path: 'a.ts', content: 'const x = 1' }])
    expect(out).toContain('### a.ts')
    expect(out).toContain('const x = 1')
    expect(out).toContain('改这个')
  })
})
