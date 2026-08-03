/**
 * Routines 下次运行时间计算（纯函数，T018）
 * 本地时区；不补跑错过的触发点；cron 本轮不做。
 */
import type { RoutineTrigger } from './routine-types.js'

function parseHHmm(time: string | undefined): { h: number; m: number } | null {
  if (time == null || typeof time !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

/** daily：今天 HH:mm 若已过则明天 */
export function nextDailyAt(time: string | undefined, fromMs: number): number | null {
  const p = parseHHmm(time)
  if (!p) return null
  const from = new Date(fromMs)
  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), p.h, p.m, 0, 0)
  if (candidate.getTime() <= fromMs) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate.getTime()
}

/** weekly：下一 weekday + HH:mm（weekday 0=周日 … 6=周六） */
export function nextWeeklyAt(
  weekday: number | undefined,
  time: string | undefined,
  fromMs: number
): number | null {
  if (weekday == null || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
  const p = parseHHmm(time)
  if (!p) return null
  const from = new Date(fromMs)
  for (let add = 0; add <= 7; add++) {
    const d = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + add,
      p.h,
      p.m,
      0,
      0
    )
    if (d.getDay() === weekday && d.getTime() > fromMs) return d.getTime()
  }
  return null
}

/**
 * interval：自 lastFireMs（无则 fromMs）起每 everyMinutes 分钟。
 * 跳过已过时刻，落到最近未来（不补跑）。
 */
export function nextIntervalAt(
  everyMinutes: number | undefined,
  fromMs: number,
  lastFireMs?: number | null
): number | null {
  if (everyMinutes == null || !Number.isFinite(everyMinutes) || everyMinutes < 1) return null
  const period = Math.floor(everyMinutes) * 60 * 1000
  if (period < 60_000) return null
  let next = (lastFireMs != null && Number.isFinite(lastFireMs) ? lastFireMs : fromMs) + period
  // 应用关着错过的点：只跳到未来，不连环补跑
  while (next <= fromMs) next += period
  // 防极端循环
  if (next <= fromMs) return fromMs + period
  return next
}

/** 单触发器下一次；非法触发器返回 null */
export function nextTriggerAt(
  trigger: RoutineTrigger,
  fromMs: number,
  lastFireMs?: number | null
): number | null {
  if (!trigger || typeof trigger !== 'object') return null
  switch (trigger.kind) {
    case 'daily':
      return nextDailyAt(trigger.time, fromMs)
    case 'weekly':
      return nextWeeklyAt(trigger.weekday, trigger.time, fromMs)
    case 'interval':
      return nextIntervalAt(trigger.everyMinutes, fromMs, lastFireMs)
    default:
      return null
  }
}

/**
 * 多触发器取最早未来时刻。
 * lastFireMs 仅 interval 用（通常取最近一次 run.startedAt）。
 */
export function computeNextRunAt(
  triggers: RoutineTrigger[] | undefined,
  fromMs: number,
  lastFireMs?: number | null
): number | undefined {
  if (!Array.isArray(triggers) || triggers.length === 0) return undefined
  let best: number | undefined
  for (const t of triggers) {
    const n = nextTriggerAt(t, fromMs, lastFireMs)
    if (n == null) continue
    if (best == null || n < best) best = n
  }
  return best
}
