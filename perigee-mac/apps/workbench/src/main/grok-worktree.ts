/**
 * 官方 worktree / fork。
 * 列表 = `grok worktree list --json`。
 * 新建隔离 = ACP `x.ai/git/worktree/create_from_worktree_sync`（桌面等价 grok -w，不嵌 TUI）。
 * 分叉 = ACP `x.ai/session/fork`（桌面等价 --fork-session）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { resolveGrokBinary } from '@perigee/engine-protocol'
import {
  buildAcpStdioArgs,
  buildAuthenticateParams,
  buildInitializeParams,
  parseAuthMethods,
  pickAuthMethodId
} from '@perigee/engine-grok-acp'
import {
  expandUserPath,
  parseWorktreeListJson,
  parseWorktreeListText,
  pickCreatedWorktreePath,
  sessionCwdInWorktree,
  worktreeEmptyNote,
  type WorktreeRow,
  type WorktreeState
} from '../shared/grok-worktree'

const LIST_TIMEOUT_MS = 45_000
const ACP_TIMEOUT_MS = 180_000

function noGrokError(): string {
  return '本机没有 grok。装好 Grok CLI 后再试（常见位置：~/.grok/bin/grok）。'
}

function findGrokBinary(): string | null {
  const bin = resolveGrokBinary()
  if (bin === 'grok' || bin === 'grok.exe') return bin
  try {
    accessSync(bin, constants.X_OK)
    return bin
  } catch {
    if (existsSync(bin)) return bin
    return null
  }
}

function killChild(child: { kill: (signal?: NodeJS.Signals) => boolean }): void {
  try {
    child.kill('SIGTERM')
  } catch {
    /* */
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL')
    } catch {
      /* */
    }
  }, 400)
}

function runGrok(
  bin: string,
  argv: string[],
  cwd: string,
  timeoutMs = LIST_TIMEOUT_MS
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(bin, argv, {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const finish = (code: number, err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve({ code, stdout, stderr })
    }
    const timer = setTimeout(() => {
      killChild(child)
      finish(1, new Error(`grok ${argv.join(' ')} 超时`))
    }, timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (c: string) => {
      stdout += c
    })
    child.stderr?.on('data', (c: string) => {
      stderr += c
    })
    child.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      finish(1, new Error(msg.includes('ENOENT') ? noGrokError() : msg))
    })
    child.on('close', (code) => finish(code ?? 1))
  })
}

export async function listOfficialWorktrees(cwd?: string | null): Promise<WorktreeState> {
  const dir = cwd && existsSync(cwd) ? cwd : process.cwd()
  const bin = findGrokBinary()
  if (!bin) {
    return {
      items: [],
      error: noGrokError(),
      emptyNote: null,
      raw: '',
      loading: false
    }
  }
  try {
    const jsonRun = await runGrok(bin, ['worktree', 'list', '--json'], dir)
    const raw = (jsonRun.stdout || jsonRun.stderr || '').trim()
    if (jsonRun.code === 0) {
      const items = parseWorktreeListJson(jsonRun.stdout).map(expandRow)
      if (items.length || /\[\s*\]/.test(jsonRun.stdout) || /no worktrees found/i.test(raw)) {
        return {
          items,
          error: null,
          emptyNote: worktreeEmptyNote(items.length, raw || 'No worktrees found.'),
          raw: jsonRun.stdout,
          loading: false
        }
      }
    }
    const textRun = await runGrok(bin, ['worktree', 'list'], dir)
    const text = textRun.stdout || textRun.stderr
    const parsed = parseWorktreeListText(text)
    if (textRun.code !== 0 && !parsed.items.length) {
      return {
        items: [],
        error: (text || '').trim() || `grok worktree list 失败（退出码 ${textRun.code}）`,
        emptyNote: null,
        raw: text,
        loading: false
      }
    }
    return {
      items: parsed.items.map(expandRow),
      error: null,
      emptyNote: worktreeEmptyNote(parsed.items.length, text),
      raw: text,
      loading: false
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { items: [], error: message, emptyNote: null, raw: '', loading: false }
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function expandRow(row: WorktreeRow): WorktreeRow {
  const home = homedir()
  return {
    ...row,
    path: expandUserPath(row.path, home),
    repo: expandUserPath(row.repo, home)
  }
}

function unwrapExt(raw: unknown): unknown {
  let cur = raw
  for (let i = 0; i < 4; i++) {
    const rec = asRecord(cur)
    if (!rec) return cur
    if (rec.error != null && rec.error !== '') {
      const err = rec.error
      throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
    }
    if ('result' in rec && rec.result !== undefined) {
      cur = rec.result
      continue
    }
    return cur
  }
  return cur
}

type AcpRpc = {
  request: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>
}

function openAcpRpc(
  bin: string,
  cwd: string
): Promise<{ rpc: AcpRpc; close: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, buildAcpStdioArgs(), {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams
    let buf = ''
    let nextId = 1
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
    >()
    let closed = false

    const close = () => {
      if (closed) return
      closed = true
      for (const [, p] of pending) {
        clearTimeout(p.timer)
        p.reject(new Error('acp closed'))
      }
      pending.clear()
      killChild(child)
    }

    const onLine = (line: string) => {
      const t = line.trim()
      if (!t.startsWith('{')) return
      let msg: {
        id?: number
        method?: string
        result?: unknown
        error?: { message?: string; code?: number; data?: unknown }
        params?: unknown
      }
      try {
        msg = JSON.parse(t) as typeof msg
      } catch {
        return
      }
      if (msg.method && msg.id != null) {
        replyAcpRequest(child, msg.id, msg.method, msg.params)
        return
      }
      if (msg.id == null || !pending.has(msg.id)) return
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) {
        const extra = msg.error.data != null ? ` ${JSON.stringify(msg.error.data)}` : ''
        p.reject(new Error(`${msg.error.message ?? 'rpc error'}${extra}`))
        return
      }
      p.resolve(msg.result)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    })
    child.on('error', (err) => {
      if (!closed) reject(err)
    })
    child.on('exit', () => {
      if (!closed) {
        for (const [, p] of pending) {
          clearTimeout(p.timer)
          p.reject(new Error('acp exited'))
        }
        pending.clear()
      }
    })

    const request = (method: string, params?: unknown, timeoutMs = ACP_TIMEOUT_MS) => {
      if (closed) return Promise.reject(new Error('acp closed'))
      const id = nextId++
      return new Promise<unknown>((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          rej(new Error(`rpc timeout ${method}`))
        }, timeoutMs)
        pending.set(id, { resolve: res, reject: rej, timer })
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (err) => {
          if (err) {
            pending.delete(id)
            clearTimeout(timer)
            rej(err)
          }
        })
      })
    }

    resolve({ rpc: { request }, close })
  })
}

