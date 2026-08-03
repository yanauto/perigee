import { describe, expect, it } from 'vitest'
import { formatDiffCommentsMessage, upsertComment, type DiffLineComment } from './diff-comments'

describe('formatDiffCommentsMessage', () => {
  it('空评论返回空串', () => {
    expect(formatDiffCommentsMessage([])).toBe('')
    expect(
      formatDiffCommentsMessage([{ path: 'a.ts', lineIndex: 0, lineText: '+x', comment: '  ' }])
    ).toBe('')
  })

  it('按文件分组并带行内容与意见', () => {
    const comments: DiffLineComment[] = [
      { path: 'b.ts', lineIndex: 5, lineText: '+const y = 2', comment: '用 const' },
      { path: 'a.ts', lineIndex: 2, lineText: '-old', comment: '不要删' },
      { path: 'a.ts', lineIndex: 1, lineText: '+new', comment: '改名' }
    ]
    const msg = formatDiffCommentsMessage(comments)
    expect(msg).toContain('请根据我对 diff 的行评论')
    expect(msg).toContain('### `a.ts`')
    expect(msg).toContain('### `b.ts`')
    expect(msg).toContain('行 2:')
    expect(msg).toContain('> 改名')
    expect(msg).toContain('> 不要删')
    // 同文件内按 lineIndex 排序
    const aIdx = msg.indexOf('### `a.ts`')
    const line2 = msg.indexOf('行 2:', aIdx)
    const line3 = msg.indexOf('行 3:', aIdx)
    expect(line2).toBeLessThan(line3)
  })
})

describe('upsertComment', () => {
  it('同行覆盖，空评论删除', () => {
    let list: DiffLineComment[] = []
    list = upsertComment(list, { path: 'a', lineIndex: 1, lineText: '+x', comment: 'one' })
    list = upsertComment(list, { path: 'a', lineIndex: 1, lineText: '+x', comment: 'two' })
    expect(list).toHaveLength(1)
    expect(list[0].comment).toBe('two')
    list = upsertComment(list, { path: 'a', lineIndex: 1, lineText: '+x', comment: '' })
    expect(list).toHaveLength(0)
  })
})
