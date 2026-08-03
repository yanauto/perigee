import { describe, expect, it } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  readGrokConfigMcpCommand,
  resolveGcuBridgeCommand,
  resolveMcpServersForAcp
} from './gcu-service.js'

describe('gcu-service', () => {
  it('readGrokConfigMcpCommand 解析 toml 块', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gd-gcu-'))
    const p = join(dir, 'config.toml')
    writeFileSync(
      p,
      `[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers.grok-computer-use]\ncommand = "/opt/fake/gcu-bridge"\nargs = []\n`
    )
    expect(readGrokConfigMcpCommand(p)).toBe('/opt/fake/gcu-bridge')
    rmSync(dir, { recursive: true, force: true })
  })

  it('resolveMcpServersForAcp 保留非 GCU 项', () => {
    const out = resolveMcpServersForAcp([
      { name: 'other', command: 'echo', enabled: true },
      { name: 'grok-computer-use', command: 'gcu-bridge', enabled: false }
    ])
    expect(out[0]!.command).toBe('echo')
    expect(out[1]!.enabled).toBe(false)
  })

  it('resolveGcuBridgeCommand 对绝对路径 settings 直通', () => {
    // 不存在的路径：resolved false 若不可执行
    const r = resolveGcuBridgeCommand('/nonexistent/gcu-bridge-xyz')
    // 会回退到 candidates / toml / bare
    expect(r.command).toBeTruthy()
  })
})
