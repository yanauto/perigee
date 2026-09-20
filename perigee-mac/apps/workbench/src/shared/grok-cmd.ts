/** workbench grok 命令包的请求/回执。包官方子命令；没有的词回人话，不造市场、不开 TUI。 */

export type GrokCmdName =
  | 'models'
  | 'mcp'
  | 'plugin'
  | 'login'
  | 'logout'
  | 'export'
  | 'worktree'
  | 'du'
  | 'subagent'
  | 'compact'
  | 'context'
  | 'workflow'
  | 'loop'
  | 'memory'

export type GrokCmdRequest = {
  args: string[]
  confirm?: boolean
}

export type GrokCmdResult = {
  ok: boolean
  code: number
  stdout: string
  stderr: string
  cwd: string
  cwdSource: 'workspace' | 'process'
  argv: string[]
  error?: string
  note?: string
}

export type LoginStatus = 'in' | 'out' | 'unknown'

export type MarketPlugin = {
  name: string
  description?: string
  marketplace?: string
  status?: string
  version?: string
}

export type GrokCmdPlan =
  | {
      kind: 'run'
      argv: string[]
      timeoutMs?: number
      needsConfirm: boolean
      confirmHint?: string
      loginDetach?: boolean
    }
  | { kind: 'error'; error: string }

const ALLOWED = new Set(['models', 'mcp', 'plugin', 'login', 'logout', 'memory'])

const MCP_SUB = new Set(['list', 'add', 'remove', 'enable', 'disable', 'doctor', 'help'])
const PLUGIN_SUB = new Set([
  'list',
  'install',
  'uninstall',
  'rm',
  'remove',
  'update',
  'enable',
  'disable',
  'details',
  'validate',
  'tag',
  'marketplace',
  'help'
])
const MARKET_SUB = new Set(['list', 'add', 'remove', 'update', 'help'])

const HELP = new Set(['--help', '-h', 'help'])

const LOGIN_FLAGS = new Set([
  '--oauth',
  '--oidc',
  '--device-auth',
  '--device-code',
  '--debug',
  '--debug-file',
  '--leader-socket',
  '--help',
  '-h'
])
const LOGIN_VALUE_FLAGS = new Set(['--debug-file', '--leader-socket'])

export const LOGIN_NOTE =
  '会打开系统浏览器登录 grok.com。在浏览器里点完才会写进本机。开发态窗即使藏着，登录也不靠这扇窗。'

export const LOGOUT_CONFIRM =
  '这会退出 grok.com 并清掉本机登录态。确认后再跑：workbench grok logout --yes'

const WRITE_CONFIRM = '这会改本机 Grok 配置（~/.grok）。确认后加上 --yes 再跑。'

export function cleanGrokArgs(raw: string[]): string[] {
  return raw.map((a) => String(a).trim()).filter(Boolean)
}

/** 剥掉 workbench 自己的 --yes / -y，不传给官方。`--` 之后原样保留（给 npx -y 那些）。 */
export function takeConfirm(raw: string[]): { args: string[]; confirm: boolean } {
  const args: string[] = []
  let confirm = false
  let pass = false
  for (const a of cleanGrokArgs(raw)) {
    if (!pass && (a === '--yes' || a === '-y')) {
      confirm = true
      continue
    }
    if (a === '--') pass = true
    args.push(a)
  }
  return { args, confirm }
}

function isHelp(args: string[]): boolean {
  return args.some((a) => HELP.has(a))
}

function firstName(rest: string[]): string {
  return rest.find((a) => a && !a.startsWith('-')) ?? ''
}

function needName(head: string, sub: string, rest: string[]): string | null {
  if (isHelp(rest)) return null
  if (firstName(rest)) return null
  return `${head} ${sub} 要带名字。例如：workbench grok ${head} ${sub} filesystem`
}

function needSource(rest: string[]): string | null {
  if (isHelp(rest)) return null
  if (firstName(rest)) return null
  return 'plugin install 要带源（git 地址、user/repo，或本地路径）。'
}

