/**
 * 会话级 PTY（node-pty）。不可用时 available=false，主路径不崩。
 * 仅在 main 进程使用；renderer 经 IPC。
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { detectDefaultShell } from '@perigee/host-core'

const require = createRequire(import.meta.url)

export type PtyChunkHandler = (sessionId: string, chunk: string) => void
export type PtyExitHandler = (sessionId: string, exitCode: number | null) => void

type PtyHandle = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  pid: number
}

type PtyModule = {
  spawn: (
    file: string,
    args: string[] | string,
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: NodeJS.ProcessEnv
    }
  ) => {
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    kill: () => void
    pid: number
    onData: (cb: (data: string) => void) => void
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void
  }
}

function tryLoadPty(): { mod: PtyModule | null; reason?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node-pty') as PtyModule
    if (typeof mod.spawn !== 'function') {
      return { mod: null, reason: 'node-pty.spawn 不可用' }
    }
    return { mod }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { mod: null, reason: `node-pty 加载失败: ${msg}` }
  }
}

export class PtyService {
  private sessions = new Map<string, PtyHandle>()
  private mod: PtyModule | null
  private loadReason?: string
  readonly shell: string

  constructor(
    private onChunk: PtyChunkHandler,
    private onExit: PtyExitHandler
  ) {
    const loaded = tryLoadPty()
    this.mod = loaded.mod
    this.loadReason = loaded.reason
    this.shell = detectDefaultShell()
  }

  availability(): {
    pty: boolean
    reason?: string
    shell: string
    fallback: 'shell-c' | 'echo'
  } {
    return {
      pty: !!this.mod,
      reason: this.mod ? undefined : this.loadReason ?? 'node-pty 不可用',
      shell: this.shell,
      fallback: 'shell-c'
    }
  }

  isAlive(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  /** lazy spawn；已存在则 no-op */
  attach(
    sessionId: string,
    cwd: string,
    size?: { cols: number; rows: number }
  ): { ok: boolean; reason?: string } {
    if (!this.mod) return { ok: false, reason: this.loadReason ?? 'pty_unavailable' }
    if (this.sessions.has(sessionId)) return { ok: true }
    if (!cwd || !existsSync(cwd)) return { ok: false, reason: 'bad_cwd' }

    const cols = size?.cols ?? 80
    const rows = size?.rows ?? 24
    try {
      const term = this.mod.spawn(this.shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: process.env.COLORTERM || 'truecolor',
          HOME: process.env.HOME || process.env.USERPROFILE || homedir(),
          USERPROFILE: process.env.USERPROFILE || process.env.HOME || homedir()
        }
      })
      term.onData((data) => this.onChunk(sessionId, data))
      term.onExit(({ exitCode }) => {
        this.sessions.delete(sessionId)
        this.onExit(sessionId, exitCode ?? null)
      })
      this.sessions.set(sessionId, {
        write: (d) => term.write(d),
        resize: (c, r) => term.resize(c, r),
        kill: () => {
          try {
            term.kill()
          } catch {
            /* */
          }
        },
        pid: term.pid
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  write(sessionId: string, data: string): { ok: boolean; reason?: string } {
    const s = this.sessions.get(sessionId)
    if (!s) return { ok: false, reason: 'not_attached' }
    try {
      s.write(data)
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  resize(sessionId: string, cols: number, rows: number): { ok: boolean; reason?: string } {
    const s = this.sessions.get(sessionId)
    if (!s) return { ok: false, reason: 'not_attached' }
    if (cols < 2 || rows < 1) return { ok: false, reason: 'bad_size' }
    try {
      s.resize(cols, rows)
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.kill()
    this.sessions.delete(sessionId)
  }

  dispose(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}
