/** 工具行计量：diff +/- 、结果行数、耗时（由 call/result 时间戳派生，不升 schema）。 */

export function diffLineStats(result: string): { plus: number; minus: number } | null {
  let plus = 0
  let minus = 0
  let hunks = 0
  for (const line of result.split('\n')) {
    if (line.startsWith('@@')) hunks += 1
    else if (line.startsWith('+') && !line.startsWith('+++')) plus += 1
    else if (line.startsWith('-') && !line.startsWith('---')) minus += 1
  }
  if (plus === 0 && minus === 0) return null
  if (hunks === 0 && plus + minus < 2) return null
  return { plus, minus }
}

export function toolDurationMs(startedTs: string, endedTs: string): number | undefined {
  const a = Date.parse(startedTs)
  const b = Date.parse(endedTs)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined
  return b - a
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

export function formatToolMeter(
  block: { status: string; result?: string; durationMs?: number },
  t: (s: string) => string
): string {
  if (block.status === 'running') return '…'
  const parts: string[] = []
  const diff = block.result ? diffLineStats(block.result) : null
  if (diff) parts.push(`+${diff.plus} −${diff.minus}`)
  else if (block.result) {
    const n = block.result.split('\n').length
    parts.push(`${n} ${t('行')}`)
  }
  if (block.durationMs != null && block.durationMs > 0) {
    parts.push(formatDurationShort(block.durationMs))
  }
  return parts.join(' · ')
}
