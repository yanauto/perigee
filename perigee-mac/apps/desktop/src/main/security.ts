import { shell } from 'electron'
import { resolveGrokBinary, validateGrokBinary } from '@perigee/host-core'

/** 仅允许 http(s) 外链（setWindowOpenHandler 与 shell:openExternal 共用） */
export function openExternalSafe(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      void shell.openExternal(u.toString())
      return true
    }
  } catch {
    /* */
  }
  return false
}

/** settings.grokBinary → 可 spawn 路径；非法则回落默认 */
export function resolveEngineBinary(settingsGrokBinary: string): string {
  const v = validateGrokBinary(settingsGrokBinary)
  if (!v.ok) {
    console.warn('[perigee] invalid grokBinary, fallback default:', v.reason)
    return resolveGrokBinary()
  }
  return v.path
}
