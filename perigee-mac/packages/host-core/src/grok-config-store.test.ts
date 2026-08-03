import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  copyFileSync
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  parseConfigToml,
  toAcpMcpServers,
  cliPermissionToDesktop,
  desktopPermissionToCliWrite,
  setMcpEnabledViaToml,
  setPermissionModeInToml,
  loadGrokConfigSnapshot,
  parseGrokModelsText
} from './grok-config-store.js'

const fixDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/grok-config')

describe('parseConfigToml / toAcpMcpServers', () => {
  it('解析 full-sample 夹具', () => {
    const text = readFileSync(join(fixDir, 'full-sample.toml'), 'utf8')
    const p = parseConfigToml(text)
    expect(p.permissionMode).toBe('ask')
    expect(p.forkSecondaryModel).toBe('grok-4.5')
    expect(p.mcpServers.find((s) => s.name === 'grok-computer-use')?.enabled).toBe(true)
    expect(p.mcpServers.find((s) => s.name === 'disabled-srv')?.enabled).toBe(false)
    const acp = toAcpMcpServers(p.mcpServers, true)
    expect(acp.some((x) => x.name === 'grok-computer-use')).toBe(true)
    expect(acp.some((x) => x.name === 'disabled-srv')).toBe(false)
    expect(acp.some((x) => x.name === 'http-demo' && x.type === 'http')).toBe(true)
  })

  it('minimal 夹具', () => {
    const p = parseConfigToml(readFileSync(join(fixDir, 'minimal.toml'), 'utf8'))
    expect(toAcpMcpServers(p.mcpServers)).toHaveLength(1)
  })
})

describe('parseGrokModelsText', () => {
  it('解析默认与列表', () => {
    const t = `You are logged in with grok.com.

Default model: grok-4.5

Available models:
  * grok-4.5 (default)
  * grok-code
`
    const p = parseGrokModelsText(t)
    expect(p.defaultModel).toBe('grok-4.5')
    expect(p.models.map((m) => m.id)).toContain('grok-4.5')
    expect(p.models.map((m) => m.id)).toContain('grok-code')
    expect(p.models.find((m) => m.id === 'grok-4.5')?.isDefault).toBe(true)
  })
})

describe('permission map', () => {
  it('cli → desktop', () => {
    expect(cliPermissionToDesktop('always-approve').policy).toBe('yolo')
    expect(cliPermissionToDesktop('ask').policy).toBe('ask')
    expect(cliPermissionToDesktop('auto').cliRaw).toBe('auto')
    expect(cliPermissionToDesktop('auto').sessionOnlyNote).toBeTruthy()
  })

  it('desktop → cli write 范围', () => {
    expect(desktopPermissionToCliWrite('yolo')).toEqual({ mode: 'always-approve' })
    expect(desktopPermissionToCliWrite('ask')).toEqual({ mode: 'ask' })
    expect(desktopPermissionToCliWrite('plan')).toMatchObject({ sessionOnly: true })
    expect(desktopPermissionToCliWrite('accept_edits')).toMatchObject({ sessionOnly: true })
  })
})

describe('toml write safety', () => {
  let dir: string
  let cfg: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gd-cfg-'))
    cfg = join(dir, 'config.toml')
    copyFileSync(join(fixDir, 'full-sample.toml'), cfg)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('setMcpEnabledViaToml 保留 marketplace 段', () => {
    const r = setMcpEnabledViaToml('grok-computer-use', false, { configPath: cfg })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bakPath && existsSync(r.bakPath)).toBe(true)
    const text = readFileSync(cfg, 'utf8')
    expect(text).toContain('[marketplace]')
    expect(text).toContain('[cli]')
    const p = parseConfigToml(text)
    expect(p.mcpServers.find((s) => s.name === 'grok-computer-use')?.enabled).toBe(false)
  })

  it('mtime 冲突拒写', () => {
    const r = setMcpEnabledViaToml('grok-computer-use', false, {
      configPath: cfg,
      expectedMtimeMs: 1
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('mtime_conflict')
  })

  it('setPermissionModeInToml ask→always-approve', () => {
    const r = setPermissionModeInToml('always-approve', { configPath: cfg })
    expect(r.ok).toBe(true)
    const p = parseConfigToml(readFileSync(cfg, 'utf8'))
    expect(p.permissionMode).toBe('always-approve')
  })

  it('loadGrokConfigSnapshot 可读临时路径（不强制 cli list）', () => {
    const snap = loadGrokConfigSnapshot({ configPath: cfg, preferCliList: false })
    expect(snap.exists).toBe(true)
    expect(snap.mcpServers.length).toBeGreaterThan(0)
    expect(snap.mcpSource).toBe('toml')
  })
})
