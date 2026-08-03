/**
 * T018 真机证据：真实 setTimeout + interval=1min → 自动 fire → 开会话 → runs
 * 仅当 RUN_T018_LIVE=1 时运行（约 65s）。
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync, writeFileSync } from 'node:fs'
import { StubEngine } from '@perigee/engine-protocol'
import { EventBus } from './event-bus.js'
import { SessionManager } from './session-manager.js'
import { RoutineStore } from './routine-store.js'
import { RoutineScheduler } from './routine-scheduler.js'
import { computeSessionAttention } from './session-attention.js'
import type { Routine } from './routine-types.js'

const live = process.env.RUN_T018_LIVE === '1'

describe.runIf(live)('T018 live interval=1min', () => {
  it(
    '到点自动开会话并写 runs',
    async () => {
      const lines: string[] = []
      const log = (m: string) => {
        const line = `[${new Date().toISOString()}] ${m}`
        // eslint-disable-next-line no-console
        console.log(line)
        lines.push(line)
      }

      const path = join(tmpdir(), `t018-live-${Date.now()}.json`)
      const store = new RoutineStore(path)
      const bus = new EventBus()
      const sessions = new SessionManager(new StubEngine(), bus)

      const sched = new RoutineScheduler({
        store,
        notify: (t, b) => log(`NOTIFY ${t} | ${b}`),
        onFire: async (r: Routine) => {
          log(`FIRE ${r.id}`)
          const t0 = Date.now()
          const rec = await sessions.create(r.workspace, {
            title: `Routine · ${r.name}`,
            engineMeta: { permissionPolicy: 'yolo' },
            lastReadAt: null
          })
          await sessions.send(rec.id, r.instruction)
          const after = sessions.get(rec.id)!
          const durationMs = Date.now() - t0
          const attention = computeSessionAttention({
            status: after.status,
            lastActivityAt: after.lastActivityAt ?? Date.now(),
            lastReadAt: after.lastReadAt ?? null
          })
          log(
            `SESSION ${rec.id} status=${after.status} attention=${attention} durationMs=${durationMs}`
          )
          return {
            sessionId: rec.id,
            status: 'ok' as const,
            summary: 'live pong',
            durationMs
          }
        }
      })

      const r = sched.create({
        name: 'T018-1min-demo',
        instruction: 'pong',
        enabled: true,
        workspace: '/tmp',
        model: 'stub',
        triggers: [{ kind: 'interval', everyMinutes: 1 }],
        mcpServers: [],
        notify: true
      })
      log(`CREATED nextRunAt=${r.nextRunAt} delta=${(r.nextRunAt ?? 0) - Date.now()}`)
      sched.start()

      // 等自动触发（最多 75s）
      const deadline = Date.now() + 75_000
      while (Date.now() < deadline) {
        const runs = store.get(r.id)?.runs ?? []
        if (runs.length >= 1) break
        await new Promise((res) => setTimeout(res, 2000))
      }

      const final = store.get(r.id)!
      log(`FINAL_RUNS ${JSON.stringify(final.runs)}`)
      expect(final.runs.length).toBeGreaterThanOrEqual(1)
      expect(final.runs[0]!.status).toBe('ok')
      expect(final.runs[0]!.sessionId).toBeTruthy()
      expect(final.runs[0]!.durationMs).toBeGreaterThanOrEqual(0)

      const sess = sessions.get(final.runs[0]!.sessionId)!
      const att = computeSessionAttention({
        status: sess.status,
        lastActivityAt: sess.lastActivityAt ?? Date.now(),
        lastReadAt: sess.lastReadAt ?? null
      })
      log(`ATTENTION ${att}`)
      expect(att).toBe('unread')

      // toggle 停用
      sched.toggle(r.id, false)
      expect(sched.peekNextFireAt(r.id)).toBeUndefined()
      log('TOGGLED off')

      // runNow
      const rn = await sched.runNow(r.id)
      log(`runNow ${JSON.stringify(rn)}`)
      expect(store.get(r.id)!.runs.length).toBeGreaterThanOrEqual(2)

      const evidence = join(tmpdir(), 't018-evidence.txt')
      writeFileSync(evidence, lines.join('\n') + '\n', 'utf8')
      log(`EVIDENCE ${evidence}`)
      log(`STORE ${path}`)

      sched.stop()
      // 不删 evidence / store，供回执引用
      void rmSync
    },
    90_000
  )
})
