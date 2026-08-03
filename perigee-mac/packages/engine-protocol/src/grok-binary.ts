/**
 * Grok CLI 可执行文件解析（全仓唯一实现）。
 * host-core / engine-grok-* / main 均应从此 re-export 或直接 import，禁止再抄一份。
 */
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** `GROK_HOME` 或默认 `~/.grok` */
export function grokHome(): string {
  return process.env.GROK_HOME?.trim() || join(homedir(), '.grok')
}

/**
 * 探测本机 grok 二进制：
 * GROK_BINARY → $GROK_HOME/bin/grok(.exe) →（非 win）Homebrew/usr/local → PATH `grok`
 */
export function resolveGrokBinary(): string {
  const homeBin = join(grokHome(), 'bin')
  const candidates: string[] = [process.env.GROK_BINARY].filter(Boolean) as string[]

  if (process.platform === 'win32') {
    candidates.push(
      join(homeBin, 'grok.exe'),
      join(homeBin, 'grok'),
      'grok.exe',
      'grok'
    )
  } else {
    candidates.push(
      join(homeBin, 'grok'),
      '/opt/homebrew/bin/grok',
      '/usr/local/bin/grok',
      'grok'
    )
  }

  for (const c of candidates) {
    try {
      if (c === 'grok' || c === 'grok.exe') return c
      try {
        accessSync(c, constants.X_OK)
        return c
      } catch {
        if (existsSync(c)) return c
      }
    } catch {
      /* try next */
    }
  }
  return process.platform === 'win32'
    ? join(homeBin, 'grok.exe')
    : join(homeBin, 'grok')
}