async function bootAcp(rpc: AcpRpc): Promise<void> {
  const init = await rpc.request(
    'initialize',
    buildInitializeParams({ clientVersion: 'workbench-worktree' }),
    30_000
  )
  const { methods, defaultAuthMethodId } = parseAuthMethods(init)
  const methodId = pickAuthMethodId(methods, {
    defaultAuthMethodId,
    hasApiKeyEnv: Boolean(process.env.XAI_API_KEY?.trim())
  })
  if (methodId) {
    await rpc.request('authenticate', buildAuthenticateParams(methodId), 60_000)
  }
}

async function withAcp<T>(cwd: string, fn: (rpc: AcpRpc) => Promise<T>): Promise<T> {
  const bin = findGrokBinary()
  if (!bin) throw new Error(noGrokError())
  const { rpc, close } = await openAcpRpc(bin, cwd)
  try {
    await bootAcp(rpc)
    return await fn(rpc)
  } finally {
    close()
  }
}

function cleanLabel(raw?: string): string | undefined {
  const t = (raw ?? '').trim().replace(/[^\w.\u4e00-\u9fff-]+/g, '-').replace(/-+/g, '-').slice(0, 40)
  return t || undefined
}

export type CreatedWorktree = {
  worktreePath: string
  sessionCwd: string
  sessionId: string
  label?: string
}

function replyAcpRequest(
  child: ChildProcessWithoutNullStreams,
  id: number,
  method: string,
  params: unknown
): void {
  const write = (payload: unknown) => {
    try {
      child.stdin.write(`${JSON.stringify(payload)}\n`)
    } catch {
      /* */
    }
  }
  if (method.includes('request_permission')) {
    write({
      jsonrpc: '2.0',
      id,
      result: { outcome: { outcome: 'selected', optionId: 'allow-once' } }
    })
    return
  }
  if (method.includes('read_text_file')) {
    const rec = asRecord(params)
    const path = rec && typeof rec.path === 'string' ? rec.path : ''
    try {
      write({ jsonrpc: '2.0', id, result: { content: readFileSync(path, 'utf8') } })
    } catch (err) {
      write({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err instanceof Error ? err.message : String(err) }
      })
    }
    return
  }
  write({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no' } })
}

export async function createOfficialWorktree(opts: {
  sourcePath: string
  label?: string
}): Promise<CreatedWorktree> {
  const sourcePath = opts.sourcePath.trim()
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error('要先打开一个 git 仓库文件夹，才能开隔离会话（官方 grok -w）')
  }
  const sessionId = randomUUID()
  const label = cleanLabel(opts.label)
  const raw = await withAcp(sourcePath, (rpc) =>
    rpc.request(
      'x.ai/git/worktree/create_from_worktree_sync',
      {
        sourceWorktreePath: sourcePath,
        newSessionId: sessionId,
        copyMode: 'dirty',
        ...(label ? { label } : {})
      },
      ACP_TIMEOUT_MS
    )
  )
  const body = asRecord(unwrapExt(raw)) ?? asRecord(raw)
  const path = pickCreatedWorktreePath(body)
  if (!path) {
    throw new Error(`官方建隔离目录没回路径。${JSON.stringify(raw).slice(0, 240)}`)
  }
  const sourceGitRoot =
    (body && typeof body.sourceGitRoot === 'string' && body.sourceGitRoot) ||
    (body && typeof body.source_git_root === 'string' && body.source_git_root) ||
    null
  return {
    worktreePath: path,
    sessionCwd: sessionCwdInWorktree({ worktreePath: path, sourcePath, sourceGitRoot }),
    sessionId:
      (body && typeof body.newSessionId === 'string' && body.newSessionId) ||
      (body && typeof body.new_session_id === 'string' && body.new_session_id) ||
      sessionId,
    label
  }
}

