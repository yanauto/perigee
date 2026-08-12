import { describe, expect, it } from 'vitest'
import {
  PERIGEE_ACP_CLIENT_ID,
  PERIGEE_ACP_CLIENT_NAME,
  PERIGEE_ACP_CLIENT_VERSION,
  buildAuthenticateParams,
  buildInitializeParams,
  buildSessionNewParams,
  parseAuthMethods,
  pickAuthMethodId
} from './handshake.js'

describe('buildInitializeParams（对齐 grok 1.0 ACP / vendor pager+test-support）', () => {
  it('protocolVersion=1；fs 读写开；terminal 关（Perigee 自有 PTY，不接 ACP terminal/*）', () => {
    const p = buildInitializeParams()
    expect(p.protocolVersion).toBe(1)
    const caps = p.clientCapabilities as Record<string, unknown>
    expect(caps.fs).toEqual({ readTextFile: true, writeTextFile: true })
    expect(caps.terminal).toBe(false)
  })

  it('_meta 带 clientType/clientSource/clientVersion + nonInteractive（agent 读 meta 而非 clientInfo）', () => {
    const p = buildInitializeParams()
    const meta = p._meta as Record<string, unknown>
    expect(meta.clientType).toBe(PERIGEE_ACP_CLIENT_NAME)
    expect(meta.clientSource).toBe(PERIGEE_ACP_CLIENT_NAME)
    expect(meta.clientVersion).toBe(PERIGEE_ACP_CLIENT_VERSION)
    expect(meta.startupHints).toEqual({ nonInteractive: true })
    expect(p.clientInfo).toEqual({
      name: PERIGEE_ACP_CLIENT_NAME,
      version: PERIGEE_ACP_CLIENT_VERSION
    })
  })

  it('clientCapabilities._meta 声明无色增量 bash 输出', () => {
    const caps = buildInitializeParams().clientCapabilities as Record<string, unknown>
    const capMeta = caps._meta as Record<string, unknown>
    expect(capMeta['x.ai/incrementalBashOutput']).toBe(true)
    expect(capMeta['x.ai/bashOutputNoColor']).toBe(true)
  })

  it('可覆盖 clientVersion（GROK_CLIENT_VERSION 同源）', () => {
    const p = buildInitializeParams({ clientVersion: 'perigee/9.9.9' })
    expect((p._meta as Record<string, unknown>).clientVersion).toBe('9.9.9')
    expect((p.clientInfo as Record<string, unknown>).version).toBe('9.9.9')
  })
})

describe('parseAuthMethods / pickAuthMethodId', () => {
  it('读 authMethods + _meta.defaultAuthMethodId', () => {
    const parsed = parseAuthMethods({
      authMethods: [
        { id: 'cached_token', name: 'Cached' },
        { id: 'xai.api_key', name: 'API key' }
      ],
      _meta: { defaultAuthMethodId: 'cached_token' }
    })
    expect(parsed.methods.map((m) => m.id)).toEqual(['cached_token', 'xai.api_key'])
    expect(parsed.defaultAuthMethodId).toBe('cached_token')
  })

  it('兼容 snake_case auth_methods 与字符串 id', () => {
    const parsed = parseAuthMethods({
      auth_methods: ['cached_token', { id: 'xai.api_key' }]
    })
    expect(parsed.methods.map((m) => m.id)).toEqual(['cached_token', 'xai.api_key'])
  })

  it('优先 defaultAuthMethodId（pager：勿客户端重排 api_key vs session）', () => {
    expect(
      pickAuthMethodId(
        [{ id: 'xai.api_key' }, { id: 'cached_token' }],
        { defaultAuthMethodId: 'cached_token', hasApiKeyEnv: true }
      )
    ).toBe('cached_token')
  })

  it('无 default 时用 cached_token，即使环境有 XAI_API_KEY', () => {
    expect(
      pickAuthMethodId([{ id: 'xai.api_key' }, { id: 'cached_token' }], {
        hasApiKeyEnv: true
      })
    ).toBe('cached_token')
  })

  it('无 cached_token 且有 API key 环境 → xai.api_key（官方 headless 示例）', () => {
    expect(
      pickAuthMethodId([{ id: 'xai.api_key' }], { hasApiKeyEnv: true })
    ).toBe('xai.api_key')
  })

  it('都没有则取第一项；空列表返回 null', () => {
    expect(pickAuthMethodId([{ id: 'oidc' }])).toBe('oidc')
    expect(pickAuthMethodId([])).toBeNull()
  })
})

describe('buildAuthenticateParams / buildSessionNewParams', () => {
  it('authenticate 带 headless:true，避免 TTY 登录框', () => {
    expect(buildAuthenticateParams('cached_token')).toEqual({
      methodId: 'cached_token',
      _meta: { headless: true }
    })
  })

  it('session/new 始终带 mcpServers；可选 _meta.modelId', () => {
    expect(buildSessionNewParams({ cwd: '/ws', mcpServers: [] })).toEqual({
      cwd: '/ws',
      mcpServers: []
    })
    expect(
      buildSessionNewParams({
        cwd: '/ws',
        mcpServers: [{ name: 'x', command: 'echo' }],
        modelId: 'grok-4'
      })
    ).toEqual({
      cwd: '/ws',
      mcpServers: [{ name: 'x', command: 'echo' }],
      _meta: { modelId: 'grok-4' }
    })
  })
})

describe('client id 常量', () => {
  it('GROK_CLIENT_VERSION 形如 perigee/<semver>', () => {
    expect(PERIGEE_ACP_CLIENT_ID).toBe(`perigee/${PERIGEE_ACP_CLIENT_VERSION}`)
  })
})
