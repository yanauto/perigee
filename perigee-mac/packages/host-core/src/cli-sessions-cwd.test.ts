import { describe, expect, it } from 'vitest'
import { normalizeCwdForCompare } from './cli-sessions.js'

describe('normalizeCwdForCompare', () => {
  it('去掉尾部分隔符并统一 /', () => {
    const a = normalizeCwdForCompare('/tmp/ws/')
    const b = normalizeCwdForCompare('/tmp/ws')
    expect(a).toBe(b)
    expect(normalizeCwdForCompare('C:\\Users\\me\\proj\\').includes('\\')).toBe(false)
  })

  it('正反斜杠混用可比', () => {
    const mixed = normalizeCwdForCompare('C:/Users/me/proj')
    const win = normalizeCwdForCompare('C:\\Users\\me\\proj')
    expect(mixed).toBe(win)
  })
})
