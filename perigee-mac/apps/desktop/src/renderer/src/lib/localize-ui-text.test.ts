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

  it('EN：侧栏审批预览与用户前缀', () => {
    expect(localizeUiText('等待审批 · write', 'en')).toBe('Waiting for approval · write')
    expect(localizeUiText('你：hello', 'en')).toBe('You: hello')
  })

  it('EN：Stub 回声整段', () => {
    const zh = '本地回声 · 未连接 Grok。\n\n你说：hi\n\n请安装并登录本机 Grok CLI 后，才能发真消息。'
    expect(localizeUiText(zh, 'en')).toBe(
      'Local echo · Grok is not connected.\n\nYou said: hi\n\nInstall and sign in to the local Grok CLI to send real messages.'
    )
  })

  it('EN：跨会话投递失败前缀', () => {
    expect(localizeUiText('跨会话投递失败：target_offline', 'en')).toBe(
      'Cross-session send failed: target_offline'
    )
  })
})
