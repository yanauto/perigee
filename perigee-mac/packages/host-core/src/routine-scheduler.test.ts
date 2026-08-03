import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { RoutineStore } from './routine-store.js'
import { RoutineScheduler } from './routine-scheduler.js'
import type { Routine } from './routine-types.js'

function tmpPath(): string {
  return join(tmpdir(), `rtn-sched-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

describe('RoutineScheduler', () => {
  it('start 后 interval 到点触发 onFire，写 runs，重排 nextRunAt', async () => {
    const path = tmpPath()
    const store = new RoutineStore(path)
    let now = 1_000_000
    const timers: Array<{ fn: () => void; ms: number; id: number }> = []
    let tid = 1
    const fired: string[] = []

    const sched = new RoutineScheduler({
      store,
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = tid++
        timers.push({ fn, ms, id })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === (id as unknown as number))
        if (i >= 0) timers.splice(i, 1)
      },
      onFire: async (r: Routine) => {
        fired.push(r.id)
        return {
          sessionId: 'ses_mock_1',
          status: 'ok',
          summary: 'mock done',
          durationMs: 1234
        }
      }
    })

    const r = sched.create({
      name: '每分钟',
      instruction: 'ping',
      enabled: true,
      workspace: '/tmp/ws',
      model: 'grok-4.5',
      triggers: [{ kind: 'interval', everyMinutes: 1 }],
      mcpServers: [],
      notify: false
    })
    sched.start()
    expect(sched.peekNextFireAt(r.id)).toBe(now + 60_000)
    expect(sched.list()[0]!.nextRunAt).toBe(now + 60_000)

    // 模拟到点
    expect(timers).toHaveLength(1)
    expect(timers[0]!.ms).toBe(60_000)
    now = now + 60_000
    const t0 = timers[0]!
    timers.splice(0, 1)
    await t0.fn()
    // 等 async execute
    await vi.waitFor(() => expect(fired).toEqual([r.id]))

    const after = store.get(r.id)!
    expect(after.runs).toHaveLength(1)
    expect(after.runs[0]!.sessionId).toBe('ses_mock_1')
    expect(after.runs[0]!.durationMs).toBe(1234)
    expect(after.runs[0]!.status).toBe('ok')
    expect(after.runs[0]!.summary).toBe('mock done')

    // 重排：以 lastFire 为锚
    const next = sched.peekNextFireAt(r.id)
    expect(next).toBe(after.runs[0]!.startedAt + 60_000)

    sched.stop()
    rmSync(path, { force: true })
  })

  it('toggle 停用后不再触发；runNow 立即执行', async () => {
    const path = tmpPath()
    const store = new RoutineStore(path)
    let now = 5_000_000
    const timers: Array<{ fn: () => void; ms: number; id: number }> = []
    let tid = 1
    let fireCount = 0

    const sched = new RoutineScheduler({
      store,
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = tid++
        timers.push({ fn, ms, id })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === (id as unknown as number))
        if (i >= 0) timers.splice(i, 1)
      },
      onFire: async () => {
        fireCount++
        return { sessionId: `ses_${fireCount}`, status: 'ok', durationMs: 10, summary: 'ok' }
      }
    })

    const r = sched.create({
      name: 't',
      instruction: 'x',
      enabled: true,
      workspace: '/tmp',
      model: '',
      triggers: [{ kind: 'interval', everyMinutes: 1 }],
      mcpServers: [],
      notify: false
    })
    sched.start()
    expect(timers.length).toBe(1)

    sched.toggle(r.id, false)
    expect(sched.peekNextFireAt(r.id)).toBeUndefined()
    expect(timers.length).toBe(0)
    expect(sched.list()[0]!.nextRunAt).toBeUndefined()

    const rn = await sched.runNow(r.id)
    expect(rn.sessionId).toBe('ses_1')
    expect(fireCount).toBe(1)
    expect(store.get(r.id)!.runs[0]!.sessionId).toBe('ses_1')
    // runNow 不因 disabled 而失败；但停用后 timer 仍不排
    expect(sched.peekNextFireAt(r.id)).toBeUndefined()

    sched.stop()
    rmSync(path, { force: true })
  })

  it('编辑 triggers 后 nextRunAt 即时更新', () => {
    const path = tmpPath()
    const store = new RoutineStore(path)
    // 固定：2026-08-02 10:00 周日
    const now = new Date(2026, 7, 2, 10, 0, 0, 0).getTime()
    const sched = new RoutineScheduler({
      store,
      now: () => now,
      onFire: async () => ({ sessionId: 's', status: 'ok', durationMs: 1 })
    })
    const r = sched.create({
      name: 'd',
      instruction: 'x',
      enabled: true,
      workspace: '/tmp',
      model: '',
      triggers: [{ kind: 'daily', time: '18:00' }],
      mcpServers: [],
      notify: false
    })
    sched.start()
    expect(sched.list()[0]!.nextRunAt).toBe(new Date(2026, 7, 2, 18, 0, 0, 0).getTime())

    sched.update(r.id, { triggers: [{ kind: 'daily', time: '12:00' }] })
    expect(sched.list()[0]!.nextRunAt).toBe(new Date(2026, 7, 2, 12, 0, 0, 0).getTime())

    sched.stop()
    rmSync(path, { force: true })
  })

  it('onFire 失败仍写 fail run', async () => {
    const path = tmpPath()
    const store = new RoutineStore(path)
    const sched = new RoutineScheduler({
      store,
      onFire: async () => {
        throw new Error('engine down')
      }
    })
    const r = sched.create({
      name: 'f',
      instruction: 'x',
      enabled: false,
      workspace: '/tmp',
      model: '',
      triggers: [],
      mcpServers: [],
      notify: false
    })
    await sched.runNow(r.id)
    const run = store.get(r.id)!.runs[0]!
    expect(run.status).toBe('fail')
    expect(run.summary).toMatch(/engine down/)
    rmSync(path, { force: true })
  })
})
