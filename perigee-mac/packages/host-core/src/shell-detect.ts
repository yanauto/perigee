/**
 * 默认交互/ shell-c 用 shell 探测（PTY 与 ShellRunner 共用）。
 * Win：pwsh → Windows PowerShell → COMSPEC/cmd
 * Unix：SHELL → zsh → bash → sh
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function detectDefaultShell(): string {
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const local = process.env.LOCALAPPDATA || ''
    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows'
    const candidates = [
      join(pf, 'PowerShell', '7', 'pwsh.exe'),
      join(pf, 'PowerShell', '7-preview', 'pwsh.exe'),
      join(local, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      process.env.COMSPEC || join(systemRoot, 'System32', 'cmd.exe')
    ]
    for (const c of candidates) {
      if (c && existsSync(c)) return c
    }
    return process.env.COMSPEC || 'cmd.exe'
  }

  const sh = process.env.SHELL
  if (sh && existsSync(sh)) return sh
  if (existsSync('/bin/zsh')) return '/bin/zsh'
  if (existsSync('/bin/bash')) return '/bin/bash'
  return '/bin/sh'
}

/** 是否 PowerShell 族（决定 shell-c 参数形态） */
export function isPowerShellPath(shell: string): boolean {
  const base = shell.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  return base === 'pwsh.exe' || base === 'pwsh' || base === 'powershell.exe' || base === 'powershell'
}

/** shell-c 参数：一行命令 */
export function shellCommandArgs(shell: string, line: string): string[] {
  if (process.platform === 'win32') {
    if (isPowerShellPath(shell)) {
      return ['-NoProfile', '-Command', line]
    }
    return ['/d', '/s', '/c', line]
  }
  return ['-c', line]
}
