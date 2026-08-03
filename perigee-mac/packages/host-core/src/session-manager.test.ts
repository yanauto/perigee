import { describe, expect, it, vi } from 'vitest'
import type { AgentEngine, UserMessage } from '@perigee/engine-protocol'
import type { SessionEvent } from '@perigee/event-schema'
import { EventBus } from './event-bus.js'
import { SessionManager } from './session-manager.js'

function makeStubEngine() {
  const handlers = new Set<(e: SessionEvent) => void>()
  let busy = false
  const sent: string[] = []
  const engine: AgentEngine = {
    id: 'stub',
    displayName: 'stub',
    async startSession() {
      return { sessionId: 'x', engineId: 'stub' }
    },
    async send(_id: string, msg: UserMessage) {
      busy = true
      sent.push(msg.text)
      // 同步模拟结束后 idle（由测试手动 emit 更可控时再改）
      busy = false
    },
    async cancel() {},
    onEvent(cb) {
      handlers.add(cb)
      return () => handlers.delete(cb)
    }
  }
  return {
    engine,
    sent,
    emit(ev: SessionEvent) {
      for (const h of handlers) h(ev)
    },
    isBusy: () => busy
  }
}

describe('SessionManager · 边跑边纠正队列', () => {
  it('空闲时直接投递引擎', async () => {
    const stub = makeStubEngine()
    const bus = new EventBus()
    const events: SessionEvent[] = []
    bus.subscribe((e) => events.push(e))
    const sm = new SessionManager(stub.engine, bus)
    const rec = await sm.create('/tmp/ws', { title: 't' })
    await sm.send(rec.id, 'hello')
    expect(stub.sent).toEqual(['hello'])
    expect(events.some((e) => e.type === 'user.message' && (e as { text: string }).text === 'hello')).toBe(
      true
    )
  })

  it('T021：一次 send 恰好一条 user.message（Host 侧只 publish 一次）', async () => {
    const stub = makeStubEngine()
    const bus = new EventBus()
    const events: SessionEvent[] = []
    bus.subscribe((e) => events.push(e))
    const sm = new SessionManager(stub.engine, bus)
    const rec = await sm.create('/tmp/ws', { title: 't' })
    await sm.send(rec.id, 'once only')
    const um = events.filter((e) => e.type === 'user.message')
    expect(um).toHaveLength(1)
    expect((um[0] as { text: string }).text).toBe('once only')
  })

  it('忙碌时入队，idle 后投递 engineText', async () => {
    const handlers = new Set<(e: SessionEvent) => void>()
    const gate: { resolve: (() => void) | null } = { resolve: null }
    const sent: string[] = []
    const engine: AgentEngine = {
      id: 'stub',
      displayName: 'stub',
      async startSession(opts) {
        return { sessionId: opts.sessionId, engineId: 'stub' }
      },
      async send(sessionId, msg) {
        sent.push(msg.text)
        // 保持 streaming，直到测试 emit idle
        for (const h of handlers) {
          h({
            type: 'session.status',
            schemaVersion: 3,
            sessionId,
            id: 'st1',
            ts: new Date().toISOString(),
            status: 'streaming'
          })
        }
        await new Promise<void>((r) => {
          gate.resolve = r
        })
        for (const h of handlers) {
          h({
            type: 'session.status',
            schemaVersion: 3,
            sessionId,
            id: 'st2',
            ts: new Date().toISOString(),
            status: 'idle'
          })
        }
      },
      async cancel() {},
      onEvent(cb) {
        handlers.add(cb)
        return () => handlers.delete(cb)
      }
    }
    const bus = new EventBus()
    const userMsgs: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'user.message') userMsgs.push((e as { text: string }).text)
    })
    const sm = new SessionManager(engine, bus)
    const rec = await sm.create('/tmp/ws', {})

    const p1 = sm.send(rec.id, 'first')
    // 等 status streaming 生效
    await vi.waitFor(() => expect(sm.get(rec.id)?.status).toBe('streaming'))

    await sm.send(rec.id, 'steer-display', 'steer-engine')
    expect(sm.pendingSteerCount(rec.id)).toBe(1)
    expect(userMsgs).toEqual(['first', 'steer-display'])
    expect(sent).toEqual(['first']) // 第二条未投递

    gate.resolve?.()
    await p1
    await vi.waitFor(() => expect(sent).toEqual(['first', 'steer-engine']))
    expect(sm.pendingSteerCount(rec.id)).toBe(0)
  })

  it('cancel 清空队列', async () => {
    const handlers = new Set<(e: SessionEvent) => void>()
    const engine: AgentEngine = {
      id: 'stub',
      displayName: 'stub',
      async startSession(opts) {
        return { sessionId: opts.sessionId, engineId: 'stub' }
      },
      async send(sessionId) {
        for (const h of handlers) {
          h({
            type: 'session.status',
            schemaVersion: 3,
            sessionId,
            id: 's',
            ts: new Date().toISOString(),
            status: 'streaming'
          })
        }
        await new Promise(() => {}) // never
      },
      async cancel() {},
      onEvent(cb) {
        handlers.add(cb)
        return () => handlers.delete(cb)
      }
    }
    const sm = new SessionManager(engine, new EventBus())
    const rec = await sm.create('/tmp/ws', {})
    void sm.send(rec.id, 'a')
    await vi.waitFor(() => expect(sm.get(rec.id)?.status).toBe('streaming'))
    await sm.send(rec.id, 'b')
    expect(sm.pendingSteerCount(rec.id)).toBe(1)
    await sm.cancel(rec.id)
    expect(sm.pendingSteerCount(rec.id)).toBe(0)
  })
})
