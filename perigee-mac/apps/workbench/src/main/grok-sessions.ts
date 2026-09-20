/**
 * CLI 会话账本。列表/搜索只读；删除只跑官方 `grok sessions delete`。
 * 不读 updates.jsonl，不自己删 ~/.grok 文件。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { grokHome, resolveGrokBinary } from '@perigee/engine-protocol'
import {
  clipSessionTitle,
  isSessionId,
  mergeSessionRows,
  parseSessionsListText,
  parseSessionsSearchText,
  rowMatchesQuery,
  sameCwd,
  type GrokSessionDeleteResult,
  type GrokSessionRow,
  type GrokSessionSource,
  type GrokSessionsResult
} from '../shared/grok-sessions'

export type SessionListApp = {
  server: Server
  getCwd: () => string | null
  resumeCli?: (id: string) => Promise<unknown>
  renameLocal?: (id: string, title: string) => unknown
  dropCli?: (id: string) => unknown
}

const TIMEOUT_MS = 30_000
const MAX_SUMMARY_BYTES = 256_000
const DEFAULT_LIMIT = 40

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  })
  res.end(data)
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

function noGrokError(): string {
  return '本机没有 grok。装好 Grok CLI 后再试（常见位置：~/.grok/bin/grok）。'
}

function resolveCwd(opened: string | null | undefined): string {
  if (opened && existsSync(opened)) return opened
  return process.cwd()
}

function killChild(child: ChildProcess): void {
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

function runProcess(
  bin: string,
  args: string[],
  cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      killChild(child)
      finish(null)
    }, TIMEOUT_MS)

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (c: string) => {
      stdout += c
    })
    child.stderr?.on('data', (c: string) => {
      stderr += c
    })
    child.on('close', (code) => finish(code ?? 1))
  })
}

function sessionsRoot(): string {
  return join(grokHome(), 'sessions')
}

function readSummaryMeta(summaryPath: string): GrokSessionRow | null {
  try {
    const st = statSync(summaryPath)
    if (st.size > MAX_SUMMARY_BYTES) return null
    const raw = readFileSync(summaryPath, 'utf8')
    const data = JSON.parse(raw) as {
      hidden?: boolean
      session_kind?: string
      generated_title?: string
      session_summary?: string
      created_at?: string
      updated_at?: string
      last_active_at?: string
      worktree_label?: string
      info?: { id?: string; cwd?: string }
    }
    if (data.hidden === true) return null
    if (typeof data.session_kind === 'string' && data.session_kind.startsWith('subagent')) {
      return null
    }
    const id = typeof data.info?.id === 'string' ? data.info.id : ''
    if (!isSessionId(id)) return null
    const title =
      clipSessionTitle(data.generated_title || '') ||
      clipSessionTitle(data.session_summary || '') ||
      id
    return {
      id,
      title,
      cwd: typeof data.info?.cwd === 'string' && data.info.cwd.trim() ? data.info.cwd : null,
      createdAt: typeof data.created_at === 'string' ? data.created_at : null,
      updatedAt:
        (typeof data.last_active_at === 'string' && data.last_active_at) ||
        (typeof data.updated_at === 'string' && data.updated_at) ||
        null,
      status: 'local',
      worktreeLabel:
        typeof data.worktree_label === 'string' && data.worktree_label.trim()
          ? data.worktree_label
          : null
    }
  } catch {
    return null
  }
}

/** 只 stat + 读最近 N 份 summary.json，不读 updates.jsonl。 */
function listRecentFromIndex(limit: number): GrokSessionRow[] {
  const root = sessionsRoot()
  if (!existsSync(root)) return []
  const candidates: { path: string; mtime: number }[] = []
  let cwdDirs: string[] = []
  try {
    cwdDirs = readdirSync(root)
  } catch {
    return []
  }
  for (const enc of cwdDirs) {
    if (enc.startsWith('.')) continue
    const cwdDir = join(root, enc)
    let kids: string[] = []
    try {
      if (!statSync(cwdDir).isDirectory()) continue
      kids = readdirSync(cwdDir)
    } catch {
      continue
    }
    for (const sid of kids) {
      if (!isSessionId(sid)) continue
      const summary = join(cwdDir, sid, 'summary.json')
      try {
        const st = statSync(summary)
        if (!st.isFile()) continue
        candidates.push({ path: summary, mtime: st.mtimeMs })
      } catch {
        /* 没有索引就不列 */
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  const rows: GrokSessionRow[] = []
  for (const c of candidates) {
    if (rows.length >= limit) break
    const row = readSummaryMeta(c.path)
    if (row) rows.push(row)
  }
  return rows
}

async function listFromCli(
  bin: string,
  cwd: string,
  limit: number
): Promise<{ items: GrokSessionRow[]; error?: string; argv: string[] }> {
  const argv = ['--no-auto-update', '--cwd', cwd, 'sessions', 'list', '-n', String(limit)]
  try {
    const ran = await runProcess(bin, argv, cwd)
    if (ran.code == null) {
      return { items: [], error: `grok sessions list 超时（${TIMEOUT_MS / 1000}s）`, argv }
    }
    const text = `${ran.stdout}\n${ran.stderr}`
    if (ran.code !== 0) {
      const parsed = parseSessionsListText(text)
      if (parsed.items.length || parsed.empty) return { items: parsed.items, argv }
      const err = (ran.stderr || ran.stdout || `退出码 ${ran.code}`).trim().slice(0, 200)
      return { items: [], error: err, argv }
    }
    return { items: parseSessionsListText(ran.stdout).items, argv }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { items: [], error: msg.includes('ENOENT') ? noGrokError() : msg, argv }
  }
}

async function searchFromCli(
  bin: string,
  cwd: string,
  query: string,
  limit: number
): Promise<{ items: GrokSessionRow[]; error?: string; argv: string[] }> {
  const argv = ['--no-auto-update', '--cwd', cwd, 'sessions', 'search', query, '-n', String(limit)]
  try {
    const ran = await runProcess(bin, argv, cwd)
    if (ran.code == null) {
      return { items: [], error: `grok sessions search 超时（${TIMEOUT_MS / 1000}s）`, argv }
    }
    const text = `${ran.stdout}\n${ran.stderr}`
    const parsed = parseSessionsSearchText(text)
    if (ran.code !== 0 && !parsed.items.length && !parsed.empty) {
      const err = (ran.stderr || ran.stdout || `退出码 ${ran.code}`).trim().slice(0, 200)
      return { items: [], error: err, argv }
    }
    return { items: parsed.items, argv }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { items: [], error: msg.includes('ENOENT') ? noGrokError() : msg, argv }
  }
}

export async function listGrokSessions(opts?: {
  cwd?: string | null
  limit?: number
  query?: string
}): Promise<GrokSessionsResult> {
  const query = (opts?.query ?? '').trim()
  if (query) return searchGrokSessions({ cwd: opts?.cwd, query, limit: opts?.limit })
  const cwd = resolveCwd(opts?.cwd)
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), 200)
  const bin = findGrokBinary()
  const indexItems = listRecentFromIndex(limit)
  const hasIndexDir = existsSync(sessionsRoot())

  if (!bin) {
    if (indexItems.length) {
      return {
        ok: true,
        source: 'index',
        items: indexItems.slice(0, limit),
        cwd,
        note: '没有 grok，读的是本地会话索引'
      }
    }
    return {
      ok: false,
      source: 'none',
      items: [],
      cwd,
      error: noGrokError()
    }
  }

  const cli = await listFromCli(bin, cwd, limit)
  const items = mergeSessionRows([cli.items, indexItems]).slice(0, limit)
  let source: GrokSessionSource = 'none'
  if (cli.items.length && indexItems.length) source = 'cli+index'
  else if (cli.items.length) source = 'cli'
  else if (items.length) source = 'index'

  const note =
    !cli.items.length && !cli.error && indexItems.length
      ? '官方 grok sessions list 按当前目录过滤；这里另外列了索引里最近的会话'
      : cli.error && items.length
        ? cli.error
        : undefined

  if (!items.length && cli.error && !hasIndexDir) {
    return {
      ok: false,
      source: 'none',
      items: [],
      cwd,
      command: cli.argv,
      error: cli.error
    }
  }

  return {
    ok: true,
    source,
    items,
    cwd,
    command: cli.argv,
    note,
    error: !items.length && cli.error ? cli.error : undefined
  }
}

export async function searchGrokSessions(opts: {
  cwd?: string | null
  query: string
  limit?: number
}): Promise<GrokSessionsResult> {
  const cwd = resolveCwd(opts.cwd)
  const query = opts.query.trim()
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 200)
  if (!query) return listGrokSessions({ cwd, limit })

  const bin = findGrokBinary()
  const indexHits = listRecentFromIndex(Math.max(limit, 80)).filter((row) => rowMatchesQuery(row, query))

  if (!bin) {
    if (indexHits.length) {
      return {
        ok: true,
        source: 'index',
        items: indexHits.slice(0, limit),
        cwd,
        note: '没有 grok，按标题在本地索引里搜的'
      }
    }
    return { ok: false, source: 'none', items: [], cwd, error: noGrokError() }
  }

  const cli = await searchFromCli(bin, cwd, query, limit)
  const items = mergeSessionRows([cli.items, indexHits]).slice(0, limit)
  let source: GrokSessionSource = 'none'
  if (cli.items.length && indexHits.length) source = 'cli+index'
  else if (cli.items.length) source = 'cli'
  else if (items.length) source = 'index'

  const note =
    cli.error && items.length
      ? cli.error
      : !cli.items.length && !cli.error && indexHits.length
        ? '官方 search 没搜到；这里用本地标题补了几条'
        : undefined

  if (!items.length && cli.error) {
    return { ok: false, source: 'none', items: [], cwd, command: cli.argv, error: cli.error }
  }

  return {
    ok: true,
    source,
    items,
    cwd,
    command: cli.argv,
    note,
    error: !items.length && cli.error ? cli.error : undefined
  }
}

