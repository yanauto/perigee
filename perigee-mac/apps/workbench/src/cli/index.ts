#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTROL_FILE, DATA_DIR } from '../shared/constants.js'
import { folderName, formatSessionWhen, type GrokSessionRow } from '../shared/grok-sessions.js'
import { formatWhen } from '../shared/routines.js'
import type { ControlInfo, RoutineRow } from '../shared/types.js'
import { runDoctor } from './doctor.js'

const require = createRequire(import.meta.url)
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

type Json = Record<string, unknown>

function usage(): string {
  return [
    'workbench up',
    'workbench status',
    'workbench pages',
    'workbench goto <id> [empty|pro]',
    'workbench new',
    'workbench open <id>',
    'workbench resume <cli-session-id>',
    'workbench open-session <cli-session-id>',
    'workbench send <text>',
    'workbench cancel [id]',
    'workbench allow [id]',
    'workbench deny [id]',
    'workbench enter <email> [code]',
    'workbench shot [id]',
    'workbench down',
    'workbench doctor',
    'workbench workspace [路径|--clear]',
    'workbench mode [ask|auto|always-approve|cli]',
    'workbench model [id|cli|refresh]',
    'workbench plan [on|off]',
    'workbench grok models',
    'workbench grok mcp [list|enable|disable|add|remove|doctor]',
    'workbench grok plugin [list|install|uninstall|enable|disable|marketplace]',
    'workbench grok login',
    'workbench grok logout [--yes]',
    'workbench grok export <session-id> [file]',
    'workbench grok worktree [list|show|rm|gc]',
    'workbench grok du',
    'workbench grok subagent',
    'workbench grok workflow',
    'workbench grok loop',
    'workbench worktree [list|new|open|rm|gc]',
    'workbench fork [session-id] [--worktree]',
    'workbench sessions',
    'workbench sessions search <关键词>',
    'workbench sessions delete <id> --yes',
    'workbench continue',
    'workbench recent',
    'workbench routine add <名字> <要说的话> <cron>',
    'workbench routine list',
    'workbench routine run <id>'
  ].join('\n')
}

function fail(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}

