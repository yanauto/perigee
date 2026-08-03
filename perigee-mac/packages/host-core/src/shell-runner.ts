/**
 * 会话 cwd 下的命令执行器（E 波次 feature-flag）。
 * 非完整交互式 PTY：每行一次 spawn，stdout/stderr 流式回写。
 * 避免引入 node-pty 原生依赖；flag 关则 UI 仍走 echo。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { killProcessTree } from '@perigee/engine-protocol'
import { detectDefaultShell, shellCommandArgs } from './shell-detect.js'

export type ShellChunkHandler = (sessionId: string, chunk: string) => void

export class ShellRunner {
  private procs = new Map<string, ChildProcess>()
  private enabled = false
  readonly shell: string

  constructor(private onChunk: ShellChunkHandler, shell?: string) {
    this.shell = shell ?? detectDefaultShell()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) {
      for (const [id] of this.procs) this.kill(id)
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isRunning(sessionId: string): boolean {
    return this.procs.has(sessionId)
  }

  /** 在 cwd 下跑一行命令；返回是否真正 spawn */
  run(sessionId: string, cwd: string, line: string): { ok: boolean; reason?: string } {
    if (!this.enabled) return { ok: false, reason: 'pty_disabled' }
    const cmd = line.trim()
    if (!cmd) return { ok: false, reason: 'empty' }
    if (!cwd || !existsSync(cwd)) return { ok: false, reason: 'bad_cwd' }

    this.kill(sessionId)

    this.onChunk(sessionId, `› ${cmd}\n`)
    const args = shellCommandArgs(this.shell, cmd)

    const child = spawn(this.shell, args, {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.procs.set(sessionId, child)

    const pump = (buf: Buffer) => {
      this.onChunk(sessionId, buf.toString('utf8'))
    }
    child.stdout?.on('data', pump)
    child.stderr?.on('data', pump)
    child.on('close', (code) => {
      this.procs.delete(sessionId)
      this.onChunk(sessionId, `\n[exit ${code ?? '?'}]\n`)
    })
    child.on('error', (e) => {
      this.procs.delete(sessionId)
      this.onChunk(sessionId, `\n[error] ${e.message}\n`)
    })
    return { ok: true }
  }

  kill(sessionId: string): void {
    const p = this.procs.get(sessionId)
    if (!p) return
    try {
      killProcessTree(p, 'SIGTERM')
    } catch {
      /* */
    }
    // 强杀兜底（Win taskkill /F；Unix SIGKILL）
    setTimeout(() => {
      try {
        if (this.procs.get(sessionId) === p || p.exitCode == null) {
          killProcessTree(p, 'SIGKILL')
        }
      } catch {
        /* */
      }
    }, 500)
    this.procs.delete(sessionId)
  }

  dispose(): void {
    for (const id of [...this.procs.keys()]) this.kill(id)
  }
}