/** 只跑官方 `grok sessions delete`。confirm 必须是 true。不自己删磁盘。 */
export async function deleteGrokSession(
  id: string,
  opts?: { cwd?: string | null; confirm?: boolean }
): Promise<GrokSessionDeleteResult> {
  const sid = id.trim()
  if (!isSessionId(sid)) {
    return { ok: false, id: sid, error: '这不是 CLI 会话 id（需要完整 UUID）' }
  }
  if (opts?.confirm !== true) {
    return { ok: false, id: sid, error: '先确认再删' }
  }
  const cwd = resolveCwd(opts?.cwd)
  const bin = findGrokBinary()
  const argv = ['--no-auto-update', '--cwd', cwd, 'sessions', 'delete', sid]
  if (!bin) return { ok: false, id: sid, command: argv, error: noGrokError() }
  try {
    const ran = await runProcess(bin, argv, cwd)
    if (ran.code == null) {
      return { ok: false, id: sid, command: argv, error: `grok sessions delete 超时（${TIMEOUT_MS / 1000}s）` }
    }
    if (ran.code !== 0) {
      const err = (ran.stderr || ran.stdout || `退出码 ${ran.code}`).trim().slice(0, 240)
      return { ok: false, id: sid, command: argv, error: err }
    }
    return { ok: true, id: sid, command: argv }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, id: sid, command: argv, error: msg.includes('ENOENT') ? noGrokError() : msg }
  }
}

