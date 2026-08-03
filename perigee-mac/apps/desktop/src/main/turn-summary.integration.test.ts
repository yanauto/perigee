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
import { GrokBuildEngine, resolveGrokBinary } from '@perigee/engine-grok-build'
import type { SessionEvent } from '@perigee/event-schema'

/**
 * 真机集成：headless 引擎全链路 → turn.summary + pending diff。
 * 默认跳过；显式开启：
 *   GROK_INTEGRATION=1 pnpm --filter @perigee/app exec vitest run src/main/turn-summary.integration.test.ts
 * 需要本机 grok CLI 已登录（~/.grok）。
 */
const RUN = process.env.GROK_INTEGRATION === '1'

type TurnSummary = Extract<SessionEvent, { type: 'turn.summary' }>

describe.skipIf(!RUN)('真机集成：headless → turn.summary', () => {
  let dir = ''

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('一轮创建文件后：turn.summary 聚合正确，diff 挂对 turnId', async () => {
    const bin = process.env.GROK_BINARY || resolveGrokBinary()
    expect(GrokBuildEngine.isAvailable(bin)).toBe(true)

    dir = mkdtempSync(join(tmpdir(), 'grok-turn-'))
    const bus = new EventBus()
    const diffs = new DiffService(dir)
    const tracker = new TurnTracker(bus)
    tracker.attach(() => diffs)

    const summaries: TurnSummary[] = []
    const seen: string[] = []
    bus.subscribe((ev) => {
      seen.push(
        ev.type === 'session.status' ? `status:${ev.status}` : ev.type
      )
      // 与 main/index.ts wireBus 同款最小接线
      if (ev.type === 'tool.call') diffs.captureFromToolArgs(ev.sessionId, ev.args)
      if (ev.type === 'file.changed')
        diffs.noteChanged(ev.sessionId, ev.path, { before: ev.before, after: ev.after })
      if (ev.type === 'turn.summary') summaries.push(ev)
    })

    const engine = new GrokBuildEngine({
      binary: bin,
      alwaysApprove: true,
      maxTurns: 5,
      turnTimeoutMs: 120_000
    })
    const sessions = new SessionManager(engine, bus)
    const rec = await sessions.create(dir, '集成验证')
    await sessions.send(
      rec.id,
      '在当前目录创建文件 probe-turn.txt，内容就写 ok 两个字母。只做这一件事，不要跑别的命令。'
    )

    const deadline = Date.now() + 150_000
    while (summaries.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500))
    }

    tracker.dispose()
    await engine.disposeSession?.(rec.id).catch(() => {})

    console.log('[integration] raw flow:', seen.join(' → '))
    console.log('[integration] diffs:', JSON.stringify(diffs.list(), null, 1))

    expect(summaries.length).toBeGreaterThanOrEqual(1)
    const s = summaries[0]
    expect(s.turnId).toMatch(/^turn_/)
    expect(s.filesChanged).toContain('probe-turn.txt')
    expect(s.toolsRun).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(dir, 'probe-turn.txt'))).toBe(true)

    const turnDiffs = diffs.list(rec.id).filter((d) => d.turnId === s.turnId)
    expect(turnDiffs.map((d) => d.relativePath)).toContain('probe-turn.txt')
    // 权威 diff hint：新文件 before=null，after 来自 CLI 的 newText
    const rec1 = turnDiffs.find((d) => d.relativePath === 'probe-turn.txt')
    expect(rec1?.before).toBeNull()
    expect(rec1?.after).toContain('ok')
  }, 180_000)
})
