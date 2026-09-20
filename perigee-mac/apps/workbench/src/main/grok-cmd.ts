/**
 * 包一层官方 `grok <子命令>`。不嵌 TUI，不走 `grok -p`。
 * 增删开关走官方 mcp/plugin；登录/退出走官方 login/logout。不直接改 ~/.grok。
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { ipcMain } from 'electron'
import { resolveGrokBinary } from '@perigee/engine-protocol'
import {
  grokCmdErrorText,
  LOGIN_NOTE,
  planGrokCmd,
  takeConfirm,
  type GrokCmdRequest,
  type GrokCmdResult
} from '../shared/grok-cmd'
import { formatInspectAgents, planExtra } from './grok-extra'
import { executeLoopPlan, planLoops } from './grok-loops'

export type GrokCmdApp = {
  server: Server
  getCwd: () => string | null
}

const TIMEOUT_MS = 30_000
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    ...CORS
  })
  res.end(data)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let n = 0
    req.on('data', (c: Buffer) => {
      n += c.length
      if (n > 1_000_000) {
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

async function parseJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = (await readBody(req)).trim()
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed as Record<string, unknown>
}

function failResult(
  error: string,
  extra: Partial<GrokCmdResult> = {}
): GrokCmdResult {
  return {
    ok: false,
    code: extra.code ?? 1,
    stdout: extra.stdout ?? '',
    stderr: extra.stderr ?? '',
    cwd: extra.cwd ?? process.cwd(),
    cwdSource: extra.cwdSource ?? 'process',
    argv: extra.argv ?? [],
    error,
    note: extra.note
  }
}

function resolveCwd(opened: string | null | undefined): {
  cwd: string
  cwdSource: 'workspace' | 'process'
} {
  if (opened && existsSync(opened)) {
    return { cwd: opened, cwdSource: 'workspace' }
  }
  return { cwd: process.cwd(), cwdSource: 'process' }
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

function runGrok(
  bin: string,
  argv: string[],
  cwd: string,
  timeoutMs = TIMEOUT_MS
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
      if (err) {
        reject(err)
        return
      }
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
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
      finish(1, new Error(`grok ${argv.join(' ')} 超时（${timeoutMs / 1000}s）`))
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (c: string) => {
      stdout += c
    })
    child.stderr?.setEncoding('utf8')
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

function startLogin(
  bin: string,
  argv: string[],
  cwd: string,
  cwdSource: 'workspace' | 'process',
  waitMs: number
): Promise<GrokCmdResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(bin, argv, {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })

    const done = (result: GrokCmdResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      try {
        child.unref()
      } catch {
        /* */
      }
      const text = (stdout || stderr).trim()
      done({
        ok: true,
        code: 0,
        stdout: text ? `${text}\n` : '',
        stderr: '',
        cwd,
        cwdSource,
        argv,
        note: LOGIN_NOTE
      })
    }, waitMs)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (c: string) => {
      stdout += c
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (c: string) => {
      stderr += c
    })
    child.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      done(
        failResult(msg.includes('ENOENT') ? noGrokError() : msg, {
          cwd,
          cwdSource,
          argv,
          stdout,
          stderr
        })
      )
    })
    child.on('close', (code) => {
      const text = (stderr || stdout).trim()
      if ((code ?? 1) !== 0) {
        done(
          failResult(text || `grok ${argv.join(' ')} 失败（退出码 ${code ?? 1}）`, {
            code: code ?? 1,
            stdout,
            stderr,
            cwd,
            cwdSource,
            argv
          })
        )
        return
      }
      done({
        ok: true,
        code: 0,
        stdout,
        stderr,
        cwd,
        cwdSource,
        argv,
        note: text || LOGIN_NOTE
      })
    })
  })
}

function messageResult(
  extra: { ok: boolean; text: string; argv: string[] },
  cwd: string,
  cwdSource: 'workspace' | 'process'
): GrokCmdResult {
  if (extra.ok) {
    return {
      ok: true,
      code: 0,
      stdout: extra.text.endsWith('\n') ? extra.text : `${extra.text}\n`,
      stderr: '',
      cwd,
      cwdSource,
      argv: extra.argv,
      note: extra.text
    }
  }
  return failResult(extra.text, { cwd, cwdSource, argv: extra.argv, stdout: extra.text })
}

