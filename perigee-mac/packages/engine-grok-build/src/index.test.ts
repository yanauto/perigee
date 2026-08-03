import { describe, expect, it } from 'vitest'
import { extractDiffHints, GrokBuildEngine } from './index.js'

describe('extractDiffHints', () => {
  it('从 tool_call_update.content 抽 diff 条目', () => {
    const hints = extractDiffHints([
      { type: 'diff', path: '/ws/x.txt', oldText: '', newText: 'ok\n' },
      { type: 'content', text: '无关' }
    ])
    expect(hints).toEqual([{ path: '/ws/x.txt', before: null, after: 'ok\n' }])
  })

  it('oldText 非空 = 修改已有文件', () => {
    const hints = extractDiffHints([
      { type: 'diff', path: 'a.ts', oldText: 'const a = 1', newText: 'const a = 2' }
    ])
    expect(hints).toEqual([{ path: 'a.ts', before: 'const a = 1', after: 'const a = 2' }])
  })

  it('非数组/无 diff 条目返回空', () => {
    expect(extractDiffHints(undefined)).toEqual([])
    expect(extractDiffHints('str')).toEqual([])
    expect(extractDiffHints([{ type: 'content' }, null, { type: 'diff' }])).toEqual([])
  })
})

describe('GrokBuildEngine.startSession 幂等', () => {
  it('二次 startSession 保留 grokSessionId', async () => {
    const eng = new GrokBuildEngine({ binary: '/bin/echo' })
    await eng.startSession({ sessionId: 's1', workspacePath: '/tmp' })
    // 模拟 end 写入 resume id
    const map = (
      eng as unknown as {
        sessions: Map<string, { grokSessionId?: string; workspacePath: string }>
      }
    ).sessions
    map.get('s1')!.grokSessionId = 'cli-uuid-abc'
    await eng.startSession({ sessionId: 's1', workspacePath: '/tmp/other' })
    expect(map.get('s1')!.grokSessionId).toBe('cli-uuid-abc')
    expect(map.get('s1')!.workspacePath).toBe('/tmp/other')
  })
})
