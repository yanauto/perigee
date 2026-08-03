import { describe, expect, it } from 'vitest'
import type { RoutineRun, RoutineView } from './perigee-api'
import {
  describeTrigger,
  describeTriggers,
  emptyTrigger,
  formatNextRun,
  formatRunDuration,
  formatRunTime,
  latestRun,
  routineDotState
} from './routines'

const at = (y: number, m: number, d: number, hh = 0, mm = 0): number =>
  new Date(y, m - 1, d, hh, mm).getTime()

const run = (over: Partial<RoutineRun> = {}): RoutineRun => ({
  id: 'r1',
  sessionId: 's1',
  startedAt: at(2026, 8, 2, 21, 30),
  durationMs: 42_000,
  status: 'ok',
  ...over
})

const routine = (over: Partial<RoutineView> = {}): RoutineView => ({
  id: 'ro1',
  name: '夜间回归',
  instruction: 'pnpm test',
  enabled: true,
  workspace: '/repo',
  model: 'grok-4',
  triggers: [{ kind: 'daily', time: '21:30' }],
  mcpServers: [],
  notify: true,
  createdAt: at(2026, 7, 1),
  runs: [],
  ...over
})

describe('describeTrigger（T018 三种触发器 → 人话）', () => {
  it('daily', () => {
    expect(describeTrigger({ kind: 'daily', time: '08:00' })).toBe('每天 08:00')
    expect(describeTrigger({ kind: 'daily', time: '08:00' }, 'en')).toBe('Daily 08:00')
  })

  it('weekly（weekday 0–6，0 = 周日）', () => {
    expect(describeTrigger({ kind: 'weekly', time: '09:00', weekday: 1 })).toBe('每周一 09:00')
    expect(describeTrigger({ kind: 'weekly', time: '09:00', weekday: 0 }, 'en')).toBe('Suns 09:00')
  })

  it('interval：整小时折算成小时，否则用分钟', () => {
    expect(describeTrigger({ kind: 'interval', everyMinutes: 30 })).toBe('每 30 分钟')
    expect(describeTrigger({ kind: 'interval', everyMinutes: 120 })).toBe('每 2 小时')
    expect(describeTrigger({ kind: 'interval', everyMinutes: 90 }, 'en')).toBe('Every 90min')
  })

  it('缺字段不炸：daily 缺 time 回落 00:00', () => {
    expect(describeTrigger({ kind: 'daily' })).toBe('每天 00:00')
  })
})

describe('describeTriggers（多触发器）', () => {
  it('多个用顿号连接', () => {
    expect(
      describeTriggers([
        { kind: 'daily', time: '08:00' },
        { kind: 'interval', everyMinutes: 30 }
      ])
    ).toBe('每天 08:00、每 30 分钟')
  })

  it('空列表给明确文案，不给空串', () => {
    expect(describeTriggers([])).toBe('未设置触发器')
    expect(describeTriggers([], 'en')).toBe('No trigger')
  })
})

describe('formatNextRun / formatRunTime / formatRunDuration', () => {
  const now = at(2026, 8, 2, 12, 0)

  it('下次运行：今天 / 明天 / 日期', () => {
    expect(formatNextRun(at(2026, 8, 2, 21, 30), now)).toBe('今天 21:30')
    expect(formatNextRun(at(2026, 8, 3, 8, 0), now)).toBe('明天 08:00')
    expect(formatNextRun(at(2026, 8, 9, 8, 0), now)).toBe('8/9 08:00')
  })

  it('停用（nextRunAt 缺省）→ null，不编造时间', () => {
    expect(formatNextRun(undefined, now)).toBeNull()
  })

  it('运行记录时刻：今天 / 昨天 / 日期', () => {
    expect(formatRunTime(at(2026, 8, 2, 9, 5), now)).toBe('今天 09:05')
    expect(formatRunTime(at(2026, 8, 1, 21, 30), now)).toBe('昨天 21:30')
    expect(formatRunTime(at(2026, 7, 30, 21, 30), now)).toBe('7/30 21:30')
  })

  it('时长格式', () => {
    expect(formatRunDuration(500)).toBe('<1s')
    expect(formatRunDuration(42_000)).toBe('42s')
    expect(formatRunDuration(200_000)).toBe('3m20s')
    expect(formatRunDuration(0)).toBe('—')
  })
})

describe('routineDotState（侧栏状态点）', () => {
  const never = () => false

  it('从未运行 → idle', () => {
    expect(routineDotState(routine(), never)).toBe('idle')
  })

  it('最近一次失败 → fail', () => {
    expect(routineDotState(routine({ runs: [run({ status: 'fail' })] }), never)).toBe('fail')
  })

  it('会话仍在跑 → running（真实会话状态说了算，不猜）', () => {
    const r = routine({ runs: [run({ status: 'fail', sessionId: 'live' })] })
    expect(routineDotState(r, (id) => id === 'live')).toBe('running')
  })

  it('最近一次成功 → idle', () => {
    expect(routineDotState(routine({ runs: [run()] }), never)).toBe('idle')
  })

  it('latestRun 取 runs[0]（契约：新在前）', () => {
    const r = routine({ runs: [run({ id: 'new' }), run({ id: 'old' })] })
    expect(latestRun(r)?.id).toBe('new')
  })
})

describe('emptyTrigger', () => {
  it('三种默认值合法', () => {
    expect(emptyTrigger('daily')).toEqual({ kind: 'daily', time: '09:00' })
    expect(emptyTrigger('weekly')).toEqual({ kind: 'weekly', time: '09:00', weekday: 1 })
    expect(emptyTrigger('interval')).toEqual({ kind: 'interval', everyMinutes: 60 })
  })
})
