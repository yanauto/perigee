import type { RoutineRow, RoutineRunRow } from './types.js'

export function cronOf(triggers: { kind: string; expr?: string }[] | undefined): string {
  if (!Array.isArray(triggers)) return ''
  const t = triggers.find((x) => x.kind === 'cron' && typeof x.expr === 'string' && x.expr.trim())
  return t?.expr?.trim() ?? ''
}

export function formatWhen(ts?: number): string {
  if (ts == null || !Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function toRoutineRow(
  r: {
    id: string
    name: string
    instruction: string
    enabled: boolean
    nextRunAt?: number
    triggers: { kind: string; expr?: string }[]
    runs: RoutineRunRow[]
  },
  running: boolean
): RoutineRow {
  const last = r.runs[0]
  return {
    id: r.id,
    name: r.name,
    instruction: r.instruction,
    cron: cronOf(r.triggers),
    enabled: r.enabled,
    nextRunAt: r.nextRunAt,
    lastRunAt: last?.startedAt,
    lastStatus: last?.status,
    lastSummary: last?.summary,
    lastSessionId: last?.sessionId,
    running,
    runs: r.runs.map((x) => ({ ...x }))
  }
}