export function planGrokCmd(raw: string[]): GrokCmdPlan {
  const args = cleanGrokArgs(raw)
  const head = args[0] ?? ''
  if (!head || !ALLOWED.has(head)) {
    return {
      kind: 'error',
      error: `不支持 workbench grok ${head || '(空)'}。已包：models / mcp / plugin / login / logout / memory / export / worktree / du / subagent / workflow / loop。`
    }
  }

  if (head === 'memory') {
    const extra = args.slice(1)
    if (isHelp(extra) || extra[0] === '--help') {
      return { kind: 'run', argv: ['memory', '--help'], needsConfirm: false }
    }
    const sub = extra[0] ?? 'clear'
    if (sub !== 'clear') {
      return { kind: 'error', error: '官方只有 grok memory clear [--workspace|--global|--all]。' }
    }
    return {
      kind: 'run',
      argv: ['memory', 'clear', ...extra.slice(1)],
      needsConfirm: true,
      confirmHint: '这会清掉跨会话记忆（grok memory clear）。确认后加上 --yes。'
    }
  }

  if (head === 'models') {
    const extra = args.slice(1)
    if (extra.some((a) => !a.startsWith('-'))) {
      return { kind: 'error', error: 'models 只接受官方开关，没有子命令。' }
    }
    return { kind: 'run', argv: ['models', ...extra], needsConfirm: false }
  }

  if (head === 'login') {
    const extra = args.slice(1)
    if (isHelp(extra)) return { kind: 'run', argv: ['login', '--help'], needsConfirm: false }
    const bad = unknownLoginArg(extra)
    if (bad) {
      return {
        kind: 'error',
        error:
          bad.startsWith('-')
            ? `login 不认识 ${bad}。官方开关：--oauth / --device-auth。`
            : `login 没有子命令「${bad}」。只要：workbench grok login`
      }
    }
    return {
      kind: 'run',
      argv: ['login', ...extra],
      needsConfirm: false,
      loginDetach: true,
      timeoutMs: 20_000
    }
  }

  if (head === 'logout') {
    const extra = args.slice(1)
    if (isHelp(extra)) return { kind: 'run', argv: ['logout', '--help'], needsConfirm: false }
    if (extra.some((a) => !a.startsWith('-'))) {
      return { kind: 'error', error: 'logout 没有子命令。退出 grok.com：workbench grok logout --yes' }
    }
    return {
      kind: 'run',
      argv: ['logout', ...extra.filter((a) => a !== '--yes' && a !== '-y')],
      needsConfirm: true,
      confirmHint: LOGOUT_CONFIRM
    }
  }

  if (head === 'mcp') {
    return planMcp(args.slice(1))
  }
  return planPlugin(args.slice(1))
}

function flagName(flag: string): string {
  return flag.includes('=') ? flag.slice(0, flag.indexOf('=')) : flag
}

function unknownLoginArg(extra: string[]): string | null {
  let expectValue = false
  for (const a of extra) {
    if (expectValue) {
      expectValue = false
      continue
    }
    if (!a.startsWith('-')) return a
    const name = flagName(a)
    if (!LOGIN_FLAGS.has(name)) return a
    if (LOGIN_VALUE_FLAGS.has(name) && !a.includes('=')) expectValue = true
  }
  return null
}

function planMcp(rest: string[]): GrokCmdPlan {
  const sub = rest[0]
  if (!sub) return { kind: 'run', argv: ['mcp', 'list'], needsConfirm: false }
  if (sub === '--help' || sub === '-h') return { kind: 'run', argv: ['mcp', '--help'], needsConfirm: false }
  if (!MCP_SUB.has(sub)) {
    return {
      kind: 'error',
      error: `没有 grok mcp ${sub}。官方：list / add / remove / enable / disable / doctor。`
    }
  }
  const extra = rest.slice(1)
  if (sub === 'list' || sub === 'doctor' || sub === 'help') {
    return { kind: 'run', argv: ['mcp', sub, ...extra], needsConfirm: false, timeoutMs: 60_000 }
  }
  if (sub === 'enable' || sub === 'disable') {
    const miss = needName('mcp', sub, extra)
    if (miss) return { kind: 'error', error: miss }
    return { kind: 'run', argv: ['mcp', sub, ...extra], needsConfirm: false }
  }
  if (sub === 'remove') {
    const miss = needName('mcp', sub, extra)
    if (miss) return { kind: 'error', error: miss }
    if (isHelp(extra)) return { kind: 'run', argv: ['mcp', 'remove', ...extra], needsConfirm: false }
    return {
      kind: 'run',
      argv: ['mcp', 'remove', ...extra],
      needsConfirm: true,
      confirmHint: '这会从本机 Grok 配置里删掉这个 MCP。确认后加上 --yes。'
    }
  }
  if (isHelp(extra)) return { kind: 'run', argv: ['mcp', 'add', ...extra], needsConfirm: false }
  const name = firstName(extra)
  if (!name) {
    return {
      kind: 'error',
      error: 'mcp add 要带名字和命令/地址。例如：workbench grok mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /tmp --yes'
    }
  }
  return {
    kind: 'run',
    argv: ['mcp', 'add', ...extra],
    needsConfirm: true,
    confirmHint: WRITE_CONFIRM
  }
}