function readControl(): ControlInfo | null {
  if (!existsSync(CONTROL_FILE)) return null
  try {
    const raw = JSON.parse(readFileSync(CONTROL_FILE, 'utf8')) as ControlInfo
    if (!raw || typeof raw.port !== 'number' || typeof raw.pid !== 'number') return null
    return raw
  } catch {
    return null
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function api(method: string, path: string, body?: unknown): Promise<Json> {
  const ctl = readControl()
  if (!ctl || !pidAlive(ctl.pid)) {
    throw new Error('workbench 没在跑。先执行 workbench up')
  }
  const res = await fetch(`http://127.0.0.1:${ctl.port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = (await res.json()) as Json
  if (!res.ok || json.ok === false) {
    throw new Error(String(json.error || `HTTP ${res.status}`))
  }
  return json
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function electronBin(): string {
  const p = require('electron') as string
  if (!p || !existsSync(p)) {
    throw new Error('找不到 Electron。先在 perigee-mac 目录 pnpm install，再 build 本包')
  }
  return p
}

function ensureBuilt(): void {
  if (!existsSync(join(appRoot, 'out/main/index.js'))) {
    throw new Error('还没构建。先跑：pnpm --filter @perigee/workbench run build')
  }
}

function spawnHidden(): number {
  ensureBuilt()
  mkdirSync(DATA_DIR, { recursive: true })
  const logFd = openSync(join(DATA_DIR, 'app.log'), 'a')
  const env = { ...process.env }
  if (env.WORKBENCH_SHOW !== '1') delete env.WORKBENCH_SHOW
  const child = spawn(electronBin(), [appRoot], {
    cwd: appRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env
  })
  child.unref()
  if (!child.pid) throw new Error('启动失败')
  return child.pid
}

async function waitReady(timeoutMs = 20000): Promise<Json> {
  const start = Date.now()
  let last = ''
  while (Date.now() - start < timeoutMs) {
    try {
      const s = await api('GET', '/status')
      if (s.ready) return s
      last = '已连上控制面，窗口还在加载'
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await sleep(200)
  }
  throw new Error(`启动超时。${last}。日志：${join(DATA_DIR, 'app.log')}`)
}

function sessionMark(row: { status?: string; unread?: boolean; pending?: boolean }): string {
  if (row.status === 'streaming' || row.status === 'waiting') return '进行中'
  if (row.unread) return '未读'
  if (row.pending) return '待批'
  return '—'
}

function printSessions(s: Json): void {
  const rows = (s.sessionList as
    | { id: string; title: string; status?: string; unread?: boolean; pending?: boolean }[]
    | undefined) ?? []
  const active = typeof s.activeSessionId === 'string' ? s.activeSessionId : ''
  if (!rows.length) return
  for (const row of rows) {
    const on = row.id === active ? '*' : ' '
    console.log(`  ${on} ${row.id}  ${sessionMark(row)}  ${row.title}`)
  }
}

function printStatus(s: Json, extra?: ControlInfo | null): void {
  const port = extra?.port ?? ''
  const bits = [
    s.ok ? 'running' : 'down',
    `pid=${s.pid ?? extra?.pid ?? '?'}`,
    port !== '' ? `port=${port}` : '',
    `page=${s.page ?? '?'}`,
    `shown=${s.shown === true}`,
    `ready=${s.ready === true}`,
    s.workspace
      ? `workspace=${typeof s.workspaceName === 'string' && s.workspaceName ? s.workspaceName : s.workspace}`
      : 'workspace=(未选)',
    s.agentMode ? `perm=${s.agentMode}` : '',
    s.model ? `model=${s.model}` : '',
    s.planMode === true ? 'planMode=on' : 'planMode=off',
    typeof s.worktrees === 'number' ? `worktrees=${s.worktrees}` : '',
    s.signedIn === true ? `in=${s.email ?? ''}` : 'in=no'
  ].filter(Boolean)
  console.log(bits.join('  '))
  if (s.flyby && typeof s.flyby === 'object') {
    const f = s.flyby as { ok?: boolean; bridgeUp?: boolean; extensionConnected?: boolean; detail?: string }
    console.log(
      `flyby  ${f.ok ? 'ok' : 'no'}  bridge=${f.bridgeUp ? 'up' : 'down'}  ext=${f.extensionConnected ? 'yes' : 'no'}  ${f.detail ?? ''}`
    )
  }
  if (Array.isArray(s.mcp) && s.mcp.length) {
    console.log(`mcp    ${(s.mcp as string[]).join(', ')}`)
  }
  printSessions(s)
  const routines = (s.routines as { id: string; name: string; running?: boolean }[] | undefined) ?? []
  if (routines.length) {
    console.log(`routines ${routines.length}`)
  }
}

type ChatState = {
  page?: string
  activeSessionId?: string | null
  workspace?: { path?: string | null; name?: string | null }
  agent?: {
    mode?: string
    plan?: boolean
    cliMode?: string
    label?: string
    coverNote?: string | null
    liveApply?: string
    followCli?: boolean
  }
  models?: {
    current?: string
    defaultModel?: string
    followCli?: boolean
    liveApply?: string
  }
  sessions?: {
    id: string
    title: string
    status?: string
    unread?: boolean
    pendingAsk?: { action?: string } | null
    workspacePath?: string
    cliSessionId?: string
    worktreeLabel?: string | null
    messages: { role: string; text: string }[]
  }[]
}

function activeChat(state: ChatState) {
  const list = state.sessions ?? []
  return list.find((s) => s.id === state.activeSessionId) ?? list[0]
}

async function cmdUp(): Promise<void> {
  const existing = readControl()
  if (existing && pidAlive(existing.pid)) {
    try {
      const s = await api('GET', '/status')
      console.log('already running')
      printStatus(s, existing)
      return
    } catch {
      /* 控制面僵了，下面会拉新进程；单实例锁会让重复进程退出 */
    }
  }
  const pid = spawnHidden()
  console.log(`starting pid=${pid} (hidden)`)
  const s = await waitReady()
  printStatus(s, readControl())
}

async function cmdStatus(): Promise<void> {
  const ctl = readControl()
  if (!ctl || !pidAlive(ctl.pid)) {
    console.log('down')
    process.exitCode = 1
    return
  }
  const s = await api('GET', '/status')
  printStatus(s, ctl)
}

async function cmdPages(): Promise<void> {
  const s = await api('GET', '/pages')
  const pages = (s.pages as { id: string; hint: string }[]) || []
  for (const p of pages) {
    console.log(`${p.id.padEnd(22)} ${p.hint}`)
  }
}

async function cmdGoto(id: string, extra?: string): Promise<void> {
  if (!id) fail('用法：workbench goto <id> [empty|pro]')
  const s = await api('POST', '/goto', extra ? { id, extra } : { id })
  const state = s.state as {
    page?: string
    modal?: string | null
    account?: { plan?: string }
    setupPhase?: string
    agentTab?: string
    desktopFull?: boolean
    auto?: { items?: unknown[]; tab?: string; toast?: string | null }
    routines?: { items?: unknown[]; toast?: string | null }
    bugbot?: { reviews?: unknown[]; rules?: unknown[]; view?: string; toast?: string | null }
    plugins?: { installed?: unknown[]; query?: string; toast?: string | null }
    cloud?: { gitConnected?: boolean; slackLinked?: boolean; apiKeys?: unknown[] }
    team?: { name?: string; seats?: string; yearly?: boolean; created?: boolean }
  }
  const bits = [`ok  page=${state.page ?? id}`]
  if (state.account?.plan) bits.push(`plan=${state.account.plan}`)
  if (state.setupPhase) bits.push(`phase=${state.setupPhase}`)
  if (state.agentTab) bits.push(`tab=${state.agentTab}`)
  if (state.desktopFull) bits.push('full')
  if (state.routines?.items) bits.push(`routines=${state.routines.items.length}`)
  if (state.routines?.toast) bits.push('toast')
  if (state.bugbot?.reviews) bits.push(`reviews=${state.bugbot.reviews.length}`)
  if (state.bugbot?.rules) bits.push(`rules=${state.bugbot.rules.length}`)
  if (state.bugbot?.view && state.bugbot.view !== 'home') bits.push(`view=${state.bugbot.view}`)
  if (state.bugbot?.toast) bits.push('toast')
  if (state.plugins?.installed) bits.push(`plugins=${state.plugins.installed.length}`)
  if (state.plugins?.query) bits.push(`q=${state.plugins.query}`)
  if (state.plugins?.toast) bits.push('toast')
  if (state.page === 'settings-integrations' || state.page === 'settings-cloud-agents') {
    if (state.cloud) {
      bits.push(state.cloud.gitConnected ? 'git=on' : 'git=off')
      bits.push(state.cloud.slackLinked ? 'slack=on' : 'slack=off')
      bits.push(`keys=${state.cloud.apiKeys?.length ?? 0}`)
    }
  }
  if (state.page === 'onboarding-team' || state.page === 'settings-members' || state.page === 'settings-plan') {
    if (state.team) {
      bits.push(`team=${state.team.name || '(empty)'}`)
      bits.push(`seats=${state.team.seats ?? '?'}`)
      bits.push(state.team.yearly === false ? 'monthly' : 'yearly')
      if (state.team.created) bits.push('created')
    }
  }
  if (state.modal) bits.push(`modal=${state.modal}`)
  console.log(bits.join('  '))
}

function printChatState(state: ChatState): void {
  const session = activeChat(state)
  const bits = [
    `ok  page=${state.page ?? 'chat'}`,
    session?.id ? `id=${session.id}` : '',
    session?.cliSessionId ? `cli=${session.cliSessionId}` : '',
    `title=${session?.title ?? ''}`,
    session?.status ? `status=${session.status}` : '',
    session?.workspacePath
      ? `workspace=${session.workspacePath}`
      : state.workspace?.path
        ? `workspace=${state.workspace.path}`
        : 'workspace=(未选)',
    session?.worktreeLabel ? `worktree=${session.worktreeLabel}` : ''
  ].filter(Boolean)
  console.log(bits.join('  '))
  if (state.agent?.mode) {
    console.log(
      `perm  ${state.agent.label ?? state.agent.mode}  plan=${state.agent.plan ? 'on' : 'off'}  cli=${state.agent.cliMode ?? '?'}`
    )
  }
  if (state.models?.current) {
    console.log(
      `model ${state.models.current}${state.models.followCli ? '  source=cli-default' : '  source=window'}`
    )
  }
  if (session?.pendingAsk?.action) {
    console.log(`ask  ${session.pendingAsk.action}`)
  }
  const msgs = session?.messages ?? []
  for (const m of msgs) {
    if (m.role === 'assistant' && m.text.startsWith('工具 ·')) {
      console.log(m.text.split('\n')[0])
    }
  }
  const lastProse = [...msgs]
    .reverse()
    .find((m) => m.role === 'assistant' && !m.text.startsWith('工具 ·'))
  if (lastProse) {
    console.log(lastProse.text.split('\n')[0])
  }
}

async function cmdSend(text: string): Promise<void> {
  if (!text.trim()) fail('用法：workbench send "你好"')
  let sentId = ''
  try {
    const prior = await api('GET', '/status')
    sentId = typeof prior.activeSessionId === 'string' ? prior.activeSessionId : ''
  } catch {
    /* 没有活动会话就按发送后的当前会话打 */
  }
  const s = await api('POST', '/send', { text })
  const state = s.state as ChatState & {
    account?: { email?: string | null; signedIn?: boolean }
    pendingEmail?: string | null
  }
  if (
    state.page === 'verify-email' ||
    state.page === 'agents-home' ||
    state.page === 'sign-in' ||
    state.page === 'onboarding-download' ||
    state.page === 'automations-detail' ||
    state.page === 'automations' ||
    state.page === 'settings-plugins' ||
    state.page === 'settings-plugins-detail'
  ) {
    console.log(
      `ok  page=${state.page}  email=${state.account?.email ?? state.pendingEmail ?? ''}`
    )
    return
  }
  const sent = sentId ? (state.sessions ?? []).find((x) => x.id === sentId) : undefined
  if (sent) {
    printChatState({ ...state, activeSessionId: sent.id })
    return
  }
  printChatState(state)
}

async function cmdNew(): Promise<void> {
  const s = await api('POST', '/new')
  const state = s.state as { page?: string; activeSessionId?: string | null }
  console.log(`ok  page=${state.page ?? 'agents-home'}  active=${state.activeSessionId ?? 'none'}`)
}

async function cmdOpen(id: string): Promise<void> {
  if (!id.trim()) fail('用法：workbench open <id>')
  const s = await api('POST', '/open', { id })
  printChatState(s.state as ChatState)
}

async function cmdResume(id: string): Promise<void> {
  if (!id.trim()) fail('用法：workbench resume <cli-session-id>')
  const s = await api('POST', '/resume', { id: id.trim() })
  printChatState(s.state as ChatState)
}

async function cmdTurn(kind: 'cancel' | 'allow' | 'deny', id?: string): Promise<void> {
  const s = await api('POST', `/${kind}`, id ? { id } : {})
  printChatState(s.state as ChatState)
}

async function cmdEnter(email: string, code?: string): Promise<void> {
  if (!email.trim()) fail('用法：workbench enter <email> [code]')
  const s = await api('POST', '/enter', { email, code })
  const state = s.state as {
    page?: string
    account?: { email?: string | null; signedIn?: boolean }
    pendingEmail?: string | null
  }
  console.log(
    `ok  page=${state.page ?? '?'}  email=${state.account?.email ?? state.pendingEmail ?? email}  in=${state.account?.signedIn === true}`
  )
}

function printRoutineRow(r: RoutineRow, on = false): void {
  const mark = r.running ? '进行中' : r.enabled ? '开' : '停'
  const bits = [
    on ? '*' : ' ',
    r.id,
    mark,
    r.name,
    `cron=${r.cron || '—'}`,
    `下次=${formatWhen(r.nextRunAt)}`,
    `上次=${formatWhen(r.lastRunAt)}`
  ]
  if (r.lastStatus) bits.push(r.lastStatus)
  console.log(bits.join('  '))
}

async function cmdRoutine(args: string[]): Promise<void> {
  const [sub, ...rest] = args
  if (sub === 'add') {
    const name = rest[0] ?? ''
    const instruction = rest[1] ?? ''
    const cron = rest[2] ?? ''
    if (!name.trim() || !instruction.trim() || !cron.trim()) {
      fail('用法：workbench routine add "<名字>" "<要说的话>" "<cron五字段>"')
    }
    const s = await api('POST', '/routine/add', { name, instruction, cron })
    const state = s.state as { routines?: { items?: RoutineRow[]; activeId?: string | null } }
    const items = state.routines?.items ?? []
    const row = items.find((r) => r.id === state.routines?.activeId) ?? items[0]
    if (!row) {
      console.log('ok')
      return
    }
    console.log(`ok  id=${row.id}  name=${row.name}  cron=${row.cron}`)
    return
  }
  if (sub === 'list') {
    const s = await api('GET', '/routine/list')
    const items = ((s.routines as { items?: RoutineRow[] } | undefined)?.items ?? []) as RoutineRow[]
    if (!items.length) {
      console.log('(没有自动化)')
      return
    }
    for (const row of items) printRoutineRow(row)
    return
  }
  if (sub === 'run') {
    const id = rest[0] ?? ''
    if (!id.trim()) fail('用法：workbench routine run <id>')
    const s = await api('POST', '/routine/run', { id })
    const state = s.state as {
      routines?: { items?: RoutineRow[] }
      sessions?: { id: string; title: string; status?: string; messages: { role: string; text: string }[] }[]
    }
    const row = (state.routines?.items ?? []).find((r) => r.id === id)
    const sid = row?.lastSessionId
    const session = sid ? (state.sessions ?? []).find((x) => x.id === sid) : undefined
    console.log(
      `ok  id=${id}  session=${sid ?? '—'}  last=${row?.lastStatus ?? '—'}  ${row?.running ? '进行中' : ''}`
    )
    if (row?.lastSummary) console.log(row.lastSummary.split('\n')[0])
    const lastProse = [...(session?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.text.startsWith('工具 ·'))
    if (lastProse && lastProse.text !== row?.lastSummary) {
      console.log(lastProse.text.split('\n')[0])
    }
    return
  }
  fail(`用法：workbench routine add|list|run\n${usage()}`)
}

function resolveUserPath(raw: string): string {
  const t = raw.trim()
  if (t === '~') return homedir()
  if (t.startsWith('~/')) return resolve(homedir(), t.slice(2))
  return resolve(t)
}

function printWorkspace(s: Json): void {
  const path = typeof s.path === 'string' ? s.path : null
  const name = typeof s.name === 'string' ? s.name : null
  if (!path) {
    console.log('ok  workspace=(未选)  新会话会提示先选文件夹')
    return
  }
  console.log(`ok  workspace=${name ?? path}  path=${path}`)
}

function printAgent(a: {
  mode?: string
  plan?: boolean
  cliMode?: string
  label?: string
  official?: string
  followCli?: boolean
  policy?: string
  coverNote?: string | null
  liveApply?: string
}): void {
  const bits = [
    `ok  mode=${a.mode ?? '?'}`,
    a.label ? `label=${a.label}` : '',
    a.official ? `official=${a.official}` : '',
    `plan=${a.plan ? 'on' : 'off'}`,
    `cli=${a.cliMode ?? '?'}`,
    a.followCli ? 'source=cli' : 'source=window',
    a.policy ? `policy=${a.policy}` : ''
  ].filter(Boolean)
  console.log(bits.join('  '))
  if (a.coverNote) console.log(`cover  ${a.coverNote}`)
  if (a.liveApply) console.log(`live  ${a.liveApply}`)
}

async function cmdMode(args: string[]): Promise<void> {
  const raw = args.join(' ').trim()
  if (!raw) {
    printAgent((await api('GET', '/mode')) as Parameters<typeof printAgent>[0])
    return
  }
  printAgent((await api('POST', '/mode', { mode: raw })) as Parameters<typeof printAgent>[0])
}

function printModel(m: {
  current?: string
  defaultModel?: string
  followCli?: boolean
  liveApply?: string
  detail?: string
  list?: Array<{ id?: string; isDefault?: boolean }>
}): void {
  const bits = [
    `ok  model=${m.current || '?'}`,
    m.defaultModel ? `default=${m.defaultModel}` : '',
    m.followCli ? 'source=cli-default' : 'source=window'
  ].filter(Boolean)
  console.log(bits.join('  '))
  if (m.liveApply) console.log(`live  ${m.liveApply}`)
  if (m.detail) console.log(`list  ${m.detail}`)
  for (const row of m.list ?? []) {
    if (!row.id) continue
    const mark = row.id === m.current ? '*' : '-'
    const def = row.isDefault ? ' (default)' : ''
    console.log(`  ${mark} ${row.id}${def}`)
  }
}

async function cmdModel(args: string[]): Promise<void> {
  const raw = args.join(' ').trim()
  if (!raw) {
    printModel((await api('GET', '/model')) as Parameters<typeof printModel>[0])
    return
  }
  printModel((await api('POST', '/model', { model: raw })) as Parameters<typeof printModel>[0])
}

async function cmdPlan(args: string[]): Promise<void> {
  const raw = args.join(' ').trim()
  if (!raw) {
    printAgent((await api('GET', '/plan')) as Parameters<typeof printAgent>[0])
    return
  }
  printAgent((await api('POST', '/plan', { plan: raw })) as Parameters<typeof printAgent>[0])
}

async function cmdWorkspace(args: string[]): Promise<void> {
  const raw = args.join(' ').trim()
  if (!raw) {
    printWorkspace(await api('GET', '/workspace'))
    return
  }
  if (raw === '--clear' || raw === 'clear') {
    printWorkspace(await api('POST', '/workspace', { path: null }))
    return
  }
  printWorkspace(await api('POST', '/workspace', { path: resolveUserPath(raw) }))
}

function printGrokSessionRow(row: GrokSessionRow): void {
  const when = formatSessionWhen(row.updatedAt || row.createdAt)
  const folder = folderName(row.cwd) ?? '—'
  console.log(`${row.id}  ${when}  ${folder}  ${row.title}`)
}

function printWorktrees(pack: {
  items?: Array<{ id?: string; kind?: string; repo?: string; label?: string | null; path?: string }>
  error?: string | null
  emptyNote?: string | null
  raw?: string
}): void {
  const items = pack.items ?? []
  if (pack.emptyNote && !items.length) console.log(pack.emptyNote)
  if (pack.error && !items.length) {
    console.log(pack.error)
    return
  }
  console.log(`ok  source=grok-worktree-list  n=${items.length}`)
  for (const row of items) {
    console.log(
      `${row.id ?? '?'}  ${row.kind ?? '—'}  ${row.repo || '—'}  ${row.label || '—'}  ${row.path ?? ''}`
    )
  }
}

async function cmdWorkbenchWorktree(args: string[]): Promise<void> {
  const rest = args.filter((a) => a !== '--yes' && a !== '-y')
  const yes = args.includes('--yes') || args.includes('-y')
  const sub = rest[0] ?? 'list'
  if (sub === 'list' || sub === 'ls') {
    await api('POST', '/goto', { id: 'worktrees' })
    const s = await api('GET', '/worktree')
    printWorktrees((s.worktrees ?? {}) as Parameters<typeof printWorktrees>[0])
    return
  }
  if (sub === 'new') {
    const label = rest.slice(1).join(' ').trim() || undefined
    const s = await api('POST', '/worktree/new', label ? { label } : {})
    printChatState(s.state as ChatState)
    return
  }
  if (sub === 'open') {
    const path = rest.slice(1).join(' ').trim()
    if (!path) fail('用法：workbench worktree open <路径>')
    const s = await api('POST', '/worktree/open', { path })
    printChatState(s.state as ChatState)
    return
  }
  if (sub === 'rm' || sub === 'gc') {
    const extra = rest.slice(1)
    const s = await api('POST', '/worktree/housekeep', {
      action: sub,
      ids: sub === 'rm' ? extra.filter((a) => !a.startsWith('-')) : [],
      extra: extra.filter((a) => a.startsWith('-')),
      confirm: yes
    })
    printWorktrees(((s.state as { worktrees?: Parameters<typeof printWorktrees>[0] })?.worktrees ?? {}) as Parameters<typeof printWorktrees>[0])
    return
  }
  fail('用法：workbench worktree [list|new|open|rm|gc]')
}

async function cmdFork(args: string[]): Promise<void> {
  const isolate = args.includes('--worktree') || args.includes('-w')
  const id = args.find((a) => a !== '--worktree' && a !== '-w' && !a.startsWith('-')) ?? ''
  const s = await api('POST', '/fork', { id: id || undefined, isolate })
  printChatState(s.state as ChatState)
}

function printSessionPack(s: Json): void {
  const items = (Array.isArray(s.items) ? s.items : []) as GrokSessionRow[]
  const source = typeof s.source === 'string' ? s.source : '?'
  if (s.note) console.log(String(s.note))
  console.log(`ok  source=${source}  n=${items.length}`)
  if (!items.length) {
    const err = typeof s.error === 'string' ? s.error : '还没有 CLI 会话'
    console.log(err)
    if (s.ok === false) process.exitCode = 1
    return
  }
  for (const row of items) printGrokSessionRow(row)
}

async function cmdContinue(): Promise<void> {
  const s = await api('POST', '/sessions/continue')
  const row = s.row as GrokSessionRow | undefined
  if (row) console.log(`continue  ${row.id}  ${row.title}`)
  printChatState(s.state as ChatState)
}

async function cmdSessions(args: string[]): Promise<void> {
  const [sub, ...rest] = args
  if (sub === 'continue' || sub === 'recent') return cmdContinue()
  if (sub === 'search') {
    const nIdx = rest.indexOf('-n')
    const nFlag = nIdx >= 0 ? rest[nIdx + 1] : undefined
    const limitArg = rest.find((a) => a.startsWith('--limit='))?.slice('--limit='.length)
    const limitRaw = limitArg || nFlag
    const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined
    const skip = new Set<string>()
    if (nIdx >= 0) {
      skip.add('-n')
      if (nFlag != null) skip.add(nFlag)
    }
    const query = rest
      .filter((a) => !skip.has(a) && !a.startsWith('--limit=') && a !== '--yes' && a !== '-y')
      .join(' ')
      .trim()
    if (!query) fail('用法：workbench sessions search <关键词>')
    const params = new URLSearchParams({ q: query })
    if (limit) params.set('limit', String(limit))
    printSessionPack(await api('GET', `/sessions?${params.toString()}`))
    return
  }
  if (sub === 'delete') {
    const yes = rest.includes('--yes') || rest.includes('-y')
    const id = rest.find((a) => a !== '--yes' && a !== '-y' && !a.startsWith('-')) ?? ''
    if (!id.trim()) fail('用法：workbench sessions delete <id> --yes')
    if (!yes) {
      fail('先确认。确认后：workbench sessions delete <id> --yes')
    }
    const s = await api('POST', '/sessions/delete', { id: id.trim(), confirm: true })
    console.log(`ok  deleted=${s.id ?? id}`)
    return
  }

  const limitArg = args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length)
  const nFlag = args.includes('-n') ? args[args.indexOf('-n') + 1] : undefined
  const limitRaw = limitArg || nFlag
  const limit = limitRaw ? Number(limitRaw) : undefined
  const q = Number.isFinite(limit) && limit ? `?limit=${limit}` : ''
  printSessionPack(await api('GET', `/sessions${q}`))
}

async function cmdGrok(args: string[]): Promise<void> {
  const head = args[0] ?? ''
  if (!head || head === 'help' || head === '-h' || head === '--help') {
    fail(
      '用法：workbench grok models|mcp|plugin|login|logout|export|worktree|du|subagent|workflow|loop\n改配置 / 退出 grok.com 要加 --yes。login 会开浏览器。'
    )
  }
  const ctl = readControl()
  if (!ctl || !pidAlive(ctl.pid)) {
    fail('workbench 没在跑。先执行 workbench up')
  }
  const confirm = args.includes('--yes') || args.includes('-y')
  const res = await fetch(`http://127.0.0.1:${ctl.port}/grok/cmd`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args, confirm })
  })
  const json = (await res.json()) as Json
  const stdout = typeof json.stdout === 'string' ? json.stdout : ''
  const stderr = typeof json.stderr === 'string' ? json.stderr : ''
  if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`)
  if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`)
  if (json.ok === false) {
    const err = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
    if (err && !stderr.includes(err) && !stdout.includes(err)) {
      console.error(err)
    }
    process.exit(typeof json.code === 'number' && json.code !== 0 ? json.code : 1)
  }
}

