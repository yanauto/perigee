import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  UsageLedger,
  ledgerEntryFromUsageEvent
} from './usage-ledger.js'

describe('usage-ledger', () => {
  it('ledgerEntryFromUsageEvent 抽取 totalTokens / model', () => {
    const e = ledgerEntryFromUsageEvent(
      {
        type: 'usage',
        id: 'usg_1',
        sessionId: 'ses_a',
        ts: '2026-08-01T12:00:00.000Z',
        inputTokens: 100,
        outputTokens: 20,
        raw: { totalTokens: 120, modelId: 'grok-4.5' }
      },
      'UTC'
    )
    expect(e).toMatchObject({
      eventId: 'usg_1',
      sessionId: 'ses_a',
      totalTokens: 120,
      inputTokens: 100,
      outputTokens: 20,
      model: 'grok-4.5',
      date: '2026-08-01'
    })
  })

  it('T020：从 raw.modelUsage key 取真实模型（ACP 实况，无 modelId）', () => {
    // 本机 transcript 样本形状
    const e = ledgerEntryFromUsageEvent(
      {
        type: 'usage',
        id: 'usg_acp',
        sessionId: 'ses_real',
        ts: '2026-08-01T12:25:29.904Z',
        inputTokens: 18489,
        outputTokens: 34,
        raw: {
          inputTokens: 18489,
          outputTokens: 34,
          totalTokens: 18523,
          modelUsage: {
            'grok-4.5-build': {
              inputTokens: 18489,
              outputTokens: 34,
              totalTokens: 18523
            }
          },
          numTurns: 1
        }
      },
      'UTC'
    )
    expect(e?.model).toBe('grok-4.5-build')
    expect(e?.totalTokens).toBe(18523)
  })

  it('T020：无 model 时用 fallbackModel；有 modelUsage 时 fallback 不覆盖', () => {
    const noModel = ledgerEntryFromUsageEvent(
      {
        type: 'usage',
        id: 'usg_fb',
        sessionId: 'ses_fb',
        ts: '2026-08-02T01:00:00.000Z',
        inputTokens: 10,
        outputTokens: 2,
        raw: { totalTokens: 12 }
      },
      'UTC',
      { fallbackModel: 'settings-model' }
    )
    expect(noModel?.model).toBe('settings-model')

    const fromMu = ledgerEntryFromUsageEvent(
      {
        type: 'usage',
        id: 'usg_fb2',
        sessionId: 'ses_fb',
        ts: '2026-08-02T01:00:01.000Z',
        inputTokens: 10,
        outputTokens: 2,
        raw: {
          totalTokens: 12,
          modelUsage: { 'grok-4.5-build': { totalTokens: 12 } }
        }
      },
      'UTC',
      { fallbackModel: 'settings-model' }
    )
    expect(fromMu?.model).toBe('grok-4.5-build')
  })

  it('T020：不改写历史 unknown 条目（append 只追加）', () => {
    const dir = join(tmpdir(), `ledger-hist-${Date.now()}`)
    const ledger = new UsageLedger(dir, 'UTC')
    // 模拟历史 null model 行（直接 append，不经新解析）
    expect(
      ledger.append({
        date: '2026-08-01',
        sessionId: 'ses_old',
        model: null,
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        ts: '2026-08-01T10:00:00.000Z',
        eventId: 'usg_hist_old',
        hour: 10
      })
    ).toBe(true)
    const before = ledger.readAll()
    expect(before).toHaveLength(1)
    expect(before[0]!.model).toBeNull()
    expect(before[0]!.eventId).toBe('usg_hist_old')

    // 新条目带真实模型
    expect(
      ledger.appendFromUsageEvent({
        type: 'usage',
        id: 'usg_hist_new',
        sessionId: 'ses_new',
        ts: '2026-08-02T10:00:00.000Z',
        inputTokens: 5,
        outputTokens: 1,
        raw: {
          totalTokens: 6,
          modelUsage: { 'grok-4.5-build': { totalTokens: 6 } }
        }
      })
    ).toBe(true)

    const after = ledger.readAll()
    expect(after).toHaveLength(2)
    const old = after.find((e) => e.eventId === 'usg_hist_old')!
    const neu = after.find((e) => e.eventId === 'usg_hist_new')!
    expect(old.model).toBeNull() // 历史未改写
    expect(old.totalTokens).toBe(110)
    expect(neu.model).toBe('grok-4.5-build')
    rmSync(dir, { recursive: true, force: true })
  })

  it('同一 eventId 不重复入账', () => {
    const dir = join(tmpdir(), `ledger-dedupe-${Date.now()}`)
    const ledger = new UsageLedger(dir, 'UTC')
    const ev = {
      type: 'usage' as const,
      id: 'usg_dup',
      sessionId: 'ses_x',
      ts: '2026-08-01T10:00:00.000Z',
      inputTokens: 10,
      outputTokens: 2,
      raw: { totalTokens: 12 }
    }
    expect(ledger.appendFromUsageEvent(ev)).toBe(true)
    expect(ledger.appendFromUsageEvent(ev)).toBe(false)
    // 重放相同 id
    expect(ledger.appendFromUsageEvent({ ...ev, ts: '2026-08-01T11:00:00.000Z' })).toBe(
      false
    )
    const lines = readFileSync(join(dir, '2026-08.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('无 id 时用 sessionId|ts|tokens 合成键去重', () => {
    const dir = join(tmpdir(), `ledger-synth-${Date.now()}`)
    const ledger = new UsageLedger(dir, 'UTC')
    const ev = {
      type: 'usage' as const,
      sessionId: 'ses_y',
      ts: '2026-08-01T08:00:00.000Z',
      inputTokens: 5,
      outputTokens: 1,
      raw: { totalTokens: 6 }
    }
    expect(ledger.appendFromUsageEvent(ev)).toBe(true)
    expect(ledger.appendFromUsageEvent(ev)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('migrateFromTranscripts 幂等且总数正确', () => {
    const root = join(tmpdir(), `ledger-mig-${Date.now()}`)
    const tdir = join(root, 'transcripts')
    const ldir = join(root, 'ledger')
    mkdirSync(tdir, { recursive: true })
    writeFileSync(
      join(tdir, 'ses_old.jsonl'),
      [
        JSON.stringify({
          type: 'user.message',
          sessionId: 'ses_old',
          ts: '2026-08-01T01:00:00.000Z',
          text: 'hi'
        }),
        JSON.stringify({
          type: 'usage',
          id: 'usg_old1',
          sessionId: 'ses_old',
          ts: '2026-08-01T01:01:00.000Z',
          inputTokens: 50,
          outputTokens: 10,
          raw: { totalTokens: 60, modelId: 'grok-4.5' }
        }),
        JSON.stringify({
          type: 'usage',
          id: 'usg_old2',
          sessionId: 'ses_old',
          ts: '2026-08-01T01:02:00.000Z',
          inputTokens: 40,
          outputTokens: 5,
          raw: { totalTokens: 45 }
        })
      ].join('\n') + '\n'
    )

    const ledger = new UsageLedger(ldir, 'UTC')
    const r1 = ledger.migrateFromTranscripts(tdir)
    expect(r1.added).toBe(2)
    expect(ledger.isMigrated()).toBe(true)
    const r2 = ledger.migrateFromTranscripts(tdir)
    expect(r2.added).toBe(0)
    expect(r2.skipped).toBe(2)

    const all = ledger.readAll()
    expect(all).toHaveLength(2)
    expect(all.reduce((s, e) => s + e.totalTokens, 0)).toBe(105)

    // ensureMigrated 二次不重迁
    const ledger2 = new UsageLedger(ldir, 'UTC')
    expect(ledger2.ensureMigrated(tdir)).toBe(null)
    expect(ledger2.readAll()).toHaveLength(2)

    rmSync(root, { recursive: true, force: true })
  })

  it('删会话后账本仍在（路径与会话解耦）', () => {
    const root = join(tmpdir(), `ledger-survive-${Date.now()}`)
    const tdir = join(root, 'transcripts')
    const ldir = join(root, 'ledger')
    mkdirSync(tdir, { recursive: true })
    const sid = 'ses_gone'
    writeFileSync(
      join(tdir, `${sid}.jsonl`),
      JSON.stringify({
        type: 'usage',
        id: 'usg_live',
        sessionId: sid,
        ts: '2026-08-01T03:00:00.000Z',
        inputTokens: 1,
        outputTokens: 1,
        raw: { totalTokens: 2 }
      }) + '\n'
    )
    const ledger = new UsageLedger(ldir, 'UTC')
    ledger.appendFromUsageEvent({
      type: 'usage',
      id: 'usg_live',
      sessionId: sid,
      ts: '2026-08-01T03:00:00.000Z',
      inputTokens: 1,
      outputTokens: 1,
      raw: { totalTokens: 2 }
    })
    // 模拟删会话：只删 transcript
    rmSync(join(tdir, `${sid}.jsonl`), { force: true })
    expect(existsSync(join(tdir, `${sid}.jsonl`))).toBe(false)
    expect(ledger.readAll().reduce((s, e) => s + e.totalTokens, 0)).toBe(2)
    rmSync(root, { recursive: true, force: true })
  })
})