function planPlugin(rest: string[]): GrokCmdPlan {
  const sub = rest[0]
  if (!sub) return { kind: 'run', argv: ['plugin', 'list'], needsConfirm: false }
  if (sub === '--help' || sub === '-h') return { kind: 'run', argv: ['plugin', '--help'], needsConfirm: false }
  if (!PLUGIN_SUB.has(sub)) {
    return {
      kind: 'error',
      error: `没有 grok plugin ${sub}。官方：list / install / uninstall / enable / disable / details / marketplace。`
    }
  }
  const extra = rest.slice(1)
  if (sub === 'marketplace') return planMarketplace(extra)
  if (sub === 'list' || sub === 'details' || sub === 'validate' || sub === 'help') {
    if (sub === 'details') {
      const miss = needName('plugin', sub, extra)
      if (miss) return { kind: 'error', error: miss }
    }
    return { kind: 'run', argv: ['plugin', sub, ...extra], needsConfirm: false, timeoutMs: 120_000 }
  }
  if (sub === 'enable' || sub === 'disable') {
    const miss = needName('plugin', sub, extra)
    if (miss) return { kind: 'error', error: miss }
    return { kind: 'run', argv: ['plugin', sub, ...extra], needsConfirm: false }
  }
  if (sub === 'install') {
    const miss = needSource(extra)
    if (miss) return { kind: 'error', error: miss }
    if (isHelp(extra)) return { kind: 'run', argv: ['plugin', 'install', ...extra], needsConfirm: false }
    const argv = ['plugin', 'install', ...extra]
    if (!argv.includes('--trust')) argv.push('--trust')
    return {
      kind: 'run',
      argv,
      needsConfirm: true,
      confirmHint: '这会往本机装插件（grok plugin install）。确认后加上 --yes。',
      timeoutMs: 180_000
    }
  }
  if (sub === 'uninstall' || sub === 'rm' || sub === 'remove') {
    const miss = needName('plugin', sub, extra)
    if (miss) return { kind: 'error', error: miss }
    if (isHelp(extra)) return { kind: 'run', argv: ['plugin', sub, ...extra], needsConfirm: false }
    const argv = ['plugin', sub, ...extra]
    if (!argv.includes('--confirm')) argv.push('--confirm')
    return {
      kind: 'run',
      argv,
      needsConfirm: true,
      confirmHint: '这会卸掉本机插件。确认后加上 --yes。'
    }
  }
  return {
    kind: 'run',
    argv: ['plugin', sub, ...extra],
    needsConfirm: true,
    confirmHint: WRITE_CONFIRM,
    timeoutMs: 120_000
  }
}

function planMarketplace(rest: string[]): GrokCmdPlan {
  const sub = rest[0]
  if (!sub || sub === 'list') {
    const extra = sub === 'list' ? rest.slice(1) : rest
    return { kind: 'run', argv: ['plugin', 'marketplace', 'list', ...extra], needsConfirm: false }
  }
  if (sub === '--help' || sub === '-h' || sub === 'help') {
    return { kind: 'run', argv: ['plugin', 'marketplace', '--help'], needsConfirm: false }
  }
  if (!MARKET_SUB.has(sub)) {
    return {
      kind: 'error',
      error: `没有 grok plugin marketplace ${sub}。官方：list / add / remove / update。`
    }
  }
  return {
    kind: 'run',
    argv: ['plugin', 'marketplace', sub, ...rest.slice(1)],
    needsConfirm: true,
    confirmHint: WRITE_CONFIRM,
    timeoutMs: 180_000
  }
}

export function parseLoginStatus(text: string): LoginStatus {
  const t = text || ''
  if (/you are logged in|logged in with grok\.com|signed in/i.test(t) && !/not logged|not signed/i.test(t)) {
    return 'in'
  }
  if (/not logged|not signed|please (sign|log) in|run [`']?grok login/i.test(t)) return 'out'
  return 'unknown'
}

export function loginStatusLine(text: string): string {
  const lines = text.split(/\r?\n/)
  const hit = lines.filter((l) => /logged in|not logged|sign in|login/i.test(l))
  if (hit.length) return hit.join('\n').trim()
  const first = lines.find((l) => l.trim())
  return first?.trim() || ''
}

export function parseMarketPlugins(text: string): MarketPlugin[] {
  const start = text.indexOf('[')
  if (start < 0) return []
  try {
    const parsed: unknown = JSON.parse(text.slice(start))
    if (!Array.isArray(parsed)) return []
    const out: MarketPlugin[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const name = typeof rec.name === 'string' ? rec.name.trim() : ''
      if (!name) continue
      const row: MarketPlugin = { name }
      if (typeof rec.description === 'string' && rec.description.trim()) row.description = rec.description.trim()
      if (typeof rec.marketplace === 'string' && rec.marketplace.trim()) row.marketplace = rec.marketplace.trim()
      if (typeof rec.status === 'string' && rec.status.trim()) row.status = rec.status.trim()
      if (typeof rec.version === 'string' && rec.version.trim()) row.version = rec.version.trim()
      out.push(row)
    }
    return out
  } catch {
    return []
  }
}

export function installSourceFor(plugin: MarketPlugin): string {
  if (plugin.marketplace) return `${plugin.name}@${plugin.marketplace}`
  return plugin.name
}

export function grokCmdErrorText(result: Pick<GrokCmdResult, 'error' | 'stderr' | 'stdout'>): string {
  const raw = (result.error || result.stderr || result.stdout || '').trim()
  if (!raw) return '官方 grok 没成功，没留下原因。'
  if (/ENOENT|没有 grok|not found/i.test(raw) && /grok/i.test(raw)) {
    return '本机没有 grok。装好 Grok CLI 后再试（常见位置：~/.grok/bin/grok）。'
  }
  if (/not logged|not signed|unauthorized|401/i.test(raw)) {
    return `还没登录 grok.com。先点「登录 grok.com」。\n${raw}`
  }
  return raw
}
