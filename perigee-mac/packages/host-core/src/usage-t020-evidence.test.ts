/**
 * T020 当场证据：用本机真实 transcript usage raw 解析 → 新条目 model；历史账本不写。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import {
  UsageLedger,
  ledgerEntryFromUsageEvent,
  resolveUsageModelName
} from './usage-ledger.js'

const realLedger = join(
  homedir(),
  'Library/Application Support/@perigee/app/usage-ledger'
)
const realTranscript = join(
  homedir(),
  'Library/Application Support/@perigee/app/transcripts/ses_msacgzom_ehkosj.jsonl'
)

function sha256file(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

const hasRealData = existsSync(realTranscript) && existsSync(join(realLedger, '2026-08.jsonl'))

describe.runIf(hasRealData)('T020 evidence (本机真实数据)', () => {
  it('真实 transcript usage → model=grok-4.5-build；历史账本 hash 不变', () => {
    expect(existsSync(realTranscript)).toBe(true)
    const lines = readFileSync(realTranscript, 'utf8').split('\n').filter(Boolean)
    const usageLine = lines.find((l) => {
      try {
        return JSON.parse(l).type === 'usage'
      } catch {
        return false
      }
    })
    expect(usageLine).toBeTruthy()
    const ev = JSON.parse(usageLine!) as {
      type: string
      id: string
      sessionId: string
      ts: string
      inputTokens?: number
      outputTokens?: number
      raw?: unknown
    }
    // eslint-disable-next-line no-console
    console.log('REAL_USAGE_RAW_KEYS', Object.keys((ev.raw as object) || {}))
    // eslint-disable-next-line no-console
    console.log(
      'REAL_MODELUSAGE',
      JSON.stringify((ev.raw as { modelUsage?: unknown })?.modelUsage)?.slice(0, 120)
    )
    const model = resolveUsageModelName(ev)
    // eslint-disable-next-line no-console
    console.log('RESOLVED_MODEL', model)
    expect(model).toBe('grok-4.5-build')

    const entry = ledgerEntryFromUsageEvent(ev, 'UTC')
    // eslint-disable-next-line no-console
    console.log('NEW_LEDGER_ENTRY', JSON.stringify(entry))
    expect(entry?.model).toBe('grok-4.5-build')

    // 历史文件 hash before
    const f8 = join(realLedger, '2026-08.jsonl')
    const f7 = join(realLedger, '2026-07.jsonl')
    const h8b = sha256file(f8)
    const h7b = sha256file(f7)
    // eslint-disable-next-line no-console
    console.log('HIST_HASH_BEFORE', { '2026-08': h8b, '2026-07': h7b })

    // 同构入账到临时目录（不碰真库）
    const tmp = join(tmpdir(), `t020-ev-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    // 拷贝历史一行（null model）到临时账本
    const histLine = readFileSync(f8, 'utf8').trim().split('\n')[0]!
    writeFileSync(join(tmp, '2026-08.jsonl'), histLine + '\n')
    const ledger = new UsageLedger(tmp, 'UTC')
    const hist = ledger.readAll()[0]!
    // eslint-disable-next-line no-console
    console.log('HIST_ENTRY_BEFORE', JSON.stringify({ eventId: hist.eventId, model: hist.model, total: hist.totalTokens }))
    expect(hist.model).toBeNull()

    // 新事件（改 id 避免幂等撞历史）
    const neu = {
      ...ev,
      id: `usg_t020_evidence_${Date.now()}`,
      ts: new Date().toISOString()
    }
    expect(ledger.appendFromUsageEvent(neu)).toBe(true)
    const all = ledger.readAll()
    const oldStill = all.find((e) => e.eventId === hist.eventId)!
    const added = all.find((e) => e.eventId === neu.id)!
    // eslint-disable-next-line no-console
    console.log('HIST_ENTRY_AFTER', JSON.stringify({ eventId: oldStill.eventId, model: oldStill.model }))
    // eslint-disable-next-line no-console
    console.log('NEW_ENTRY', JSON.stringify({ eventId: added.eventId, model: added.model, total: added.totalTokens }))
    expect(oldStill.model).toBeNull()
    expect(added.model).toBe('grok-4.5-build')

    // 真库 hash 未变
    const h8a = sha256file(f8)
    const h7a = sha256file(f7)
    // eslint-disable-next-line no-console
    console.log('HIST_HASH_AFTER', { '2026-08': h8a, '2026-07': h7a })
    expect(h8a).toBe(h8b)
    expect(h7a).toBe(h7b)

    rmSync(tmp, { recursive: true, force: true })
  })
})
