import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../lib/types'
import { lastActivityBySession, lastActivityPreview } from './session-activity.js'

const ts = '2026-08-13T00:00:00.000Z'

describe('lastActivityPreview', () => {
  it('优先最近工具名', () => {
    const blocks: ChatBlock[] = [
      { kind: 'user', id: 'u', text: '你好', ts },
      { kind: 'assistant', id: 'a', text: '好的', ts },
      { kind: 'tool', id: 't', callId: 'c', name: 'bash', args: {}, status: 'running', ts }
    ]
    expect(lastActivityPreview(blocks)).toBe('⚙ bash')
  })

  it('无工具时取助手首行并截断', () => {
    const long = 'x'.repeat(50)
    const blocks: ChatBlock[] = [
      { kind: 'user', id: 'u', text: '问', ts },
      { kind: 'assistant', id: 'a', text: `${long}\n第二行`, ts }
    ]
    expect(lastActivityPreview(blocks)).toBe(`${'x'.repeat(40)}…`)
  })

  it('只有用户消息时加「你：」前缀', () => {
    const blocks: ChatBlock[] = [{ kind: 'user', id: 'u', text: 'hello world', ts }]
    expect(lastActivityPreview(blocks)).toBe('你：hello world')
  })

  it('空块无预览', () => {
    expect(lastActivityPreview([])).toBeUndefined()
  })
})

describe('lastActivityBySession', () => {
  it('按 session 投影，跳过无预览的会话', () => {
    const m = new Map<string, ChatBlock[]>([
      ['a', [{ kind: 'user', id: 'u', text: 'hi', ts }]],
      ['b', []]
    ])
    const out = lastActivityBySession(m)
    expect(out.get('a')).toBe('你：hi')
    expect(out.has('b')).toBe(false)
  })
})
