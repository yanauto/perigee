import { describe, expect, it } from 'vitest'
import {
  extractCommand,
  summarizeFsWrite,
  summarizePermissionRequest
} from './permission-summary.js'

/** 截图同源：bash 统计 LOC 的 request_permission 形态 */
const shellParams = {
  sessionId: '019fca3f-024d-7df3-9017-ae00b9a50720',
  toolCall: {
    toolCallId: 'call-5040aef2-4271-422a-a9a4-3da83ffa45bc-18',
    kind: 'execute',
    title: 'Execute `wc -l packages/*/src/**/*.{ts,tsx}`',
    rawInput: {
      variant: 'Bash',
      command: 'wc -l packages/*/src/**/*.{ts,tsx} 2>/dev/null; echo "---"'
    },
    description: 'Count LOC and files per package'
  },
  options: [
    { optionId: 'allow-once', name: 'Yes, proceed', kind: 'allow_once' },
    { optionId: 'reject-once', name: 'No', kind: 'reject_once' }
  ]
}

describe('extractCommand', () => {
  it('优先 rawInput.command', () => {
    expect(
      extractCommand({ variant: 'Bash', command: 'ls -la' }, 'Execute `other`')
    ).toBe('ls -la')
  })

  it('title 反引号兜底', () => {
    expect(extractCommand({}, 'Execute `echo hi`')).toBe('echo hi')
  })

  it('字符串 rawInput', () => {
    expect(extractCommand('pwd', '')).toBe('pwd')
  })
})

describe('summarizePermissionRequest', () => {
  it('shell：短标题 + 命令正文，不含 sessionId/options JSON', () => {
    const s = summarizePermissionRequest(shellParams)
    expect(s.action).toBe('执行命令')
    expect(s.detail).toBe('wc -l packages/*/src/**/*.{ts,tsx} 2>/dev/null; echo "---"')
    expect(s.detail).not.toMatch(/sessionId|optionId|toolCallId/)
    expect(s.kind).toMatch(/execute/i)
    expect(s.toolName.length).toBeGreaterThan(0)
  })

  it('写文件：路径为正文', () => {
    const s = summarizePermissionRequest({
      toolCall: {
        kind: 'edit',
        title: 'Write src/a.ts',
        rawInput: { path: 'src/a.ts', content: 'x' }
      }
    })
    expect(s.action).toBe('写入文件')
    expect(s.detail).toContain('src/a.ts')
    expect(s.detail).not.toMatch(/\{/)
  })

  it('读文件', () => {
    const s = summarizePermissionRequest({
      toolName: 'read_file',
      toolCall: { kind: 'read', rawInput: { path: 'README.md' } }
    })
    expect(s.action).toBe('读取文件')
    expect(s.detail).toContain('README.md')
  })

  it('未知工具不 dump 整包 params', () => {
    const s = summarizePermissionRequest({
      toolCall: { title: 'Do something weird', kind: 'other' },
      sessionId: 'should-not-appear',
      options: [{ optionId: 'allow-once' }]
    })
    expect(s.action).toBe('操作审批')
    expect(s.detail).toBe('Do something weird')
    expect(s.detail).not.toMatch(/sessionId|optionId|should-not-appear/)
  })
})

describe('summarizeFsWrite', () => {
  it('路径 + 体积', () => {
    const s = summarizeFsWrite('/tmp/x.ts', 2048)
    expect(s.action).toBe('写入文件')
    expect(s.detail).toMatch(/\/tmp\/x\.ts/)
    expect(s.detail).toMatch(/2\.0 KB/)
    expect(s.paths).toEqual(['/tmp/x.ts'])
  })
})
