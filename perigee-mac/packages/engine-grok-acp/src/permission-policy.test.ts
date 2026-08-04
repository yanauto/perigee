import { describe, expect, it } from 'vitest'
import {
  allowsSilentClientWrite,
  autoApprovesToolPermission,
  buildAcpMcpServers,
  buildAcpStdioArgs,
  classifyToolPermission,
  deniesClientWrite,
  isDangerousShell,
  normalizePermissionPolicy,
  pickDenyOptionId,
  policyToAcpModeId,
  splitCommandLine
} from './permission-policy.js'

describe('normalizePermissionPolicy', () => {
  it('归一常见别名', () => {
    expect(normalizePermissionPolicy('ask')).toBe('ask')
    expect(normalizePermissionPolicy('acceptEdits')).toBe('accept_edits')
    expect(normalizePermissionPolicy('accept_edits')).toBe('accept_edits')
    expect(normalizePermissionPolicy('plan')).toBe('plan')
    expect(normalizePermissionPolicy('yolo')).toBe('yolo')
    expect(normalizePermissionPolicy('bypass')).toBe('yolo')
    expect(normalizePermissionPolicy('nope')).toBe('ask')
  })
})

describe('client write matrix', () => {
  it('ask 不静默写；plan 硬拒；accept/yolo 可写', () => {
    expect(allowsSilentClientWrite('ask')).toBe(false)
    expect(allowsSilentClientWrite('plan')).toBe(false)
    expect(allowsSilentClientWrite('accept_edits')).toBe(true)
    expect(allowsSilentClientWrite('yolo')).toBe(true)
    expect(deniesClientWrite('plan')).toBe(true)
    expect(deniesClientWrite('ask')).toBe(false)
  })

  it('auto-approve tools 仅 yolo', () => {
    expect(autoApprovesToolPermission('yolo')).toBe(true)
    expect(autoApprovesToolPermission('accept_edits')).toBe(false)
    expect(autoApprovesToolPermission('ask')).toBe(false)
    expect(autoApprovesToolPermission('plan')).toBe(false)
  })
})

describe('policyToAcpModeId', () => {
  it('映射 plan/ask/default', () => {
    expect(policyToAcpModeId('plan')).toBe('plan')
    expect(policyToAcpModeId('ask')).toBe('ask')
    expect(policyToAcpModeId('accept_edits')).toBe('default')
    expect(policyToAcpModeId('yolo')).toBe('default')
  })
})

describe('§12.2b classifyToolPermission', () => {
  it('yolo 全 allow', () => {
    expect(classifyToolPermission('yolo', { toolName: 'rm -rf /' })).toBe('allow')
  })

  it('ask 全 pending', () => {
    expect(classifyToolPermission('ask', { toolName: 'read_file' })).toBe('pending')
  })

  it('accept_edits：源码写 allow，危险 shell pending，只读 allow', () => {
    expect(
      classifyToolPermission('accept_edits', { toolName: 'write_file', paths: ['a.ts'] })
    ).toBe('allow')
    expect(
      classifyToolPermission('accept_edits', {
        toolName: 'bash',
        detail: 'rm -rf node_modules'
      })
    ).toBe('pending')
    expect(
      classifyToolPermission('accept_edits', {
        toolName: 'bash',
        detail: 'mkdir -p src/lib'
      })
    ).toBe('allow')
    expect(classifyToolPermission('accept_edits', { toolName: 'read_file' })).toBe('allow')
    expect(
      classifyToolPermission('accept_edits', {
        toolName: 'bash',
        detail: 'npm install foo'
      })
    ).toBe('pending')
  })

  it('plan：写 deny，危险 deny，只读 allow', () => {
    expect(classifyToolPermission('plan', { toolName: 'write_file' })).toBe('deny')
    expect(
      classifyToolPermission('plan', { toolName: 'bash', detail: 'rm -rf dist' })
    ).toBe('deny')
    expect(classifyToolPermission('plan', { toolName: 'read_file' })).toBe('allow')
    expect(
      classifyToolPermission('plan', { toolName: 'bash', detail: 'mkdir foo' })
    ).toBe('deny')
  })

  it('Flyby：accept_edits 动作 pending；只读 allow；plan 动作 deny；yolo allow', () => {
    expect(
      classifyToolPermission('accept_edits', { toolName: 'tabs_open' })
    ).toBe('pending')
    expect(
      classifyToolPermission('accept_edits', { toolName: 'browser_status' })
    ).toBe('allow')
    expect(classifyToolPermission('plan', { toolName: 'page_click' })).toBe('deny')
    expect(classifyToolPermission('plan', { toolName: 'browser_status' })).toBe('allow')
    expect(classifyToolPermission('yolo', { toolName: 'tabs_open' })).toBe('allow')
    expect(classifyToolPermission('ask', { toolName: 'tabs_open' })).toBe('pending')
  })

  it('危险 shell 启发式', () => {
    expect(isDangerousShell('rm -rf /tmp/x')).toBe(true)
    expect(isDangerousShell('git push --force origin main')).toBe(true)
    expect(isDangerousShell('mkdir -p a')).toBe(false)
  })
})

describe('pickDenyOptionId', () => {
  it('优先 reject_once', () => {
    expect(
      pickDenyOptionId([
        { optionId: 'allow-once', kind: 'allow_once' },
        { optionId: 'reject-once', kind: 'reject_once' }
      ])
    ).toBe('reject-once')
  })
})

describe('buildAcpStdioArgs', () => {
  it('含 --no-auto-update 且在 agent stdio 前', () => {
    const args = buildAcpStdioArgs()
    expect(args[0]).toBe('--no-auto-update')
    expect(args).toContain('agent')
    expect(args).toContain('stdio')
    expect(args.indexOf('--no-auto-update')).toBeLessThan(args.indexOf('agent'))
  })
})

describe('buildAcpMcpServers', () => {
  it('只注入 enabled；切分 command', () => {
    const servers = buildAcpMcpServers([
      { name: 'off', command: 'x', enabled: false },
      { name: 'gcu', command: 'npx -y foo-mcp', enabled: true },
      {
        name: 'http1',
        command: '',
        enabled: true,
        type: 'http',
        url: 'https://example.com/mcp'
      }
    ])
    expect(servers).toHaveLength(2)
    expect(servers[0]).toMatchObject({
      type: 'stdio',
      name: 'gcu',
      command: 'npx',
      args: ['-y', 'foo-mcp']
    })
    expect(servers[1]).toMatchObject({
      type: 'http',
      name: 'http1',
      url: 'https://example.com/mcp'
    })
  })

  it('splitCommandLine 支持引号', () => {
    expect(splitCommandLine(`echo "hello world" x`)).toEqual(['echo', 'hello world', 'x'])
  })
})
