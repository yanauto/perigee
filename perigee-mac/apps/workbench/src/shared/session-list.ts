import type { Session } from './types.js'

function preferSession(a: Session, b: Session, activeId: string | null): Session {
  if (a.id === activeId) return a
  if (b.id === activeId) return b
  if (a.messages.length !== b.messages.length) {
    return a.messages.length >= b.messages.length ? a : b
  }
  if (a.kind === 'cli' && b.kind !== 'cli') return a
  if (b.kind === 'cli' && a.kind !== 'cli') return b
  return a
}

export function preferCliSession(a: Session, b: Session, activeId: string | null): Session {
  return preferSession(a, b, activeId)
}

/** 同一 CLI id 只留一条，避免本机窗再插一条克隆。 */
export function dedupeSessions(list: Session[], activeId: string | null): Session[] {
  const kept = new Map<string, Session>()
  const out: Session[] = []
  for (const s of list) {
    const cli = (s.cliSessionId || (s.kind === 'cli' ? s.id : '') || '').trim()
    if (!cli) {
      out.push(s)
      continue
    }
    const prev = kept.get(cli)
    if (!prev) {
      kept.set(cli, s)
      out.push(s)
      continue
    }
    const win = preferSession(prev, s, activeId)
    if (win === s) {
      const i = out.indexOf(prev)
      if (i >= 0) out[i] = s
      kept.set(cli, s)
    }
  }
  return out
}
