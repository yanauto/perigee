import { describe, expect, it } from 'vitest'
import {
  classifyAttachPath,
  mediaPathsFromAttachments,
  mergeAttachmentsIntoDraft
} from './attachments'

describe('mergeAttachmentsIntoDraft', () => {
  it('无附件返回正文', () => {
    expect(mergeAttachmentsIntoDraft('hi', [])).toBe('hi')
  })

  it('文本附件转为 @path 前缀', () => {
    expect(mergeAttachmentsIntoDraft('改这个', [{ path: 'src/a.ts' }])).toBe(
      '@src/a.ts\n\n改这个'
    )
  })

  it('图片不进 @ 前缀，走 mediaPaths', () => {
    expect(mergeAttachmentsIntoDraft('看图', [{ path: 'shot.png' }])).toBe('看图')
    expect(mediaPathsFromAttachments([{ path: 'shot.png' }, { path: 'a.ts' }])).toEqual([
      'shot.png'
    ])
  })

  it('含空格路径加引号', () => {
    expect(mergeAttachmentsIntoDraft('x', [{ path: 'docs/a b.md' }])).toContain('@"docs/a b.md"')
  })

  it('classify', () => {
    expect(classifyAttachPath('a.PNG')).toBe('image')
    expect(classifyAttachPath('a.pdf')).toBe('pdf')
  })
})
