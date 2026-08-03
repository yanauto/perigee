import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@perigee/event-schema'
import { SessionStore, type PersistedSession } from './session-store.js'
import { EventBus, MAX_PER_SESSION } from './event-bus.js'

/**
 * T029 生命周期回归：
 * ① 删除后迟到的 upsert 不得让会话「复活」（真机：当下消失、重开又出现）
 * ② 会话历史能从 transcript 回灌（真机：Desktop 原生会话点进去全空白）
 */

const dir = mkdtempSync(join(tmpdir(), 't029-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const rec = (id: string, title = '会话 20'): PersistedSession => ({
  id,
  title,
  workspacePath: '/repo',
  engineId: 'grok-acp',
  createdAt: '2026-08-02T12:25:38.000Z',
  updatedAt: '2026-08-02T12:25:38.000Z',
  status: 'idle'
})

const ev = (i: number, sessionId = 's1'): SessionEvent =>
  ({
    type: 'assistant.delta',
    schemaVersion: 3,
    sessionId,
    id: `e${i}`,
    ts: '2026-08-02T12:25:38.000Z',
    text: `chunk${i}`
  }) as SessionEvent

describe('删除不复活（SessionStore 墓碑）', () => {
  it('删除后再 upsert 同一 id：盘上不得再出现', () => {
    const store = new SessionStore(join(dir, `a-${Date.now()}.json`))
    store.upsert(rec('ses_x'))
    expect(store.load().sessions.map((s) => s.id)).toEqual(['ses_x'])

    store.remove('ses_x')
    expect(store.load().sessions).toHaveLength(0)
    expect(store.isRemoved('ses_x')).toBe(true)

    // 迟到的写回（真机成因：session:send 在轮次结束后用旧引用 persistSession）
    store.upsert(rec('ses_x'))
    expect(store.load().sessions).toHaveLength(0)
  })

  it('墓碑只挡被删的那一个，其它会话照常读写', () => {
    const store = new SessionStore(join(dir, `b-${Date.now()}.json`))
    store.upsert(rec('ses_keep'))
    store.upsert(rec('ses_gone'))
    store.remove('ses_gone')
    store.upsert(rec('ses_gone')) // 迟到写回，被墓碑挡下
    store.upsert({ ...rec('ses_keep'), title: '改了名' }) // 正常更新照旧
    const ids = store.load().sessions.map((s) => s.id)
    expect(ids).toEqual(['ses_keep'])
    expect(store.load().sessions[0]!.title).toBe('改了名')
  })

  it('删除幂等；删不存在的 id 不炸', () => {
    const store = new SessionStore(join(dir, `c-${Date.now()}.json`))
    store.upsert(rec('ses_x'))
    store.remove('ses_x')
    store.remove('ses_x')
    store.remove('never-existed')
    expect(store.load().sessions).toHaveLength(0)
  })

  it('落盘是真的写文件（重启读回同一份）', () => {
    const p = join(dir, `d-${Date.now()}.json`)
    const store = new SessionStore(p)
    store.upsert(rec('ses_x'))
    store.remove('ses_x')
    const onDisk = JSON.parse(readFileSync(p, 'utf8')) as { sessions: unknown[] }
    expect(onDisk.sessions).toHaveLength(0)
    // 新进程（新实例、无墓碑）读到的也是空
    expect(new SessionStore(p).load().sessions).toHaveLength(0)
  })
})

describe('历史回灌（EventBus.seed ← transcript）', () => {
  it('内存为空时可从持久化事件回灌，history 读得到', () => {
    const bus = new EventBus()
    expect(bus.hasHistory('s1')).toBe(false)
    expect(bus.history('s1')).toEqual([])

    bus.seed('s1', [ev(1), ev(2), ev(3)])
    expect(bus.hasHistory('s1')).toBe(true)
    expect(bus.history('s1')).toHaveLength(3)
  })

  it('已有内存历史时不覆盖（活会话的实时事件优先）', () => {
    const bus = new EventBus()
    bus.publish(ev(99))
    bus.seed('s1', [ev(1), ev(2)])
    expect(bus.history('s1')).toHaveLength(1)
    expect((bus.history('s1')[0] as { id: string }).id).toBe('e99')
  })

  it('超长 transcript 只回灌最近 MAX_PER_SESSION 条', () => {
    const bus = new EventBus()
    const many = Array.from({ length: MAX_PER_SESSION + 234 }, (_, i) => ev(i))
    bus.seed('s1', many)
    const h = bus.history('s1')
    expect(h).toHaveLength(MAX_PER_SESSION)
    expect((h[h.length - 1] as { id: string }).id).toBe(`e${MAX_PER_SESSION + 233}`)
  })

  it('回灌后仍可继续 publish 增量', () => {
    const bus = new EventBus()
    bus.seed('s1', [ev(1)])
    bus.publish(ev(2))
    expect(bus.history('s1').map((e) => (e as { id: string }).id)).toEqual(['e1', 'e2'])
  })

  it('空事件 / 空 id 不做任何事', () => {
    const bus = new EventBus()
    bus.seed('s1', [])
    bus.seed('', [ev(1)])
    expect(bus.hasHistory('s1')).toBe(false)
  })

  it('clearSession 后可再次回灌（删除→重建同 id 的边界）', () => {
    const bus = new EventBus()
    bus.seed('s1', [ev(1)])
    bus.clearSession('s1')
    expect(bus.hasHistory('s1')).toBe(false)
    bus.seed('s1', [ev(7)])
    expect(bus.history('s1')).toHaveLength(1)
  })
})
