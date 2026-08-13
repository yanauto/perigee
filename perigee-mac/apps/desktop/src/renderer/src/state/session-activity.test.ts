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

  it('pending 审批压过工具名', () => {
    const blocks: ChatBlock[] = [
      { kind: 'user', id: 'u', text: '改文件', ts },
      { kind: 'tool', id: 't', callId: 'c', name: 'write', args: {}, status: 'running', ts },
      {
        kind: 'approval',
        id: 'ap',
        requestId: 'r1',
        action: 'write',
        detail: 'src/a.ts',
        risk: 'medium',
        status: 'pending',
        ts
      }
    ]
    expect(lastActivityPreview(blocks)).toBe('等待审批 · write')
  })

  it('status=waiting_approval 且尚无审批块时仍写等待审批', () => {
    const blocks: ChatBlock[] = [{ kind: 'user', id: 'u', text: '跑一下', ts }]
    expect(lastActivityPreview(blocks, 'waiting_approval')).toBe('等待审批')
  })

  it('已解决的审批不抢预览', () => {
    const blocks: ChatBlock[] = [
      {
        kind: 'approval',
        id: 'ap',
        requestId: 'r1',
        action: 'bash',
        detail: 'ls',
        risk: 'low',
        status: 'approved',
        ts
      },
      { kind: 'assistant', id: 'a', text: '好了', ts }
    ]
    expect(lastActivityPreview(blocks)).toBe('好了')
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

  it('无 transcript 但 status=waiting_approval 仍给出预览', () => {
    const out = lastActivityBySession(new Map(), new Map([['s1', 'waiting_approval']]))
    expect(out.get('s1')).toBe('等待审批')
  })
})
