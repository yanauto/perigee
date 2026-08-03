/**
 * ADR 0011 · Grok CLI 配置单源。
 * - MCP：优先 `grok mcp list --json` / enable / disable（兼容 CLI，少碰文件）
 * - permission_mode / 模型提示：读 `~/.grok/config.toml`（只改 ask↔always-approve 时再写）
 * - **禁止** 把 Desktop settings.json 当 agent 配置真相源
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import {
  grokHome as protocolGrokHome,
  resolveGrokBinary as protocolResolveGrokBinary
} from '@perigee/engine-protocol'

export type CliPermissionMode =
  | 'ask'
  | 'auto'
  | 'always-approve'
  | 'default'
  | string

export type GrokMcpServerEntry = {
  name: string
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  scope?: string
  raw?: Record<string, unknown>
}

export type GrokConfigSnapshot = {
  path: string
  exists: boolean
  permissionMode: CliPermissionMode
  /** [ui] fork_secondary_model 等 */
  forkSecondaryModel?: string
  mcpServers: GrokMcpServerEntry[]
  /** 读源：cli-json | toml | empty */
  mcpSource: 'cli-json' | 'toml' | 'empty'
  error?: string
}

export type DesktopPermissionPolicy = 'ask' | 'accept_edits' | 'plan' | 'yolo'

const BAK_KEEP = 8

/** 与 engine-protocol 单源一致 */
export function grokHome(): string {
  return protocolGrokHome()
}

export function userConfigPath(home = grokHome()): string {
  return join(home, 'config.toml')
}

/** 与 engine-protocol 单源一致（CLI 配置读写、validate 共用） */
export function resolveGrokBinary(): string {
  return protocolResolveGrokBinary()
}

/**
 * 校验用户配置的 grok 可执行路径，防止 settings 任意路径 spawn（审计 Z5-02）。
 * 空字符串 → 使用默认 resolveGrokBinary()。
 * 允许：~/.grok/bin、（非 win）Homebrew/usr/local、PATH 字面量 grok/grok.exe、GROK_BINARY。
 */
export function validateGrokBinary(
  bin: string | undefined | null
): { ok: true; path: string } | { ok: false; reason: string } {
  const raw = (bin ?? '').trim()
  if (!raw || raw === 'grok' || raw === 'grok.exe') {
    return {
      ok: true,
      path: raw === 'grok' || raw === 'grok.exe' ? raw : resolveGrokBinary()
    }
  }
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(raw)
  const base = basename(abs)
  if (base !== 'grok' && base !== 'grok.exe') {
    return { ok: false, reason: `可执行文件名必须为 grok，收到: ${base}` }
  }
  const allowedRoots = [join(grokHome(), 'bin')]
  if (process.platform !== 'win32') {
    allowedRoots.push('/opt/homebrew/bin', '/usr/local/bin')
  }
  const envBin = process.env.GROK_BINARY?.trim()
  if (envBin && (abs === resolve(envBin) || raw === envBin)) {
    return { ok: true, path: abs }
  }
  for (const root of allowedRoots) {
    try {
      const rootAbs = resolve(root)
      if (abs === rootAbs) return { ok: true, path: abs }
      const rel = relative(rootAbs, abs)
      if (rel && !rel.startsWith('..') && !rel.split(sep).includes('..') && !isAbsolute(rel)) {
        return { ok: true, path: abs }
      }
    } catch {
      /* */
    }
  }
  return {
    ok: false,
    reason: `grokBinary 不在允许根（~/.grok/bin${process.platform === 'win32' ? '' : '、Homebrew、/usr/local/bin'}）: ${raw}`
  }
}

/** CLI permission_mode → Desktop 展示用四态（auto 暂映射 ask 展示 + 保留 raw） */
export function cliPermissionToDesktop(
  mode: CliPermissionMode | undefined
): { policy: DesktopPermissionPolicy; cliRaw: string; sessionOnlyNote?: string } {
  const raw = (mode ?? 'ask').toString()
  if (raw === 'always-approve' || raw === 'bypass' || raw === 'yolo') {
    return { policy: 'yolo', cliRaw: raw }
  }
  if (raw === 'auto') {
    return {
      policy: 'ask',
      cliRaw: 'auto',
      sessionOnlyNote: 'CLI permission_mode=auto（非 CCD Auto）；Desktop 按偏安全展示，不静默改写'
    }
  }
  if (raw === 'plan') {
    return { policy: 'plan', cliRaw: raw }
  }
  if (raw === 'acceptEdits' || raw === 'accept_edits') {
    return { policy: 'accept_edits', cliRaw: raw }
  }
  return { policy: 'ask', cliRaw: raw || 'ask' }
}

