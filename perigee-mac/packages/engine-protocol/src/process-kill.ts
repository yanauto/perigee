/**
 * 跨平台进程树清理（引擎 cancel / shell kill 共用）。
 * - Unix：优先杀进程组（spawn 时 detached 才可靠），失败则杀自身
 * - Windows：taskkill /T 杀树；SIGKILL 等价加 /F
 */
import { spawnSync, type ChildProcess } from 'node:child_process'

export type KillSignal = 'SIGTERM' | 'SIGKILL'

export function killProcessTree(
  child: ChildProcess | { pid?: number; kill?: (signal?: NodeJS.Signals) => boolean },
  signal: KillSignal = 'SIGTERM'
): void {
  const pid = child.pid
  if (pid == null || pid <= 0) return

  if (process.platform === 'win32') {
    const args = ['/pid', String(pid), '/T']
    if (signal === 'SIGKILL') args.push('/F')
    try {
      spawnSync('taskkill', args, { stdio: 'ignore', windowsHide: true })
    } catch {
      try {
        if (typeof child.kill === 'function') child.kill()
      } catch {
        /* */
      }
    }
    return
  }

  try {
    process.kill(-pid, signal)
  } catch {
    try {
      if (typeof child.kill === 'function') child.kill(signal)
      else process.kill(pid, signal)
    } catch {
      /* */
    }
  }
}
