/**
 * 第 2 波 E/F：导出、磁盘用量、worktree，以及官方没有的 compact/context/subagent。
 * 不嵌 TUI。compact 等词若原样丢给 grok，会被当成开场 prompt。
 */

export const EXPORT_TIMEOUT_MS = 120_000

export type ExtraPlan =
  | { kind: 'run'; argv: string[]; timeoutMs?: number }
  | { kind: 'inspect-agents' }
  | { kind: 'message'; ok: boolean; text: string; argv: string[] }

const WORKTREE_SUB = new Set([
  'list',
  'ls',
  'show',
  'rm',
  'gc',
  'detach',
  'salvage',
  'clean-artifacts',
  'db',
  'help'
])

const EXPORT_VALUE_FLAGS = new Set(['--debug-file', '--leader-socket'])

const COMPACT_TEXT =
  '官方没有 grok compact。压缩上下文是终端里当前会话的 /compact；窗口快满时也会自动压。workbench 不会开 TUI，也不会改会话账本。'

const CONTEXT_TEXT =
  '官方没有 grok context / grok usage。看一条会话占了多少上下文，请在终端打开那条会话，用 /context 或 /session-info。\ngrok inspect --json 没有实时占用字段。磁盘占用（~/.grok）用：workbench grok du'

const FORK_TEXT =
  '官方没有 grok fork。窗上真分用：workbench fork [session-id]。对应终端 --fork-session / ACP x.ai/session/fork。带隔离目录：workbench fork --worktree，或 workbench worktree new（grok -w）。'

const TODO_TEXT =
  '官方没有 grok todo。待办在会话里，终端打开那条会话后按 Ctrl+T 看。'

const SUBAGENT_HELP =
  '官方没有 grok subagent。\nworkbench grok subagent 会读 grok inspect --json 的 agents 字段，列出发现的子 agent 类型（内置 general-purpose / explore / plan，外加你目录里的定义）。\n开关与编辑在终端 /config-agents；不会编一份假列表。'

function cleanArgs(raw: string[]): string[] {
  return raw.map((a) => String(a).trim()).filter(Boolean)
}

function exportHasSessionId(rest: string[]): boolean {
  let i = 0
  while (i < rest.length) {
    const a = rest[i]
    if (a === '--help' || a === '-h') return true
    if (!a.startsWith('-')) return true
    const eq = a.indexOf('=')
    if (eq > 0) {
      i += 1
      continue
    }
    if (EXPORT_VALUE_FLAGS.has(a)) {
      i += 2
      continue
    }
    i += 1
  }
  return false
}

function planExport(rest: string[]): ExtraPlan {
  if (rest.includes('--help') || rest.includes('-h')) {
    return { kind: 'run', argv: ['export', ...rest] }
  }
  if (!exportHasSessionId(rest)) {
    return {
      kind: 'message',
      ok: false,
      argv: ['export'],
      text: '用法：workbench grok export <session-id> [文件.md]\n官方必须带会话 id。不读、不改 workbench 里的会话账本。'
    }
  }
  return { kind: 'run', argv: ['export', ...rest], timeoutMs: EXPORT_TIMEOUT_MS }
}

function planWorktree(rest: string[]): ExtraPlan {
  const sub = rest[0]
  if (!sub) return { kind: 'run', argv: ['worktree', 'list'] }
  if (sub === '--help' || sub === '-h') return { kind: 'run', argv: ['worktree', '--help'] }
  if (sub.startsWith('-')) return { kind: 'run', argv: ['worktree', 'list', ...rest] }
  if (!WORKTREE_SUB.has(sub)) {
    return {
      kind: 'message',
      ok: false,
      argv: ['worktree', sub],
      text: `官方 grok worktree 没有 ${sub}。有：list / show / rm / gc / detach / salvage / clean-artifacts / db。新建隔离会话：workbench worktree new（桌面等价 grok -w）。`
    }
  }
  return { kind: 'run', argv: ['worktree', ...rest] }
}

function planDu(head: 'du' | 'disk-usage', rest: string[]): ExtraPlan {
  return { kind: 'run', argv: [head, ...rest], timeoutMs: 60_000 }
}

function planSubagent(rest: string[]): ExtraPlan {
  const sub = rest[0] ?? 'list'
  if (sub === '--help' || sub === '-h' || sub === 'help') {
    return { kind: 'message', ok: true, argv: ['subagent', '--help'], text: SUBAGENT_HELP }
  }
  if (rest.length === 0 || sub === 'list') {
    const extra = sub === 'list' ? rest.slice(1) : rest
    if (extra.some((a) => !a.startsWith('-'))) {
      return {
        kind: 'message',
        ok: false,
        argv: ['subagent', ...rest],
        text: 'workbench grok subagent 只列类型，没有 add/remove。官方也没有 grok subagent。'
      }
    }
    return { kind: 'inspect-agents' }
  }
  return {
    kind: 'message',
    ok: false,
    argv: ['subagent', ...rest],
    text: `官方没有 grok subagent ${sub}。只要列表：workbench grok subagent。\n${SUBAGENT_HELP}`
  }
}

/** 认出 E/F 词就接管；其余交回第 1 波 C。 */
export function planExtra(raw: string[]): ExtraPlan | null {
  const args = cleanArgs(raw)
  const head = args[0] ?? ''
  const rest = args.slice(1)
  if (head === 'export') return planExport(rest)
  if (head === 'worktree') return planWorktree(rest)
  if (head === 'du' || head === 'disk-usage') return planDu(head, rest)
  if (head === 'compact') {
    return { kind: 'message', ok: false, argv: ['compact'], text: COMPACT_TEXT }
  }
  if (head === 'context' || head === 'usage') {
    return { kind: 'message', ok: false, argv: [head], text: CONTEXT_TEXT }
  }
  if (head === 'fork') {
    return { kind: 'message', ok: false, argv: ['fork'], text: FORK_TEXT }
  }
  if (head === 'todo' || head === 'todos') {
    return { kind: 'message', ok: false, argv: [head], text: TODO_TEXT }
  }
  if (head === 'subagent' || head === 'subagents') {
    return planSubagent(rest)
  }
  return null
}

export function formatInspectAgents(jsonText: string): { ok: true; stdout: string } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, error: 'grok inspect --json 读出来不是 JSON，没法列子 agent。' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'grok inspect --json 根节点不是对象。' }
  }
  const agents = (parsed as { agents?: unknown }).agents
  if (!Array.isArray(agents)) {
    return {
      ok: false,
      error: '官方没有 grok subagent。这次 inspect --json 里也没有 agents 字段。'
    }
  }
  const lines = [
    '官方没有 grok subagent。下面是 grok inspect --json 的 agents 字段。',
    `ok  source=inspect  n=${agents.length}`
  ]
  for (const item of agents) {
    if (!item || typeof item !== 'object') continue
    const row = item as { name?: unknown; source?: { type?: unknown } }
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '?'
    const source =
      row.source && typeof row.source === 'object' && typeof row.source.type === 'string'
        ? row.source.type
        : '?'
    lines.push(`  ${name}  ${source}`)
  }
  return { ok: true, stdout: `${lines.join('\n')}\n` }
}
