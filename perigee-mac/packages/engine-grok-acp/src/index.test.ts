import { describe, expect, it } from 'vitest'
import {
  GrokAcpEngine,
  pickAllowOptionId,
  buildAcpMcpServers,
  findPendingByUiId,
  mapPermissionKey,
  extractContentText
} from './index.js'

describe('extractContentText（mapSessionUpdate 文本抽取）', () => {
  it('string / {text} / 数组块', () => {
    expect(extractContentText('hi')).toBe('hi')
    expect(extractContentText({ text: 'yo' })).toBe('yo')
    expect(extractContentText([{ text: 'a' }, { text: 'b' }])).toBe('ab')
    expect(extractContentText(null)).toBe('')
  })
})

describe('GrokAcpEngine.setPermissionPolicy', () => {
  it('默认 ask（对齐 CCD Manual）；可热切换四态不重建实例', () => {
    const engine = new GrokAcpEngine({ binary: '/usr/bin/true' })
    expect(engine.getPermissionPolicy()).toBe('ask')
    engine.setPermissionPolicy('yolo')
    expect(engine.getPermissionPolicy()).toBe('yolo')
    engine.setPermissionPolicy('accept_edits')
    expect(engine.getPermissionPolicy()).toBe('accept_edits')
    engine.setPermissionPolicy('plan')
    expect(engine.getPermissionPolicy()).toBe('plan')
    engine.setPermissionPolicy('ask')
    expect(engine.getPermissionPolicy()).toBe('ask')
  })
})

describe('GrokAcpEngine hot paths (no live session)', () => {
  it('setModel 无会话仍记本地 model 与 hotStatus', async () => {
    const engine = new GrokAcpEngine({ binary: '/usr/bin/true' })
    const r = await engine.setModel('grok-code')
    expect(r.ok).toBe(true)
    expect(engine.getModel()).toBe('grok-code')
    expect(engine.getHotStatus().model.detail).toMatch(/grok-code|无活会话/)
  })

  it('applyMcpServers 无会话不失败', async () => {
    const engine = new GrokAcpEngine({ binary: '/usr/bin/true' })
    const r = await engine.applyMcpServers([
      { name: 't', command: 'echo hi', enabled: true }
    ])
    expect(r.ok).toBe(true)
    expect(engine.getMcpServers()).toHaveLength(1)
    const wire = buildAcpMcpServers(engine.getMcpServers())
    expect(wire[0]).toMatchObject({ name: 't', command: 'echo' })
  })
})

describe('pickAllowOptionId', () => {
  it('优先 kind=allow_once', () => {
    expect(
      pickAllowOptionId([
        { optionId: 'allow-always-mcp', kind: 'allow_always' },
        { optionId: 'allow-once', kind: 'allow_once' },
        { optionId: 'reject-once', kind: 'reject_once' }
      ])
    ).toBe('allow-once')
  })

  it('无 kind 时按 id 推断 allow+once', () => {
    expect(pickAllowOptionId([{ optionId: 'allow_always' }, { optionId: 'allow-once' }])).toBe(
      'allow-once'
    )
  })

  it('只有 allow_always 也接受', () => {
    expect(pickAllowOptionId([{ optionId: 'allow-always' }])).toBe('allow-always')
  })

  it('非数组/无 allow 返回 undefined', () => {
    expect(pickAllowOptionId(undefined)).toBeUndefined()
    expect(pickAllowOptionId([{ optionId: 'reject-once' }])).toBeUndefined()
  })
})

describe('T021 permission key 映射', () => {
  it('mapPermissionKey 兼容 number/string', () => {
    const m = new Map<string | number, { uiId: string }>()
    m.set(1, { uiId: 'apr_x' })
    expect(mapPermissionKey(m, 1)).toBe(1)
    expect(mapPermissionKey(m, '1')).toBe(1)
  })

  it('findPendingByUiId 反查 apr_*（Host 误传 uiId 时兜底）', () => {
    const m = new Map<string | number, { uiId: string }>()
    m.set(1, { uiId: 'apr_msbavl2f_9a1n613' })
    expect(findPendingByUiId(m, 'apr_msbavl2f_9a1n613')).toBe(1)
    expect(findPendingByUiId(m, 'apr_other')).toBeUndefined()
  })
})
