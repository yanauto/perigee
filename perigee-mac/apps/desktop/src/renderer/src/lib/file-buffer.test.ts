import { describe, expect, it } from 'vitest'
import {
  applyDiskContent,
  applyLocalEdit,
  afterSuccessfulSave,
  createEmptyBuffer,
  prepareSave
} from './file-buffer'

describe('file-buffer', () => {
  it('非 dirty 时磁盘更新直接采用', () => {
    let s = createEmptyBuffer('a.ts')
    s = applyDiskContent(s, { content: 'hello' })
    expect(s.content).toBe('hello')
    expect(s.baseline).toBe('hello')
    expect(s.dirty).toBe(false)
  })

  it('dirty 且磁盘偏离 baseline → conflict，不覆盖缓冲', () => {
    let s = createEmptyBuffer('a.ts')
    s = applyDiskContent(s, { content: 'base' })
    s = applyLocalEdit(s, 'local')
    s = applyDiskContent(s, { content: 'disk' })
    expect(s.conflict).toBe(true)
    expect(s.content).toBe('local')
  })

  it('prepareSave 检测冲突；force 可过', () => {
    let s = createEmptyBuffer('a.ts')
    s = applyDiskContent(s, { content: 'base' })
    s = applyLocalEdit(s, 'local')
    expect(prepareSave(s, 'disk', false)).toEqual({ ok: false, reason: 'conflict' })
    expect(prepareSave(s, 'disk', true)).toEqual({ ok: true, content: 'local' })
    expect(prepareSave(s, 'base', false)).toEqual({ ok: true, content: 'local' })
  })

  it('保存成功清 dirty/conflict', () => {
    let s = createEmptyBuffer('a.ts')
    s = applyDiskContent(s, { content: 'base' })
    s = applyLocalEdit(s, 'local')
    s = { ...s, conflict: true }
    s = afterSuccessfulSave(s, 'local')
    expect(s.dirty).toBe(false)
    expect(s.conflict).toBe(false)
    expect(s.baseline).toBe('local')
  })
})
