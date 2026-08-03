import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EventBus,
  SessionManager,
  DiffService,
  TurnTracker
} from '@perigee/host-core'
import { GrokAcpEngine } from '@perigee/engine-grok-acp'
import type { SessionEvent } from '@perigee/event-schema'

/**
 * 真机集成：ACP（grok agent stdio 常驻）全链路。
 * 默认跳过；显式开启：
 *   GROK_INTEGRATION=1 pnpm --filter @perigee/app exec vitest run src/main/acp.integration.test.ts
 * 需要本机 grok CLI 已登录（~/.grok）。
 */
const RUN = process.env.GROK_INTEGRATION === '1'

type TurnSummary = Extract<SessionEvent, { type: 'turn.summary' }>

function wireBus(bus: EventBus, diffs: DiffService, summaries: TurnSummary[]): void {
  bus.subscribe((ev) => {
    if (ev.type === 'tool.call') diffs.captureFromToolArgs(ev.sessionId, ev.args)
    if (ev.type === 'file.changed')
      diffs.noteChanged(ev.sessionId, ev.path, { before: ev.before, after: ev.after })
    if (ev.type === 'turn.summary') summaries.push(ev)
  })
}

async function waitFor(cond: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  while (!cond() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
  }
}

describe.skipIf(!RUN)('真机集成：ACP 常驻引擎', () => {
  let dir = ''

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('同一子进程连发两轮：turn.summary 聚合 + diff hint + 热会话计时', async () => {
    const bin = process.env.GROK_BINARY || join(process.env.HOME ?? '', '.grok/bin/grok')
    expect(GrokAcpEngine.isAvailable(bin)).toBe(true)

    dir = mkdtempSync(join(tmpdir(), 'grok-acp-'))
    const bus = new EventBus()
    const diffs = new DiffService(dir)
    const tracker = new TurnTracker(bus)
    tracker.attach(() => diffs)
    const summaries: TurnSummary[] = []
    wireBus(bus, diffs, summaries)
    bus.subscribe((ev) => {
      if (ev.type === 'file.changed')
        console.log('[acp] file.changed', ev.path, 'before=', ev.before === undefined ? '∅' : JSON.stringify(ev.before)?.slice(0, 30), 'after=', ev.after === undefined ? '∅' : JSON.stringify(ev.after)?.slice(0, 30))
      if (ev.type === 'tool.call') console.log('[acp] tool.call', ev.name, JSON.stringify(ev.args)?.slice(0, 120))
    })

    const engine = new GrokAcpEngine({ binary: bin, permissionPolicy: 'yolo' })
    const sessions = new SessionManager(engine, bus)
    const rec = await sessions.create(dir, 'ACP 集成验证')
    const pid = engine.getPid(rec.id)
    expect(pid).toBeGreaterThan(0)

    // 轮 1（冷）：创建文件
    const t1 = Date.now()
    await sessions.send(rec.id, '创建文件 acp-probe.txt，内容写 v1。只做这一件事。')
    await waitFor(() => summaries.length >= 1, 150_000)
    const coldMs = Date.now() - t1

    // 轮 2（热，同一子进程）：修改同一文件
    const t2 = Date.now()
    await sessions.send(rec.id, '把 acp-probe.txt 的内容改成 v2。只做这一件事。')
    await waitFor(() => summaries.length >= 2, 150_000)
    const warmMs = Date.now() - t2

    tracker.dispose()
    expect(engine.getPid(rec.id)).toBe(pid) // 同一子进程
    await engine.disposeSession(rec.id).catch(() => {})

    console.log(`[acp] cold turn: ${coldMs}ms, warm turn: ${warmMs}ms, pid: ${pid}`)
    console.log('[acp] diffs:', JSON.stringify(diffs.list(rec.id), null, 1))

    expect(summaries.length).toBeGreaterThanOrEqual(2)
    // 轮 2 的 diff：hint 的 before 应是 v1（CLI 权威 oldText）
    const s2 = summaries[1]
    const d2 = diffs.list(rec.id).find((d) => d.turnId === s2.turnId)
    expect(d2?.relativePath).toBe('acp-probe.txt')
    expect(d2?.before).toContain('v1')
    expect(d2?.after).toContain('v2')
    expect(existsSync(join(dir, 'acp-probe.txt'))).toBe(true)
  }, 360_000)

  it('permissionPolicy=ask：审批请求可回写，回合正常完成', async () => {
    const bin = process.env.GROK_BINARY || join(process.env.HOME ?? '', '.grok/bin/grok')
    dir = mkdtempSync(join(tmpdir(), 'grok-acp-ask-'))
    const bus = new EventBus()
    const diffs = new DiffService(dir)
    const tracker = new TurnTracker(bus)
    tracker.attach(() => diffs)
    const summaries: TurnSummary[] = []
    wireBus(bus, diffs, summaries)

    const approvals: { engineRequestId: string | number; action: string }[] = []
    const engine = new GrokAcpEngine({
      binary: bin,
      permissionPolicy: 'ask',
      onPermissionRequest: (req) => {
        approvals.push({ engineRequestId: req.engineRequestId, action: req.action })
        // 模拟人审通过（异步，避免在回调里重入 RPC）
        setTimeout(() => engine.resolvePermission(req.sessionId, req.engineRequestId, true), 50)
      }
    })
    const sessions = new SessionManager(engine, bus)
    const rec = await sessions.create(dir, 'ACP 审批验证')
    await sessions.send(rec.id, '创建文件 ask-probe.txt，内容写 ok。只做这一件事。')
    await waitFor(() => summaries.length >= 1, 150_000)

    tracker.dispose()
    await engine.disposeSession(rec.id).catch(() => {})

    console.log('[acp-ask] approvals seen:', JSON.stringify(approvals))
    // CLI 若发起 request_permission 则审批必须已回写且回合完成；未发起则回合直接完成
    expect(summaries.length).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(dir, 'ask-probe.txt'))).toBe(true)
  }, 240_000)
})
