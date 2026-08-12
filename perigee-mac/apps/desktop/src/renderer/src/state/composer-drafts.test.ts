import { describe, expect, it } from 'vitest'
import {
  clearComposerDraft,
  loadComposerDraft,
  stashComposerDraft
} from './composer-drafts.js'

describe('composer-drafts（按会话隔离草稿）', () => {
  it('切走再切回：草稿还在原会话', () => {
    stashComposerDraft('a', '给 A 的话')
    stashComposerDraft('b', '给 B 的话')
    expect(loadComposerDraft('a')).toBe('给 A 的话')
    expect(loadComposerDraft('b')).toBe('给 B 的话')
  })

  it('空草稿删除条目；发送后 clear', () => {
    stashComposerDraft('c', '暂存')
    stashComposerDraft('c', '')
    expect(loadComposerDraft('c')).toBe('')
    stashComposerDraft('c', '又写了')
    clearComposerDraft('c')
    expect(loadComposerDraft('c')).toBe('')
  })

  it('空 id 不炸', () => {
    stashComposerDraft(null, 'x')
    stashComposerDraft('', 'x')
    expect(loadComposerDraft(null)).toBe('')
    expect(loadComposerDraft(undefined)).toBe('')
  })
})