async function runInspectAgents(
  bin: string,
  cwd: string,
  cwdSource: 'workspace' | 'process'
): Promise<GrokCmdResult> {
  try {
    const ran = await runGrok(bin, ['inspect', '--json'], cwd)
    if (ran.code !== 0) {
      const text = (ran.stderr || ran.stdout || '').trim()
      return failResult(text || 'grok inspect --json 失败，列不出子 agent。', {
        code: ran.code,
        stdout: ran.stdout,
        stderr: ran.stderr,
        cwd,
        cwdSource,
        argv: ['inspect', '--json']
      })
    }
    const formatted = formatInspectAgents(ran.stdout)
    if (!formatted.ok) {
      return failResult(formatted.error, { cwd, cwdSource, argv: ['inspect', '--json'] })
    }
    return {
      ok: true,
      code: 0,
      stdout: formatted.stdout,
      stderr: '',
      cwd,
      cwdSource,
      argv: ['inspect', '--json'],
      note: '官方没有 grok subagent；列表来自 grok inspect --json 的 agents'
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return failResult(message, { cwd, cwdSource, argv: ['inspect', '--json'] })
  }
}

export async function executeGrokCmd(
  raw: string[],
  opened: string | null | undefined,
  opts?: { confirm?: boolean }
): Promise<GrokCmdResult> {
  const { cwd, cwdSource } = resolveCwd(opened)
  const stripped = takeConfirm(raw)
  const confirmed = opts?.confirm === true || stripped.confirm
  const extra = planExtra(stripped.args)
  if (extra?.kind === 'message') {
    return messageResult(extra, cwd, cwdSource)
  }
  const loops = planLoops(stripped.args)
  if (loops) return executeLoopPlan(loops, cwd, cwdSource)

  let argv: string[]
  let timeoutMs = TIMEOUT_MS
  let loginDetach = false
  if (extra?.kind === 'run') {
    argv = extra.argv
    timeoutMs = extra.timeoutMs ?? TIMEOUT_MS
  } else if (extra?.kind === 'inspect-agents') {
    const bin = findGrokBinary()
    if (!bin) return failResult(noGrokError(), { cwd, cwdSource, argv: ['subagent'] })
    return runInspectAgents(bin, cwd, cwdSource)
  } else {
    const planned = planGrokCmd(stripped.args)
    if (planned.kind === 'error') {
      return failResult(planned.error, { cwd, cwdSource, argv: stripped.args })
    }
    if (planned.needsConfirm && !confirmed) {
      return failResult(planned.confirmHint || '这会改本机 Grok。确认后加上 --yes。', {
        cwd,
        cwdSource,
        argv: planned.argv,
        note: planned.confirmHint
      })
    }
    argv = planned.argv
    timeoutMs = planned.timeoutMs ?? TIMEOUT_MS
    loginDetach = planned.loginDetach === true
  }

  const bin = findGrokBinary()
  if (!bin) {
    return failResult(noGrokError(), { cwd, cwdSource, argv })
  }

  if (loginDetach) {
    return startLogin(bin, argv, cwd, cwdSource, timeoutMs)
  }

  try {
    const ran = await runGrok(bin, argv, cwd, timeoutMs)
    const text = (ran.stderr || ran.stdout).trim()
    if (ran.code !== 0) {
      const human = grokCmdErrorText({
        error: text || `grok ${argv.join(' ')} 失败（退出码 ${ran.code}）`,
        stdout: ran.stdout,
        stderr: ran.stderr
      })
      return failResult(human, {
        code: ran.code,
        stdout: ran.stdout,
        stderr: ran.stderr,
        cwd,
        cwdSource,
        argv
      })
    }
    return {
      ok: true,
      code: 0,
      stdout: ran.stdout,
      stderr: ran.stderr,
      cwd,
      cwdSource,
      argv,
      note: argv[0] === 'login' ? LOGIN_NOTE : undefined
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return failResult(grokCmdErrorText({ error: message, stdout: '', stderr: '' }), {
      cwd,
      cwdSource,
      argv
    })
  }
}

function parseCmdInput(body: Record<string, unknown>, url: URL, method: string): {
  args: string[]
  confirm: boolean
} {
  if (method === 'GET') {
    const q = url.searchParams.get('cmd') || url.searchParams.get('args') || ''
    let args = q
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const extra = url.searchParams.getAll('arg')
    if (extra.length) args = extra
    const confirm =
      url.searchParams.get('confirm') === '1' ||
      url.searchParams.get('yes') === '1' ||
      args.includes('--yes') ||
      args.includes('-y')
    return { args, confirm }
  }
  let args: string[] = []
  if (Array.isArray(body.args)) args = body.args.map(String)
  else if (typeof body.cmd === 'string') {
    args = [body.cmd, ...((body.args as string[]) || [])]
  }
  return { args, confirm: body.confirm === true }
}

async function handleGrokCmd(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  opened: string | null
): Promise<void> {
  req.setTimeout(20 * 60 * 1000)
  const method = req.method || 'GET'
  const body = method === 'GET' ? {} : await parseJson(req)
  const { args, confirm } = parseCmdInput(body, url, method)
  const result = await executeGrokCmd(args, opened, { confirm })
  writeJson(res, result.ok ? 200 : 400, { ...result, ok: result.ok })
}

let cwdFn: () => string | null = () => null

function registerGrokCmdIpc(): void {
  try {
    ipcMain.removeHandler('wb:grok-cmd')
  } catch {
    /* 第一次注册 */
  }
  ipcMain.handle('wb:grok-cmd', (_e, extra: unknown) => {
    const rec = extra && typeof extra === 'object' ? (extra as GrokCmdRequest) : { args: [] }
    const args = Array.isArray(rec.args) ? rec.args.map(String) : []
    return executeGrokCmd(args, cwdFn(), { confirm: rec.confirm === true })
  })
}

registerGrokCmdIpc()

/** 挂在控制面末尾：只加 /grok/cmd，不加 inspect。 */
export function registerGrokCmdRoutes(app: GrokCmdApp): void {
  cwdFn = app.getCwd
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
    if (method === 'OPTIONS' && url.pathname === '/grok/cmd') {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if ((method === 'GET' || method === 'POST') && url.pathname === '/grok/cmd') {
      void handleGrokCmd(req, res, url, app.getCwd()).catch((err) => {
        writeJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      })
      return
    }
    for (const fn of previous) fn.call(app.server, req, res)
  })
}
