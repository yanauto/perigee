/**
 * T018 集成冒烟：调度触发 → SessionManager 开会话 + StubEngine 执行 → 写 runs
 * （不依赖 Electron；main 侧 fireRoutineSession 同构）
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { StubEngine } from '@perigee/engine-protocol'
import { EventBus } from './event-bus.js'
import { SessionManager } from './session-manager.js'
import { RoutineStore } from './routine-store.js'
import { RoutineScheduler } from './routine-scheduler.js'
import type { Routine } from './routine-types.js'
import { computeSessionAttention } from './session-attention.js'

describe('T018 · fire→session 集成冒烟（StubEngine）', () => {
  it('runNow：开会话、发 instruction、runs 记录、会话 attention 倾向 unread', async () => {
    const path = join(tmpdir(), `rtn-smoke-${Date.now()}.json`)
    const store = new RoutineStore(path)
    const bus = new EventBus()
    const engine = new StubEngine()
    const sessions = new SessionManager(engine, bus)

    const sched = new RoutineScheduler({
      store,
      onFire: async (r: Routine) => {
        const started = Date.now()
        const rec = await sessions.create(r.workspace, {
          title: `Routine · ${r.name}`,
          engineMeta: { permissionPolicy: 'yolo', model: r.model },
          lastReadAt: null
        })
        await sessions.send(rec.id, r.instruction)
        // Stub 同步结束；快照状态
        const after = sessions.get(rec.id)!
        const durationMs = Date.now() - started
        const hist = bus.history(rec.id)
        const asst = [...hist].reverse().find((e) => e.type === 'assistant.message') as
          | { text?: string }
          | undefined
        return {
          sessionId: rec.id,
          status: after.status === 'error' ? 'fail' : 'ok',
          summary: asst?.text?.slice(0, 200) ?? '完成',
          durationMs
        }
      }
    })

    const r = sched.create({
      name: '冒烟',
      instruction: '说一句 hello',
      enabled: true,
      workspace: '/tmp/ws-smoke',
      model: 'stub',
      triggers: [{ kind: 'interval', everyMinutes: 1 }],
      mcpServers: [],
      notify: false
    })

    const { runId, sessionId } = await sched.runNow(r.id)
    expect(runId).toMatch(/^run_/)
    expect(sessionId).toBeTruthy()

    const runs = store.get(r.id)!.runs
    expect(runs).toHaveLength(1)
    expect(runs[0]!.sessionId).toBe(sessionId)
    expect(runs[0]!.status).toBe('ok')
    expect(runs[0]!.durationMs).toBeGreaterThanOrEqual(0)
    expect(runs[0]!.summary).toMatch(/Stub|hello|完成/i)

    const sess = sessions.get(sessionId)!
    expect(sess.title).toBe('Routine · 冒烟')
    const attention = computeSessionAttention({
      status: sess.status,
      lastActivityAt: sess.lastActivityAt ?? Date.now(),
      lastReadAt: sess.lastReadAt ?? null
    })
    // lastReadAt=null → unread（或 working 若仍 busy；stub 应为 idle+unread）
    expect(['unread', 'working', 'read']).toContain(attention)
    if (sess.status === 'idle' || sess.status === 'done') {
      expect(attention).toBe('unread')
    }

    await sessions.dispose(sessionId)
    rmSync(path, { force: true })
  })
})
