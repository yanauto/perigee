/**
 * 5 字段 cron（分 时 日 月 周）下一次触发。本地时区；周 0 与 7 均为周日。
 */
export type CronFields = {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
}

function parseField(raw: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  const parts = raw.split(',')
  if (parts.length === 0) return null
  for (const part of parts) {
    const [rangeRaw, stepRaw] = part.split('/')
    if (!rangeRaw) return null
    const step = stepRaw == null || stepRaw === '' ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step < 1) return null
    let start: number
    let end: number
    if (rangeRaw === '*') {
      start = min
      end = max
    } else if (rangeRaw.includes('-')) {
      const [a, b] = rangeRaw.split('-')
      start = Number(a)
      end = Number(b)
    } else {
      start = end = Number(rangeRaw)
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null
    if (start < min || end > max || start > end) return null
    for (let n = start; n <= end; n += step) out.add(n)
  }
  return out.size > 0 ? out : null
}

/** 解析 5 字段 cron；非法返回 null */
export function parseCron(expr: string | undefined): CronFields | null {
  if (expr == null || typeof expr !== 'string') return null
  const bits = expr.trim().split(/\s+/)
  if (bits.length !== 5) return null
  const minute = parseField(bits[0]!, 0, 59)
  const hour = parseField(bits[1]!, 0, 23)
  const dom = parseField(bits[2]!, 1, 31)
  const month = parseField(bits[3]!, 1, 12)
  const dowRaw = parseField(bits[4]!, 0, 7)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  const dow = new Set<number>()
  for (const d of dowRaw) dow.add(d === 7 ? 0 : d)
  return { minute, hour, dom, month, dow }
}

function matches(f: CronFields, d: Date): boolean {
  if (!f.minute.has(d.getMinutes())) return false
  if (!f.hour.has(d.getHours())) return false
  if (!f.month.has(d.getMonth() + 1)) return false
  const domOk = f.dom.has(d.getDate())
  const dowOk = f.dow.has(d.getDay())
  const domStar = f.dom.size === 31
  const dowStar = f.dow.size === 7
  if (domStar && dowStar) return true
  if (!domStar && !dowStar) return domOk || dowOk
  if (!domStar) return domOk
  return dowOk
}

/** 下一分钟起（不含 fromMs 当分钟）最多向前搜 366 天 */
export function nextCronAt(expr: string | undefined, fromMs: number): number | null {
  const f = parseCron(expr)
  if (!f) return null
  const d = new Date(fromMs)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  const limit = 366 * 24 * 60
  for (let i = 0; i < limit; i++) {
    if (matches(f, d)) return d.getTime()
    d.setMinutes(d.getMinutes() + 1)
  }
  return null
}
