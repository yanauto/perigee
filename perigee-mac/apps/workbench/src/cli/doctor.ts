/**
 * 本机 Grok / ACP 探测。不发 prompt，不建会话，不打印密钥。
 * 找二进制的顺序与 @perigee/engine-protocol 的 resolveGrokBinary 对齐。
 * 本文件不 import 那个包：CLI 是裸 node，包入口是 .ts。
 */
import { execFileSync, spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatInspectSummary, parseInspectOutput, sanitizeInspectText, type InspectResult } from '../shared/inspect.js'

type Probe = { ok: boolean; detail: string }

function grokHome(): string {
  return process.env.GROK_HOME?.trim() || join(homedir(), '.grok')
}

function canRun(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return existsSync(path)
  }
}

function whichGrok(): string | null {
  try {
    const out = execFileSync('/usr/bin/which', ['grok'], {
      encoding: 'utf8',
      env: process.env
    }).trim()
    return out && existsSync(out) ? out : null
  } catch {
    return null
  }
}

function findGrok(): { path: string | null; looked: string[] } {
  const homeBin = join(grokHome(), 'bin')
  const looked: string[] = []
  const envBin = process.env.GROK_BINARY?.trim()
  const candidates = [
    envBin,
    join(homeBin, 'grok'),
    '/opt/homebrew/bin/grok',
    '/usr/local/bin/grok'
  ].filter((x): x is string => Boolean(x))

  for (const c of candidates) {
    looked.push(c)
    if (canRun(c)) return { path: c, looked }
  }
  looked.push('PATH grok')
  const fromPath = whichGrok()
  if (fromPath) return { path: fromPath, looked }
  return { path: null, looked }
}

function sanitize(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-…')
    .replace(/xai-[A-Za-z0-9_-]+/g, 'xai-…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'apikey=…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function parseRpcLine(line: string): {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
} | null {
  const t = line.trim()
  if (!t.startsWith('{')) return null
  try {
    const msg = JSON.parse(t) as {
      id?: number
      result?: Record<string, unknown>
      error?: { message?: string }
    }
    return msg && typeof msg === 'object' ? msg : null
  } catch {
    return null
  }
}

function probeAcp(bin: string, timeoutMs = 15000): Promise<Probe> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(bin, ['--no-auto-update', 'agent', 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }
    })

    const finish = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
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
      resolve({ ok, detail })
    }

    const timer = setTimeout(() => finish(false, 'initialize 超时'), timeoutMs)
    child.on('error', (err) => finish(false, sanitize(err.message)))
    child.on('exit', (code) => {
      if (!settled) finish(false, `进程退出 code=${code ?? '?'}`)
    })

    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const msg = parseRpcLine(line)
        if (!msg || msg.id !== 1) continue
        if (msg.error) {
          finish(false, sanitize(String(msg.error.message ?? 'initialize 失败')))
          return
        }
        const pv = msg.result?.protocolVersion
        finish(true, pv != null ? `initialize ok  protocol=${String(pv)}` : 'initialize ok')
      }
    })

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false
        },
        clientInfo: { name: 'perigee', version: 'workbench-doctor' },
        _meta: {
          clientType: 'perigee',
          clientSource: 'perigee',
          clientVersion: 'workbench-doctor',
          startupHints: { nonInteractive: true }
        }
      }
    }
    child.stdin.write(`${JSON.stringify(req)}\n`, (err) => {
      if (err) finish(false, sanitize(err.message))
    })
  })
}

async function probeFlyby(): Promise<{ ok: boolean; detail: string }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch('http://127.0.0.1:19527/v1/ping', { signal: ctrl.signal })
    clearTimeout(t)
    const body = await res.text()
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    let ext = false
    try {
      const j = JSON.parse(body) as { extension_connected?: boolean; version?: string }
      ext = j.extension_connected === true
      return {
        ok: ext,
        detail: ext
          ? `bridge v${j.version ?? '?'} · 扩展已连接`
          : `bridge v${j.version ?? '?'} · 扩展未连接`
      }
    } catch {
      return { ok: false, detail: body.slice(0, 120) }
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === 'AbortError'
          ? '探测超时（bridge 未起）'
          : e.message
        : String(e)
    return { ok: false, detail: msg }
  }
}

function runInspect(bin: string): InspectResult {
  const cwd = process.cwd()
  const tryOnce = (withJson: boolean): InspectResult => {
    try {
      const stdout = execFileSync(bin, ['--no-auto-update', '--cwd', cwd, 'inspect', ...(withJson ? ['--json'] : [])], {
        encoding: 'utf8',
        timeout: 25000,
        cwd,
        env: { ...process.env, NO_COLOR: '1' },
        maxBuffer: 8_000_000
      })
      const parsed = parseInspectOutput(stdout)
      if (parsed) {
        return { ok: true, report: parsed.report, format: parsed.format, bin, cwd }
      }
      return {
        ok: false,
        error: '无法解析 grok inspect 输出',
        code: 'parse-failed',
        detail: sanitizeInspectText(stdout).slice(0, 160),
        bin,
        cwd
      }
    } catch (err) {
      let msg = err instanceof Error ? err.message : String(err)
      if (err && typeof err === 'object' && 'stderr' in err) {
        const stderr = (err as { stderr?: unknown }).stderr
        if (typeof stderr === 'string' && stderr.trim()) msg = stderr
      }
      return {
        ok: false,
        error: sanitizeInspectText(msg).slice(0, 160),
        code: 'inspect-failed',
        bin,
        cwd
      }
    }
  }
  const jsonFirst = tryOnce(true)
  if (jsonFirst.ok) return jsonFirst
  const text = tryOnce(false)
  return text.ok ? text : jsonFirst
}

export async function runDoctor(): Promise<void> {
  const found = findGrok()
  if (!found.path) {
    console.log('grok: no')
    console.log(`looked: ${found.looked.join(', ')}`)
    console.log('acp:  no   没有 grok')
    for (const line of formatInspectSummary({
      ok: false,
      error: '没有 grok',
      code: 'no-cli'
    })) {
      console.log(line)
    }
    const flyby = await probeFlyby()
    console.log(`flyby: ${flyby.ok ? 'yes' : 'no '}  ${flyby.detail}`)
    process.exitCode = 1
    return
  }
  console.log(`grok: yes  ${found.path}`)
  const acp = await probeAcp(found.path)
  console.log(`acp:  ${acp.ok ? 'yes' : 'no '}  ${acp.detail}`)
  const inspect = runInspect(found.path)
  for (const line of formatInspectSummary(inspect)) console.log(line)
  const flyby = await probeFlyby()
  console.log(`flyby: ${flyby.ok ? 'yes' : 'no '}  ${flyby.detail}`)
  if (!acp.ok || !inspect.ok) process.exitCode = 1
}

const thisFile = fileURLToPath(import.meta.url)
const launched = process.argv[1] ? resolvePath(process.argv[1]) : ''
if (launched && thisFile === launched) {
  void runDoctor()
}