export type ForkedSession = {
  newSessionId: string
  newCwd: string
  parentSessionId: string
}

export async function forkOfficialSession(opts: {
  sourceSessionId: string
  sourceCwd: string
  newCwd: string
  sessionKind?: string
  sourceWorkspaceDir?: string
}): Promise<ForkedSession> {
  const sourceSessionId = opts.sourceSessionId.trim()
  if (!sourceSessionId) throw new Error('分叉要一条 CLI 会话 id')
  const sourceCwd = opts.sourceCwd.trim()
  const newCwd = opts.newCwd.trim() || sourceCwd
  if (!sourceCwd) throw new Error('这条会话没有目录，分不了')
  const raw = await withAcp(sourceCwd, (rpc) =>
    rpc.request(
      'x.ai/session/fork',
      {
        sourceSessionId,
        sourceCwd,
        newCwd,
        sessionKind: opts.sessionKind ?? 'fork',
        ...(opts.sourceWorkspaceDir ? { sourceWorkspaceDir: opts.sourceWorkspaceDir } : {})
      },
      ACP_TIMEOUT_MS
    )
  )
  const body = asRecord(unwrapExt(raw)) ?? asRecord(raw)
  const newSessionId =
    (body && typeof body.newSessionId === 'string' && body.newSessionId) ||
    (body && typeof body.new_session_id === 'string' && body.new_session_id) ||
    ''
  if (!newSessionId) {
    throw new Error(`官方分叉没回新会话 id。${JSON.stringify(raw).slice(0, 240)}`)
  }
  const cwd =
    (body && typeof body.newCwd === 'string' && body.newCwd) ||
    (body && typeof body.new_cwd === 'string' && body.new_cwd) ||
    newCwd
  return {
    newSessionId,
    newCwd: cwd,
    parentSessionId: sourceSessionId
  }
}

const HOUSEKEEP_OK = new Set(['rm', 'gc', 'show', 'detach', 'salvage', 'clean-artifacts', 'db'])

export async function runWorktreeHousekeep(opts: {
  argv: string[]
  cwd?: string | null
  confirm: boolean
}): Promise<{ ok: boolean; stdout: string; error?: string }> {
  const argv = opts.argv.map((a) => String(a).trim()).filter(Boolean)
  const sub = argv[0] ?? ''
  if (!HOUSEKEEP_OK.has(sub)) {
    return { ok: false, stdout: '', error: `官方 grok worktree 没有 ${sub || '(空)'}。破坏性用 rm / gc。` }
  }
  const destructive = sub === 'rm' || sub === 'gc'
  if (destructive && !opts.confirm) {
    return {
      ok: false,
      stdout: '',
      error:
        sub === 'rm'
          ? '删隔离目录要确认。窗上点确认，或：workbench worktree rm <id> --yes'
          : 'gc 要确认。窗上点确认，或：workbench worktree gc --yes'
    }
  }
  const bin = findGrokBinary()
  if (!bin) return { ok: false, stdout: '', error: noGrokError() }
  const dir = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()
  try {
    const ran = await runGrok(bin, ['worktree', ...argv], dir, 60_000)
    const text = (ran.stdout || ran.stderr || '').trim()
    if (ran.code !== 0) {
      return { ok: false, stdout: ran.stdout, error: text || `grok worktree ${argv.join(' ')} 失败` }
    }
    return { ok: true, stdout: ran.stdout }
  } catch (err) {
    return { ok: false, stdout: '', error: err instanceof Error ? err.message : String(err) }
  }
}

export function formatWorktreeRows(items: WorktreeRow[]): string {
  if (!items.length) return 'No worktrees found.\n'
  const lines = items.map((r) => {
    const label = r.label ?? '—'
    const branch = r.branch ?? '(detached)'
    return `${r.id}  ${r.kind}  ${r.repo || '—'}  ${label}  ${branch}  ${r.path}`
  })
  return `${lines.join('\n')}\n`
}