/** 对照 `grok -c`：当前目录最近一条。优先官方 list（按目录过滤），不翻跨目录索引。 */
export async function recentGrokSession(cwd?: string | null): Promise<GrokSessionRow | null> {
  const dir = resolveCwd(cwd)
  const bin = findGrokBinary()
  if (bin) {
    const cli = await listFromCli(bin, dir, 5)
    const hit = cli.items[0]
    if (hit) {
      const onDisk = findGrokSessionOnDisk(hit.id)
      return {
        ...hit,
        cwd: onDisk?.cwd || hit.cwd || dir,
        title: onDisk && onDisk.title !== onDisk.id ? onDisk.title : hit.title
      }
    }
  }
  const local = listRecentFromIndex(80).filter((row) => sameCwd(row.cwd, dir))
  return local[0] ?? null
}

function cwdFromEncodedDir(enc: string): string | null {
  try {
    const decoded = decodeURIComponent(enc)
    if ((decoded.startsWith('/') || /^[A-Za-z]:[\\/]/.test(decoded)) && existsSync(decoded)) {
      return decoded
    }
  } catch {
    /* 目录名不是百分号编码 */
  }
  return null
}

/** 只读索引：按 id 找一条。不读 updates.jsonl。 */
export function findGrokSessionOnDisk(id: string): GrokSessionRow | null {
  const sid = id.trim()
  if (!isSessionId(sid)) return null
  const root = sessionsRoot()
  if (!existsSync(root)) return null
  let cwdDirs: string[] = []
  try {
    cwdDirs = readdirSync(root)
  } catch {
    return null
  }
  for (const enc of cwdDirs) {
    if (enc.startsWith('.')) continue
    const dir = join(root, enc, sid)
    let isDir = false
    try {
      isDir = statSync(dir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    const fromSummary = readSummaryMeta(join(dir, 'summary.json'))
    if (fromSummary) return fromSummary
    return {
      id: sid,
      title: sid,
      cwd: cwdFromEncodedDir(enc),
      createdAt: null,
      updatedAt: null,
      status: 'local',
      worktreeLabel: null
    }
  }
  return null
}

/** 先磁盘索引，再列表。找不到就 null。 */
export async function lookupGrokSession(
  id: string,
  opts?: { cwd?: string | null }
): Promise<GrokSessionRow | null> {
  const sid = id.trim()
  if (!isSessionId(sid)) return null
  const onDisk = findGrokSessionOnDisk(sid)
  if (onDisk) return onDisk
  const listed = await listGrokSessions({ cwd: opts?.cwd, limit: 200 })
  return listed.items.find((row) => row.id === sid) ?? null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let n = 0
    req.on('data', (c: Buffer) => {
      n += c.length
      if (n > 200_000) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = (await readBody(req)).trim()
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed as Record<string, unknown>
}

function failSessions(res: ServerResponse, err: unknown, cwd: string): void {
  writeJson(res, 500, {
    ok: false,
    source: 'none',
    items: [],
    cwd,
    error: err instanceof Error ? err.message : String(err)
  })
}

/** 挂在控制面末尾：会话列表 / 搜索 / 删除 / 续最近 / 改名。 */
export function registerSessionListRoutes(app: SessionListApp): void {
  const previous = app.server.listeners('request').slice() as Array<
    (req: IncomingMessage, res: ServerResponse) => void
  >
  app.server.removeAllListeners('request')
  app.server.on('request', (req, res) => {
    const host = req.headers.host || '127.0.0.1'
    let url: URL
    try {
      url = new URL(req.url || '/', `http://${host}`)
    } catch {
      for (const fn of previous) fn.call(app.server, req, res)
      return
    }
    const method = req.method || 'GET'
    const cwdParam = url.searchParams.get('cwd')
    const cwd = cwdParam && cwdParam.trim() ? cwdParam : app.getCwd()
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined

    if (method === 'GET' && url.pathname === '/sessions') {
      const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
      void listGrokSessions({ cwd, limit, query })
        .then((result) => writeJson(res, result.ok ? 200 : 503, result))
        .catch((err) => failSessions(res, err, cwd || process.cwd()))
      return
    }

    if (method === 'GET' && url.pathname === '/sessions/recent') {
      void recentGrokSession(cwd)
        .then((row) => {
          if (!row) {
            writeJson(res, 404, {
              ok: false,
              source: 'none',
              items: [],
              cwd: cwd || process.cwd(),
              error: '这个目录还没有 CLI 会话'
            })
            return
          }
          writeJson(res, 200, { ok: true, source: 'cli', items: [row], cwd: cwd || process.cwd(), row })
        })
        .catch((err) => failSessions(res, err, cwd || process.cwd()))
      return
    }

    if (method === 'POST' && url.pathname === '/sessions/delete') {
      void readJsonBody(req)
        .then((body) => {
          const id = String(body.id ?? body.sessionId ?? '')
          const confirm = body.confirm === true || body.yes === true
          return deleteGrokSession(id, { cwd, confirm })
        })
        .then((result) => {
          if (result.ok) {
            try {
              app.dropCli?.(result.id)
            } catch {
              /* 本机窗清不掉也不挡官方已删 */
            }
          }
          writeJson(res, result.ok ? 200 : 400, result)
        })
        .catch((err) =>
          writeJson(res, 500, {
            ok: false,
            id: '',
            error: err instanceof Error ? err.message : String(err)
          })
        )
      return
    }

    if (method === 'POST' && url.pathname === '/sessions/continue') {
      void (async () => {
        const row = await recentGrokSession(cwd)
        if (!row) throw new Error('这个目录还没有 CLI 会话')
        if (!app.resumeCli) throw new Error('续聊还没接上')
        const state = await app.resumeCli(row.id)
        return { ok: true, row, state }
      })()
        .then((result) => writeJson(res, 200, result))
        .catch((err) =>
          writeJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          })
        )
      return
    }

    if (method === 'POST' && url.pathname === '/sessions/rename') {
      void readJsonBody(req)
        .then((body) => {
          const id = String(body.id ?? '')
          const title = String(body.title ?? '')
          if (!app.renameLocal) throw new Error('改名还没接上')
          const state = app.renameLocal(id, title)
          return {
            ok: true,
            id,
            title,
            official: false as const,
            note: '官方 CLI 没有 sessions rename。只改了本机窗标题。',
            state
          }
        })
        .then((result) => writeJson(res, 200, result))
        .catch((err) =>
          writeJson(res, 400, {
            ok: false,
            official: false,
            note: '官方 CLI 没有 sessions rename。只改本机窗标题。',
            error: err instanceof Error ? err.message : String(err)
          })
        )
      return
    }

    for (const fn of previous) fn.call(app.server, req, res)
  })
}
