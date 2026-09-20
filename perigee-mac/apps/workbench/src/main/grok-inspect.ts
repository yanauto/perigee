/**
 * 跑本机 `grok inspect`。优先 `--json`，没有再解析文本。
 * 失败诚实返回，不假装成功。不打印密钥、不读配置正文。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { GrokAcpEngine } from '@perigee/engine-grok-acp'
import { resolveGrokBinary } from '@perigee/engine-protocol'
import { parseInspectOutput, sanitizeInspectText, type InspectResult } from '../shared/inspect'

const TIMEOUT_MS = 25000
const MAX_BYTES = 8_000_000

export type InspectControlApp = {
  server: Server
  getCwd: () => string | null
}

type Cache = { key: string; result: InspectResult }
type Inflight = { key: string; promise: Promise<InspectResult> }

let cache: Cache | null = null
let inflight: Inflight | null = null

function inspectCwd(cwd?: string | null): string {
  const trimmed = cwd?.trim()
  return trimmed || process.cwd()
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
    let bytes = 0
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
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > MAX_BYTES) {
        killChild(child)
        finish(1)
        return
      }
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 8000) stderr = stderr.slice(0, 8000)
    })
    child.on('close', (code) => finish(code))
  })
}

async function runGrokInspectUncached(cwd: string): Promise<InspectResult> {
  const bin = resolveGrokBinary()
  if (!GrokAcpEngine.isAvailable(bin)) {
    return {
      ok: false,
      error: '本机没有 Grok CLI',
      code: 'no-cli',
      bin,
      cwd
    }
  }

  const tryOnce = async (withJson: boolean): Promise<InspectResult> => {
    const args = ['--no-auto-update', '--cwd', cwd, 'inspect']
    if (withJson) args.push('--json')
    let ran: { code: number | null; stdout: string; stderr: string }
    try {
      ran = await runProcess(bin, args, cwd)
    } catch (err) {
      return {
        ok: false,
        error: sanitizeInspectText(err instanceof Error ? err.message : String(err)),
        code: 'inspect-failed',
        bin,
        cwd
      }
    }

    if (ran.code == null && !ran.stdout.trim()) {
      return {
        ok: false,
        error: 'grok inspect 超时',
        code: 'inspect-failed',
        bin,
        cwd
      }
    }

    const parsed = parseInspectOutput(ran.stdout)
    if (parsed) {
      return {
        ok: true,
        report: parsed.report,
        format: parsed.format,
        bin,
        cwd
      }
    }

    const errText = sanitizeInspectText((ran.stderr || ran.stdout || 'inspect 没有可用输出').trim())
    return {
      ok: false,
      error:
        ran.code && ran.code !== 0
          ? `grok inspect 失败（exit ${ran.code}）：${errText.slice(0, 160)}`
          : `无法解析 grok inspect 输出：${errText.slice(0, 160)}`,
      code: ran.stdout.trim() ? 'parse-failed' : 'inspect-failed',
      detail: errText.slice(0, 240),
      bin,
      cwd
    }
  }

  const jsonFirst = await tryOnce(true)
  if (jsonFirst.ok) return jsonFirst
  if (jsonFirst.code === 'no-cli' || jsonFirst.code === 'inspect-failed') {
    if (jsonFirst.error.includes('超时') || jsonFirst.error.includes('本机没有')) return jsonFirst
  }
  const text = await tryOnce(false)
  if (text.ok) return text
  return jsonFirst.error.includes('无法解析') ? text : jsonFirst
}

export function runGrokInspect(opts?: { cwd?: string | null; force?: boolean }): Promise<InspectResult> {
  const key = inspectCwd(opts?.cwd)
  if (!opts?.force && cache && cache.key === key) return Promise.resolve(cache.result)
  if (!opts?.force && inflight && inflight.key === key) return inflight.promise

  const promise = runGrokInspectUncached(key).then((result) => {
    cache = { key, result }
    if (inflight?.promise === promise) inflight = null
    return result
  })
  inflight = { key, promise }
  return promise
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  })
  res.end(data)
}

/** 挂在控制面末尾：只加 /inspect，不加 models|mcp|plugin。 */
export function registerInspectRoutes(app: InspectControlApp): void {
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
    if (method === 'GET' && url.pathname === '/inspect') {
      const cwdParam = url.searchParams.get('cwd')
      const force = url.searchParams.get('fresh') === '1'
      const cwd = cwdParam && cwdParam.trim() ? cwdParam : app.getCwd()
      void runGrokInspect({ cwd, force })
        .then((result) => writeJson(res, result.ok ? 200 : 503, result))
        .catch((err) =>
          writeJson(res, 500, {
            ok: false,
            error: sanitizeInspectText(err instanceof Error ? err.message : String(err)),
            code: 'inspect-failed'
          })
        )
      return
    }
    for (const fn of previous) fn.call(app.server, req, res)
  })
}
