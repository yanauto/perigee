import type { RoutineRun, RoutineTrigger, RoutineView } from './perigee-api'

/**
 * Routines 展示层纯函数（T019）：触发器人话、下次运行、运行记录时刻与时长、侧栏状态点。
 * 只读 T018 契约字段（docs/API-preload.md），不自造任何字段；语言参数走 i18n 的 'zh' | 'en'。
 */

export type Lang = 'zh' | 'en'

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad2 = (n: number): string => String(n).padStart(2, '0')

const hhmm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/** 单个触发器的人话描述：daily「每天 08:00」weekly「每周一 09:00」interval「每 30 分钟」 */
export function describeTrigger(tr: RoutineTrigger, lang: Lang = 'zh'): string {
  if (tr.kind === 'interval') {
    const m = tr.everyMinutes ?? 0
    if (m >= 60 && m % 60 === 0) {
      const h = m / 60
      return lang === 'en' ? `Every ${h}h` : `每 ${h} 小时`
    }
    return lang === 'en' ? `Every ${m}min` : `每 ${m} 分钟`
  }
  const time = tr.time ?? '00:00'
  if (tr.kind === 'weekly') {
    const idx = ((tr.weekday ?? 0) % 7 + 7) % 7
    return lang === 'en' ? `${WEEKDAY_EN[idx]}s ${time}` : `每${WEEKDAY_ZH[idx]} ${time}`
  }
  return lang === 'en' ? `Daily ${time}` : `每天 ${time}`
}

/** 多个触发器：中文顿号 / 英文逗号连接；空列表给「未设置」 */
export function describeTriggers(triggers: RoutineTrigger[], lang: Lang = 'zh'): string {
  if (triggers.length === 0) return lang === 'en' ? 'No trigger' : '未设置触发器'
  return triggers.map((t) => describeTrigger(t, lang)).join(lang === 'en' ? ', ' : '、')
}

/** 下次运行时刻：今天 / 明天 / M/D + HH:mm；无值（停用）→ null */
export function formatNextRun(
  nextRunAt: number | undefined,
  now: number = Date.now(),
  lang: Lang = 'zh'
): string | null {
  if (nextRunAt == null) return null
  const d = new Date(nextRunAt)
  const dayDiff = calendarDayDiff(new Date(now), d)
  const time = hhmm(d)
  if (dayDiff === 0) return lang === 'en' ? `Today ${time}` : `今天 ${time}`
  if (dayDiff === 1) return lang === 'en' ? `Tomorrow ${time}` : `明天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** 运行记录时刻：今天 / 昨天 / M/D + HH:mm */
export function formatRunTime(
  startedAt: number,
  now: number = Date.now(),
  lang: Lang = 'zh'
): string {
  const d = new Date(startedAt)
  const dayDiff = calendarDayDiff(d, new Date(now))
  const time = hhmm(d)
  if (dayDiff === 0) return lang === 'en' ? `Today ${time}` : `今天 ${time}`
  if (dayDiff === 1) return lang === 'en' ? `Yesterday ${time}` : `昨天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** 时长：<1s / 42s / 3m20s */
export function formatRunDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

/** 自然日之差（b 比 a 晚几天；同日 = 0） */
function calendarDayDiff(a: Date, b: Date): number {
  const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const d1 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((d1 - d0) / 86_400_000)
}

/** 最近一次运行（runs 新在前） */
export function latestRun(routine: RoutineView): RoutineRun | null {
  return routine.runs[0] ?? null
}

/**
 * 侧栏状态点（T019）：
 * - running：最近一次运行开出的会话此刻仍在跑（由调用方用真实会话状态判定，不猜）
 * - fail：最近一次运行失败
 * - idle：其余（含从未运行）
 */
export function routineDotState(
  routine: RoutineView,
  isSessionRunning: (sessionId: string) => boolean
): 'running' | 'fail' | 'idle' {
  const run = latestRun(routine)
  if (!run) return 'idle'
  if (isSessionRunning(run.sessionId)) return 'running'
  return run.status === 'fail' ? 'fail' : 'idle'
}

/** 新建 Routine 的空表单默认值（工作区跟当前打开的仓库走） */
export function emptyTrigger(kind: RoutineTrigger['kind']): RoutineTrigger {
  if (kind === 'interval') return { kind, everyMinutes: 60 }
  if (kind === 'weekly') return { kind, time: '09:00', weekday: 1 }
  return { kind, time: '09:00' }
}
