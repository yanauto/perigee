import { describe, expect, it } from 'vitest'
import { sessionRowLooksActive } from './session-row-active'

describe('sessionRowLooksActive', () => {
  it('高亮当前会话（非 Routines）', () => {
    expect(sessionRowLooksActive('a', 'a', false)).toBe(true)
    expect(sessionRowLooksActive('a', 'b', false)).toBe(false)
    expect(sessionRowLooksActive('a', null, false)).toBe(false)
  })

  it('Routines 打开时一律不高亮会话行（消除双焦点）', () => {
    expect(sessionRowLooksActive('a', 'a', true)).toBe(false)
    expect(sessionRowLooksActive('a', 'b', true)).toBe(false)
    expect(sessionRowLooksActive('a', null, true)).toBe(false)
  })
})
