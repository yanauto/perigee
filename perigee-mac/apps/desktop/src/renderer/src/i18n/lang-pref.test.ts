import { describe, expect, it } from 'vitest'
import { resolveLangPref } from './lang-pref.js'

describe('resolveLangPref', () => {
  it('localStorage 有值时压过陈旧 uiState（HMR / 重挂）', () => {
    expect(resolveLangPref('en', 'zh')).toEqual({
      lang: 'en',
      writeUi: 'en'
    })
  })

  it('两边一致不写回', () => {
    expect(resolveLangPref('en', 'en')).toEqual({ lang: 'en' })
  })

  it('只有 uiState：采用并镜像到 localStorage', () => {
    expect(resolveLangPref(null, 'en')).toEqual({
      lang: 'en',
      writeLs: 'en'
    })
  })

  it('都空 → 默认英文', () => {
    expect(resolveLangPref(null, undefined)).toEqual({ lang: 'en' })
  })

  it('非法值忽略', () => {
    expect(resolveLangPref('de', 'jp')).toEqual({ lang: 'en' })
  })
})