/** 仅允许写回 CLI 的持久权限 */
export function desktopPermissionToCliWrite(
  policy: DesktopPermissionPolicy
): { mode: 'ask' | 'always-approve' } | { sessionOnly: true; modeId: string } {
  if (policy === 'yolo') return { mode: 'always-approve' }
  if (policy === 'ask') return { mode: 'ask' }
  if (policy === 'plan') return { sessionOnly: true, modeId: 'plan' }
  return { sessionOnly: true, modeId: 'default' } // accept_edits
}

function runGrokMcpJson(args: string[], timeoutMs = 15_000): unknown {
  const bin = resolveGrokBinary()
  const out = execFileSync(bin, ['mcp', ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, HOME: process.env.HOME },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return JSON.parse(out)
}

export function listMcpViaCli(): GrokMcpServerEntry[] | null {
  try {
    const raw = runGrokMcpJson(['list', '--json'])
    if (!Array.isArray(raw)) return null
    return raw.map((row) => {
      const r = row as Record<string, unknown>
      return {
        name: String(r.name ?? ''),
        enabled: r.enabled !== false,
        command: r.command != null ? String(r.command) : undefined,
        args: Array.isArray(r.args) ? r.args.map(String) : undefined,
        url: r.url != null ? String(r.url) : undefined,
        scope: r.scope != null ? String(r.scope) : undefined,
        raw: r
      }
    }).filter((s) => s.name)
  } catch {
    return null
  }
}

export type GrokModelEntry = {
  id: string
  isDefault?: boolean
}

/**
 * 解析 `grok models` 文本输出（CLI 暂无 --json）。
 * 样例：
 *   Default model: grok-4.5
 *   Available models:
 *     * grok-4.5 (default)
 */
export function parseGrokModelsText(text: string): {
  defaultModel?: string
  models: GrokModelEntry[]
} {
  const models: GrokModelEntry[] = []
  let defaultModel: string | undefined
  const defLine = text.match(/Default model:\s*(\S+)/i)
  if (defLine) defaultModel = defLine[1]

  for (const line of text.split('\n')) {
    const m =
      line.match(/^\s*\*\s+(\S+)(?:\s+\(default\))?/i) ||
      line.match(/^\s*[-•]\s+(\S+)/)
    if (!m?.[1]) continue
    const id = m[1].replace(/,$/, '')
    if (!id || /available|models|default/i.test(id)) continue
    const isDefault = /\(default\)/i.test(line) || id === defaultModel
    if (!models.some((x) => x.id === id)) {
      models.push({ id, isDefault })
    }
  }
  if (defaultModel && !models.some((x) => x.id === defaultModel)) {
    models.unshift({ id: defaultModel, isDefault: true })
  }
  return { defaultModel, models }
}

export function listModelsViaCli(): {
  defaultModel?: string
  models: GrokModelEntry[]
  detail: string
} | null {
  try {
    const bin = resolveGrokBinary()
    const out = execFileSync(bin, ['models'], {
      encoding: 'utf8',
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const parsed = parseGrokModelsText(out)
    return {
      ...parsed,
      detail: parsed.models.length
        ? `grok models · ${parsed.models.length} 个`
        : 'grok models 无解析到条目'
    }
  } catch (e) {
    return null
  }
}

/** 从 toml 文本解析 mcp_servers 与 ui（不写盘） */
export function parseConfigToml(text: string): {
  permissionMode: CliPermissionMode
  forkSecondaryModel?: string
  mcpServers: GrokMcpServerEntry[]
} {
  const data = parseToml(text) as Record<string, unknown>
  const ui = (data.ui && typeof data.ui === 'object' ? data.ui : {}) as Record<string, unknown>
  const permissionMode = String(ui.permission_mode ?? ui.permissionMode ?? 'ask')
  const forkSecondaryModel =
    ui.fork_secondary_model != null
      ? String(ui.fork_secondary_model)
      : ui.forkSecondaryModel != null
        ? String(ui.forkSecondaryModel)
        : undefined

  const mcpRoot = data.mcp_servers
  const mcpServers: GrokMcpServerEntry[] = []
  if (mcpRoot && typeof mcpRoot === 'object' && !Array.isArray(mcpRoot)) {
    for (const [name, val] of Object.entries(mcpRoot as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue
      const v = val as Record<string, unknown>
      mcpServers.push({
        name,
        enabled: v.enabled !== false,
        command: v.command != null ? String(v.command) : undefined,
        args: Array.isArray(v.args) ? v.args.map(String) : undefined,
        env:
          v.env && typeof v.env === 'object' && !Array.isArray(v.env)
            ? Object.fromEntries(
                Object.entries(v.env as Record<string, unknown>).map(([k, x]) => [k, String(x)])
              )
            : undefined,
        url: v.url != null ? String(v.url) : undefined,
        headers:
          v.headers && typeof v.headers === 'object' && !Array.isArray(v.headers)
            ? Object.fromEntries(
                Object.entries(v.headers as Record<string, unknown>).map(([k, x]) => [
                  k,
                  String(x)
                ])
              )
            : undefined,
        raw: v
      })
    }
  }
  return { permissionMode, forkSecondaryModel, mcpServers }
}

export function loadGrokConfigSnapshot(opts?: {
  configPath?: string
  preferCliList?: boolean
}): GrokConfigSnapshot {
  const path = opts?.configPath ?? userConfigPath()
  const preferCli = opts?.preferCliList !== false

  let permissionMode: CliPermissionMode = 'ask'
  let forkSecondaryModel: string | undefined
  let mcpServers: GrokMcpServerEntry[] = []
  let mcpSource: GrokConfigSnapshot['mcpSource'] = 'empty'
  let error: string | undefined
  const exists = existsSync(path)

  if (exists) {
    try {
      const text = readFileSync(path, 'utf8')
      const parsed = parseConfigToml(text)
      permissionMode = parsed.permissionMode
      forkSecondaryModel = parsed.forkSecondaryModel
      mcpServers = parsed.mcpServers
      mcpSource = 'toml'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  if (preferCli) {
    const cliList = listMcpViaCli()
    if (cliList && cliList.length >= 0) {
      // CLI list 是权威 MCP 视图（含 scope）；空数组也算成功
      mcpServers = cliList
      mcpSource = 'cli-json'
    }
  }

  return {
    path,
    exists,
    permissionMode,
    forkSecondaryModel,
    mcpServers,
    mcpSource,
    error
  }
}

/** 启用项 → ACP session/new.mcpServers */
export function toAcpMcpServers(
  servers: GrokMcpServerEntry[],
  enabledOnly = true
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const s of servers) {
    if (enabledOnly && !s.enabled) continue
    if (!s.name) continue
    if (s.url) {
      out.push({
        type: 'http',
        name: s.name,
        url: s.url,
        headers: s.headers
          ? Object.entries(s.headers).map(([name, value]) => ({ name, value }))
          : []
      })
      continue
    }
    if (!s.command) continue
    out.push({
      type: 'stdio',
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      env: s.env
        ? Object.entries(s.env).map(([name, value]) => ({ name, value }))
        : []
    })
  }
  return out
}

export type ConfigWriteResult =
  | { ok: true; detail: string; bakPath?: string }
  | { ok: false; detail: string; reason: string; bakPath?: string }

function backupConfig(configPath: string): string {
  const dir = dirname(configPath)
  mkdirSync(dir, { recursive: true })
  const bak = `${configPath}.bak.${Date.now()}`
  copyFileSync(configPath, bak)
  // prune old
  try {
    const base = configPath.split('/').pop()!
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(base + '.bak.'))
      .sort()
    while (files.length > BAK_KEEP) {
      const f = files.shift()
      if (f) unlinkSync(join(dir, f))
    }
  } catch {
    /* ignore prune */
  }
  return bak
}

/**
 * 经 CLI 启停 MCP（首选，最兼容）。
 * 在测试中可注入 exec。
 */
export function setMcpEnabledViaCli(
  name: string,
  enabled: boolean,
  exec: typeof execFileSync = execFileSync
): ConfigWriteResult {
  const bin = resolveGrokBinary()
  try {
    exec(bin, ['mcp', enabled ? 'enable' : 'disable', name], {
      encoding: 'utf8',
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return {
      ok: true,
      detail: `grok mcp ${enabled ? 'enable' : 'disable'} ${name}`
    }
  } catch (e) {
    const msg =
      e && typeof e === 'object' && 'stderr' in e
        ? String((e as { stderr?: Buffer | string }).stderr ?? '')
        : e instanceof Error
          ? e.message
          : String(e)
    return { ok: false, reason: 'cli_failed', detail: msg.slice(0, 500) || 'grok mcp failed' }
  }
}

/**
 * 文件补丁写 enabled（CLI 不可用时的 fallback）。
 * expectedMtimeMs：调用方读配置时的 mtime，不一致则拒写。
 */
export function setMcpEnabledViaToml(
  name: string,
  enabled: boolean,
  opts?: { configPath?: string; expectedMtimeMs?: number }
): ConfigWriteResult {
  const configPath = opts?.configPath ?? userConfigPath()
  if (!existsSync(configPath)) {
    return { ok: false, reason: 'missing_config', detail: `无文件 ${configPath}` }
  }
  const st = statSync(configPath)
  if (
    opts?.expectedMtimeMs != null &&
    Math.abs(st.mtimeMs - opts.expectedMtimeMs) > 1
  ) {
    return {
      ok: false,
      reason: 'mtime_conflict',
      detail: 'config.toml 已在外部修改，已中止写入以免覆盖'
    }
  }

  let bakPath: string | undefined
  try {
    bakPath = backupConfig(configPath)
    const text = readFileSync(configPath, 'utf8')
    const data = parseToml(text) as Record<string, unknown>
    const root = data.mcp_servers
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      return { ok: false, reason: 'no_mcp_section', detail: '无 mcp_servers 段', bakPath }
    }
    const map = root as Record<string, unknown>
    const cur = map[name]
    if (!cur || typeof cur !== 'object') {
      return { ok: false, reason: 'unknown_server', detail: `无服务器 ${name}`, bakPath }
    }
    ;(cur as Record<string, unknown>).enabled = enabled
    const out = stringifyToml(data)
    const tmp = configPath + '.tmp'
    writeFileSync(tmp, out, 'utf8')
    // 校验
    parseToml(readFileSync(tmp, 'utf8'))
    renameSync(tmp, configPath)
    return {
      ok: true,
      detail: `toml patched mcp_servers.${name}.enabled=${enabled}`,
      bakPath
    }
  } catch (e) {
    if (bakPath && existsSync(bakPath)) {
      try {
        copyFileSync(bakPath, configPath)
      } catch {
        /* */
      }
    }
    return {
      ok: false,
      reason: 'write_failed',
      detail: e instanceof Error ? e.message : String(e),
      bakPath
    }
  }
}

export function setMcpEnabled(
  name: string,
  enabled: boolean,
  opts?: { configPath?: string; expectedMtimeMs?: number; forceToml?: boolean }
): ConfigWriteResult {
  if (!opts?.forceToml) {
    const viaCli = setMcpEnabledViaCli(name, enabled)
    if (viaCli.ok) return viaCli
    // fall through to toml with note
    const viaToml = setMcpEnabledViaToml(name, enabled, opts)
    if (viaToml.ok) {
      return {
        ok: true,
        detail: `CLI 失败后 toml 成功：${viaToml.detail}（CLI: ${viaCli.detail}）`,
        bakPath: viaToml.bakPath
      }
    }
    return {
      ok: false,
      reason: 'both_failed',
      detail: `CLI: ${viaCli.detail}; toml: ${viaToml.detail}`
    }
  }
  return setMcpEnabledViaToml(name, enabled, opts)
}

/** 写 [ui].permission_mode = ask | always-approve */
export function setPermissionModeInToml(
  mode: 'ask' | 'always-approve',
  opts?: { configPath?: string; expectedMtimeMs?: number }
): ConfigWriteResult {
  const configPath = opts?.configPath ?? userConfigPath()
  if (!existsSync(configPath)) {
    return { ok: false, reason: 'missing_config', detail: `无文件 ${configPath}` }
  }
  const st = statSync(configPath)
  if (
    opts?.expectedMtimeMs != null &&
    Math.abs(st.mtimeMs - opts.expectedMtimeMs) > 1
  ) {
    return {
      ok: false,
      reason: 'mtime_conflict',
      detail: 'config.toml 已在外部修改，已中止写入'
    }
  }
  let bakPath: string | undefined
  try {
    bakPath = backupConfig(configPath)
    const data = parseToml(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    if (!data.ui || typeof data.ui !== 'object') data.ui = {}
    const ui = data.ui as Record<string, unknown>
    ui.permission_mode = mode
    // 与 always-approve 同步 yolo 兼容键（CLI 文档）
    if (mode === 'always-approve') ui.yolo = true
    else if (ui.yolo === true) ui.yolo = false
    const tmp = configPath + '.tmp'
    writeFileSync(tmp, stringifyToml(data), 'utf8')
    parseToml(readFileSync(tmp, 'utf8'))
    renameSync(tmp, configPath)
    return { ok: true, detail: `ui.permission_mode=${mode}`, bakPath }
  } catch (e) {
    if (bakPath && existsSync(bakPath)) {
      try {
        copyFileSync(bakPath, configPath)
      } catch {
        /* */
      }
    }
    return {
      ok: false,
      reason: 'write_failed',
      detail: e instanceof Error ? e.message : String(e),
      bakPath
    }
  }
}

export function configMtimeMs(configPath = userConfigPath()): number | null {
  try {
    if (!existsSync(configPath)) return null
    return statSync(configPath).mtimeMs
  } catch {
    return null
  }
}