async function cmdShot(id?: string): Promise<void> {
  const s = await api('POST', '/shot', id ? { id } : {})
  console.log(String(s.path))
}

function cmdDown(): void {
  const ctl = readControl()
  if (!ctl || !pidAlive(ctl.pid)) {
    console.log('down')
    return
  }
  try {
    process.kill(ctl.pid, 'SIGTERM')
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
  console.log(`stopped pid=${ctl.pid}`)
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2)
  const args = raw[0] === '--' ? raw.slice(1) : raw
  const [cmd, ...rest] = args
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log(usage())
    return
  }
  if (cmd === 'up') return cmdUp()
  if (cmd === 'status') return cmdStatus()
  if (cmd === 'pages') return cmdPages()
  if (cmd === 'goto') return cmdGoto(rest[0] ?? '', rest[1])
  if (cmd === 'new') return cmdNew()
  if (cmd === 'open') return cmdOpen(rest[0] ?? '')
  if (cmd === 'resume' || cmd === 'open-session') return cmdResume(rest[0] ?? '')
  if (cmd === 'send') return cmdSend(rest.join(' '))
  if (cmd === 'cancel') return cmdTurn('cancel', rest[0])
  if (cmd === 'allow') return cmdTurn('allow', rest[0])
  if (cmd === 'deny') return cmdTurn('deny', rest[0])
  if (cmd === 'enter') return cmdEnter(rest[0] ?? '', rest[1])
  if (cmd === 'shot') return cmdShot(rest[0])
  if (cmd === 'down') return cmdDown()
  if (cmd === 'doctor') return runDoctor()
  if (cmd === 'routine') return cmdRoutine(rest)
  if (cmd === 'workspace') return cmdWorkspace(rest)
  if (cmd === 'mode') return cmdMode(rest)
  if (cmd === 'model') return cmdModel(rest)
  if (cmd === 'plan') return cmdPlan(rest)
  if (cmd === 'grok') return cmdGrok(rest)
  if (cmd === 'worktree') return cmdWorkbenchWorktree(rest)
  if (cmd === 'fork') return cmdFork(rest)
  if (cmd === 'sessions') return cmdSessions(rest)
  if (cmd === 'continue' || cmd === 'recent') return cmdContinue()
  fail(`未知命令：${cmd}\n${usage()}`)
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
