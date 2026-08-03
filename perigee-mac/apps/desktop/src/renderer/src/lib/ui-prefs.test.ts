import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, DEFAULT_ACCENT, coerceBool, isAccent } from './ui-prefs'

describe('ui-prefs 偏好解析（T017）', () => {
  it('isAccent 只认 #rrggbb', () => {
    expect(isAccent('#2f6bf0')).toBe(true)
    expect(isAccent('#ABCDEF')).toBe(true)
    expect(isAccent('#fff')).toBe(false)
    expect(isAccent('red')).toBe(false)
    expect(isAccent('javascript:alert(1)')).toBe(false)
    expect(isAccent(null)).toBe(false)
    expect(isAccent(42)).toBe(false)
  })

  it('四个预设色都是合法值，默认色 = 第一个预设', () => {
    ACCENT_PRESETS.forEach((c) => expect(isAccent(c)).toBe(true))
    expect(DEFAULT_ACCENT).toBe(ACCENT_PRESETS[0])
  })

  it('coerceBool：认 true/false 及其字符串，其余回退默认', () => {
    expect(coerceBool(true, false)).toBe(true)
    expect(coerceBool('true', false)).toBe(true)
    expect(coerceBool(false, true)).toBe(false)
    expect(coerceBool('false', true)).toBe(false)
    expect(coerceBool(null, true)).toBe(true)
    expect(coerceBool(undefined, false)).toBe(false)
    expect(coerceBool('yes', true)).toBe(true)
  })
})
