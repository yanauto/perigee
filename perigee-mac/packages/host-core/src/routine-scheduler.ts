/**
 * Routines 调度器（T018）
 * 应用运行期间到点触发；不补跑错过点；启停/编辑即时重排。
 */
import { computeNextRunAt } from './routine-schedule.js'
import { RoutineStore } from './routine-store.js'
import {
  type Routine,
  type RoutineCreateInput,
  type RoutinePatch,
  type RoutineRun,
  type RoutineView
} from './routine-types.js'

export type RoutineFireResult = {
  sessionId: string
  status: 'ok' | 'fail'
  summary?: string
  durationMs: number
}

/** main 注入：真正开会话、发指令、等轮次结束 */
export type RoutineFireHandler = (routine: Routine) => Promise<RoutineFireResult>

export type RoutineSchedulerOptions = {
  store: RoutineStore
  onFire: RoutineFireHandler
  /** 系统通知（routine.notify === true 时） */
  notify?: (title: string, body: string) => void
  /** 可注入时钟（测） */
  now?: () => number
  /** 可注入 setTimeout（测） */
  setTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (id: ReturnType<typeof setTimeout>) => void
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export class RoutineScheduler {
  private store: RoutineStore
  private onFire: RoutineFireHandler
  private notifyFn?: (title: string, body: string) => void
  private nowFn: () => number
  private setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  private clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void

  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private nextFireAt = new Map<string, number>()
  private inflight = new Set<string>()
  private listeners = new Set<(routines: RoutineView[]) => void>()
  private started = false

  constructor(opts: RoutineSchedulerOptions) {
    this.store = opts.store
    this.onFire = opts.onFire
    this.notifyFn = opts.notify
    this.nowFn = opts.now ?? (() => Date.now())
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimeoutFn = opts.clearTimeout ?? ((id) => clearTimeout(id))
  }

  /** 启动：恢复全部 enabled 的调度 */
  start(): void {
    if (this.started) return
    this.started = true
    this.rescheduleAll()
  }

  stop(): void {
    this.started = false
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
    this.nextFireAt.clear()
  }

  onChanged(cb: (routines: RoutineView[]) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emitChanged(): void {
    const list = this.list()
    for (const cb of this.listeners) {
      try {
        cb(list)
      } catch {
        /* ignore listener errors */
      }
    }
  }

  list(): RoutineView[] {
    const now = this.nowFn()
    return this.store.list().map((r) => this.toView(r, now))
  }

  get(id: string): RoutineView | undefined {
    const r = this.store.get(id)
    if (!r) return undefined
    return this.toView(r, this.nowFn())
  }

  private toView(r: Routine, now: number): RoutineView {
    const view: RoutineView = {
      ...r,
      runs: [...r.runs],
      triggers: [...r.triggers],
      mcpServers: [...r.mcpServers]
    }
    if (r.enabled) {
      const scheduled = this.nextFireAt.get(r.id)
      if (scheduled != null && scheduled > now) {
        view.nextRunAt = scheduled
      } else {
        const lastFire = r.runs[0]?.startedAt
        view.nextRunAt = computeNextRunAt(r.triggers, now, lastFire)
      }
    }
    return view
  }

  create(input: RoutineCreateInput): RoutineView {
    const r = this.store.create(input)
    if (this.started) this.rescheduleOne(r)
    this.emitChanged()
    return this.toView(this.store.get(r.id)!, this.nowFn())
  }

  update(id: string, patch: RoutinePatch): RoutineView {
    const r = this.store.update(id, patch)
    if (this.started) this.rescheduleOne(r)
    this.emitChanged()
    return this.toView(this.store.get(id)!, this.nowFn())
  }

  remove(id: string): void {
    this.clearTimer(id)
    this.nextFireAt.delete(id)
    this.store.remove(id)
    this.emitChanged()
  }

  toggle(id: string, enabled: boolean): RoutineView {
    return this.update(id, { enabled })
  }

  /** 立即执行；不依赖 enabled（手动触发） */
  async runNow(id: string): Promise<{ runId: string; sessionId: string }> {
    const r = this.store.get(id)
    if (!r) throw new Error(`routine not found: ${id}`)
    const result = await this.execute(r, { manual: true })
    // 手动跑完后若 enabled 则按新 lastFire 重排
    if (this.started) {
      const fresh = this.store.get(id)
      if (fresh) this.rescheduleOne(fresh)
    }
    this.emitChanged()
    return { runId: result.runId, sessionId: result.sessionId }
  }

  private rescheduleAll(): void {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
    this.nextFireAt.clear()
    for (const r of this.store.list()) {
      this.rescheduleOne(r)
    }
  }

  private rescheduleOne(r: Routine): void {
    this.clearTimer(r.id)
    this.nextFireAt.delete(r.id)
    if (!r.enabled || !this.started) return
    const now = this.nowFn()
    const lastFire = r.runs[0]?.startedAt
    const next = computeNextRunAt(r.triggers, now, lastFire)
    if (next == null) return
    this.nextFireAt.set(r.id, next)
    const delay = Math.max(0, next - now)
    // setTimeout 32-bit 上限约 24.8 天；超长则分段
    const capped = Math.min(delay, 2_147_000_000)
    const timer = this.setTimeoutFn(() => {
      this.timers.delete(r.id)
      void this.onTimer(r.id)
    }, capped)
    this.timers.set(r.id, timer)
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id)
    if (t != null) {
      this.clearTimeoutFn(t)
      this.timers.delete(id)
    }
  }

  private async onTimer(routineId: string): Promise<void> {
    const r = this.store.get(routineId)
    if (!r || !r.enabled) {
      this.nextFireAt.delete(routineId)
      return
    }
    const now = this.nowFn()
    const scheduled = this.nextFireAt.get(routineId)
    // 分段 setTimeout：尚未到点则继续等
    if (scheduled != null && scheduled > now + 50) {
      this.rescheduleOne(r)
      return
    }
    try {
      await this.execute(r, { manual: false })
    } finally {
      const fresh = this.store.get(routineId)
      if (fresh && this.started) this.rescheduleOne(fresh)
      this.emitChanged()
    }
  }

  private async execute(
    r: Routine,
    opts: { manual: boolean }
  ): Promise<{ runId: string; sessionId: string }> {
    if (this.inflight.has(r.id)) {
      throw new Error(`routine 正在执行: ${r.id}`)
    }
    this.inflight.add(r.id)
    const startedAt = this.nowFn()
    const runId = newRunId()
    let sessionId = ''
    let status: 'ok' | 'fail' = 'fail'
    let summary: string | undefined
    let durationMs = 0
    try {
      const result = await this.onFire(r)
      sessionId = result.sessionId
      status = result.status
      summary = result.summary
      durationMs =
        typeof result.durationMs === 'number' && Number.isFinite(result.durationMs)
          ? Math.max(0, Math.round(result.durationMs))
          : Math.max(0, this.nowFn() - startedAt)
    } catch (e) {
      summary = e instanceof Error ? e.message : String(e)
      durationMs = Math.max(0, this.nowFn() - startedAt)
      sessionId = sessionId || `failed_${runId}`
    } finally {
      this.inflight.delete(r.id)
    }

    const run: RoutineRun = {
      id: runId,
      sessionId,
      startedAt,
      durationMs,
      status,
      summary
    }
    try {
      this.store.prependRun(r.id, run)
    } catch {
      /* store 竞态删了 routine：忽略 */
    }

    if (r.notify && this.notifyFn) {
      const title = `Routine · ${r.name}`
      const body =
        status === 'ok'
          ? summary?.slice(0, 120) || `完成 · ${Math.round(durationMs / 1000)}s`
          : `失败 · ${(summary ?? 'unknown').slice(0, 100)}`
      try {
        this.notifyFn(title, body)
      } catch {
        /* */
      }
    }

    void opts
    return { runId, sessionId }
  }

  /** 测试/诊断：当前计划触发时刻 */
  peekNextFireAt(id: string): number | undefined {
    return this.nextFireAt.get(id)
  }

  isInflight(id: string): boolean {
    return this.inflight.has(id)
  }
}
