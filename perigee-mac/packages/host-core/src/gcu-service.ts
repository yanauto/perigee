/**
 * Flyby Host 侧保障（ADR 0010）。
 * - 解析 gcu-bridge 可执行路径（MCP 注入用）
 * - 探测 bridge HTTP + extension_connected
 * 不在此重写浏览器控制引擎。
 * 注：文件名与 `gcu*` 标识符是历史名，绑定外部注册名（MCP `grok-computer-use` / 可执行 `gcu-bridge`），随对方改名再一并动。
 */
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type GcuProbe = {
  ok: boolean
  /** bridge HTTP 通 */
  bridgeUp: boolean
  /** 扩展已连上 bridge */
  extensionConnected: boolean
  version?: string
  detail: string
  bridgeUrl: string
  mcpCommand?: string
  mcpCommandResolved: boolean
  hint?: string
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:19527'

/** 常见 gcu-bridge 安装位置（维护者本机 + 相对仓） */
export function candidateGcuBridgePaths(): string[] {
  const home = homedir()
  const siblings = [
    join(home, 'workspace/myself/projects/grok-computer-use/bridge/.venv/bin/gcu-bridge'),
    join(home, 'workspace/myself/projects/grok-computer-use/bridge/.venv/bin/python')
  ]
  return [
    process.env.GCU_BRIDGE_BIN,
    join(home, '.local/bin/gcu-bridge'),
    '/opt/homebrew/bin/gcu-bridge',
    '/usr/local/bin/gcu-bridge',
    ...siblings,
    // ~/.grok/config.toml 里常见绝对路径由 readGrokConfigMcpCommand 补
  ].filter(Boolean) as string[]
}

/** 从 ~/.grok/config.toml 抠 mcp_servers.grok-computer-use.command */
export function readGrokConfigMcpCommand(
  configPath = join(homedir(), '.grok/config.toml')
): string | null {
  try {
    if (!existsSync(configPath)) return null
    const text = readFileSync(configPath, 'utf8')
    // 简单块扫描，不引入 toml 依赖
    const idx = text.search(/\[mcp_servers\.grok-computer-use\]/)
    if (idx < 0) return null
    const slice = text.slice(idx, idx + 800)
    const m = slice.match(/command\s*=\s*"([^"]+)"/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    try {
      accessSync(p, constants.F_OK)
      return true
    } catch {
      return false
    }
  }
}

/**
 * 解析 MCP 用的 bridge 命令。
 * settingsCommand 可为 `gcu-bridge` 裸名或绝对路径。
 */
export function resolveGcuBridgeCommand(settingsCommand?: string | null): {
  command: string
  resolved: boolean
  source: string
} {
  const raw = (settingsCommand ?? '').trim()
  if (raw && raw !== 'gcu-bridge' && (raw.startsWith('/') || raw.includes('/'))) {
    if (isExecutable(raw)) {
      return { command: raw, resolved: true, source: 'settings' }
    }
  }

  const fromToml = readGrokConfigMcpCommand()
  if (fromToml && isExecutable(fromToml)) {
    return { command: fromToml, resolved: true, source: 'grok-config' }
  }

  for (const c of candidateGcuBridgePaths()) {
    if (c.endsWith('python')) continue
    if (isExecutable(c)) {
      return { command: c, resolved: true, source: 'candidates' }
    }
  }

  // 裸名留给 PATH（可能 launchd / uv tool）
  if (raw) return { command: raw, resolved: false, source: 'settings-bare' }
  return { command: 'gcu-bridge', resolved: false, source: 'default-bare' }
}

/**
 * 将 settings.mcp.servers 中 Flyby 项的 command 解析为绝对路径（便于 session/new）。
 */
export type McpServerLike = {
  name: string
  command: string
  enabled: boolean
  args?: string[]
  url?: string
  type?: 'stdio' | 'http' | 'sse'
}

export function resolveMcpServersForAcp<T extends McpServerLike>(servers: T[]): T[] {
  return servers.map((s) => {
    if (!s.enabled) return s
    const isGcu =
      s.name === 'grok-computer-use' ||
      s.name === 'gcu' ||
      /gcu-bridge|computer-use/i.test(s.command)
    if (!isGcu || s.url) return s
    const r = resolveGcuBridgeCommand(s.command)
    return { ...s, command: r.command }
  })
}

/** HTTP 探测 bridge（公开 /v1/ping） */
export async function probeGcu(
  bridgeUrl = DEFAULT_BRIDGE_URL,
  settingsMcpCommand?: string
): Promise<GcuProbe> {
  const url = (bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/$/, '')
  const resolved = resolveGcuBridgeCommand(settingsMcpCommand)
  let bridgeUp = false
  let extensionConnected = false
  let version: string | undefined
  let detail = '未探测'

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${url}/v1/ping`, { signal: ctrl.signal })
    clearTimeout(t)
    const body = await res.text()
    if (!res.ok) {
      detail = `HTTP ${res.status}: ${body.slice(0, 120)}`
    } else {
      bridgeUp = true
      try {
        const j = JSON.parse(body) as {
          ok?: boolean
          version?: string
          extension_connected?: boolean
          service?: string
        }
        extensionConnected = j.extension_connected === true
        version = j.version
        detail = extensionConnected
          ? `bridge v${version ?? '?'} · 扩展已连接`
          : `bridge v${version ?? '?'} · 扩展未连接（加载 extension 目录）`
      } catch {
        detail = body.slice(0, 160)
        extensionConnected = /extension_connected["\s:]+true/i.test(body)
      }
    }
  } catch (e) {
    detail =
      e instanceof Error
        ? e.name === 'AbortError'
          ? '探测超时（bridge 未起？）'
          : e.message
        : String(e)
  }

  const ok = bridgeUp && extensionConnected
  const hint = !bridgeUp
    ? '确认 launchctl com.yanauto.gcu-bridge 或 gcu-bridge 守护在跑'
    : !extensionConnected
      ? 'Chrome → 扩展 → 加载 grok-computer-use/extension'
      : !resolved.resolved
        ? `MCP 命令未解析到绝对路径（当前 ${resolved.command}）；建议与 ~/.grok/config.toml 对齐`
        : undefined

  return {
    ok,
    bridgeUp,
    extensionConnected,
    version,
    detail,
    bridgeUrl: url,
    mcpCommand: resolved.command,
    mcpCommandResolved: resolved.resolved,
    hint
  }
}
