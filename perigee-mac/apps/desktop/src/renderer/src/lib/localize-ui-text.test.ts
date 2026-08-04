import { describe, expect, it } from 'vitest'
import { localizeUiText } from './localize-ui-text'

describe('localizeUiText', () => {
  it('zh 原样返回', () => {
    expect(localizeUiText('后台任务完成 · call-1', 'zh')).toBe('后台任务完成 · call-1')
  })

  it('EN：后台任务完成前缀 + taskId 后缀', () => {
    expect(localizeUiText('后台任务完成 · call-xxxx', 'en')).toBe(
      'Background task completed · call-xxxx'
    )
  })

  it('EN：精确命中 EN 表', () => {
    expect(localizeUiText('复制', 'en')).toBe('Copy')
  })

  it('EN：未知串不瞎猜', () => {
    expect(localizeUiText('完全未登记的中文串XYZ', 'en')).toBe('完全未登记的中文串XYZ')
  })
})
