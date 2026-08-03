import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  aggregateUsageStats,
  shouldCountCliSession,
  UNKNOWN_MODEL
} from './usage-stats.js'

describe('usage-stats', () => {
  it('shouldCountCliSession 去重', () => {
    const s = new Set(['019faaa', 'ses_desk'])
    expect(shouldCountCliSession('019faaa', s)).toBe(false)
    expect(shouldCountCliSession('019fbbb', s)).toBe(true)
  })

  it('Desktop transcript + CLI 合并，resume 去重', () => {
    const root = join(tmpdir(), `usage-stats-${Date.now()}`)
    const transcriptDir = join(root, 'transcripts')
    const cliRoot = join(root, 'cli-sessions')
    mkdirSync(transcriptDir, { recursive: true })

    // Desktop 会话已 resume CLI 019f-cli-1
    const deskId = 'ses_desk1'
    writeFileSync(
      join(transcriptDir, `${deskId}.jsonl`),
      [
        JSON.stringify({
          type: 'user.message',
          ts: '2026-08-01T04:00:00.000Z',
          text: 'hi',
          sessionId: deskId
        }),
        JSON.stringify({
          type: 'usage',
          ts: '2026-08-01T04:01:00.000Z',
          sessionId: deskId,
          inputTokens: 100,
          outputTokens: 20,
          raw: { totalTokens: 120, modelId: 'grok-4.5' }
        })
      ].join('\n') + '\n'
    )

    // CLI 会话 A = resume 源（应跳过）
    const cliA = '019f-cli-1'
    const dirA = join(cliRoot, encodeURIComponent('/tmp/a'), cliA)
    mkdirSync(dirA, { recursive: true })
    writeFileSync(
      join(dirA, 'summary.json'),
      JSON.stringify({
        info: { id: cliA, cwd: '/tmp/a' },
        created_at: '2026-08-01T03:00:00.000Z',
        updated_at: '2026-08-01T03:30:00.000Z',
        num_chat_messages: 99,
        current_model_id: 'grok-4.5'
      })
    )
    writeFileSync(
      join(dirA, 'signals.json'),
      JSON.stringify({ userMessageCount: 99, primaryModelId: 'grok-4.5' })
    )

    // CLI 会话 B 独立（应计入 messages）
    const cliB = '019f-cli-2'
    const dirB = join(cliRoot, encodeURIComponent('/tmp/b'), cliB)
    mkdirSync(dirB, { recursive: true })
    writeFileSync(
      join(dirB, 'summary.json'),
      JSON.stringify({
        info: { id: cliB, cwd: '/tmp/b' },
        created_at: '2026-07-30T10:00:00.000Z',
        updated_at: '2026-07-30T11:00:00.000Z',
        num_chat_messages: 5,
        current_model_id: 'grok-4.5'
      })
    )
    writeFileSync(
      join(dirB, 'signals.json'),
      JSON.stringify({
        userMessageCount: 5,
        primaryModelId: 'grok-4.5',
        contextTokensUsed: 19000 // 不当作 lifetime tokens
      })
    )

    const stats = aggregateUsageStats({
      transcriptDir,
      cliSessionsRoot: cliRoot,
      desktopSessions: [
        { id: deskId, engineSessionId: cliA, createdAt: '2026-08-01T04:00:00.000Z' }
      ],
      range: 'all',
      now: new Date('2026-08-01T12:00:00.000Z'),
      timeZone: 'UTC'
    })

    // Desktop 1 msg + CLI B 5 msgs；CLI A 因 engineSessionId 去重
    expect(stats.messages).toBe(1 + 5)
    expect(stats.totalTokens).toBe(120) // 仅 Desktop usage；CLI 不编造
    expect(stats.sessions).toBeGreaterThanOrEqual(2) // desk + cliB
    expect(stats.favoriteModel).toBe('grok-4.5')
    expect(stats.daily.some((d) => d.messages > 0)).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })

  it('有 ledgerEntries 时 token 以账本为准、不读 transcript usage', () => {
    const root = join(tmpdir(), `usage-ledger-agg-${Date.now()}`)
    const transcriptDir = join(root, 't')
    mkdirSync(transcriptDir, { recursive: true })
    writeFileSync(
      join(transcriptDir, 'ses_z.jsonl'),
      JSON.stringify({
        type: 'usage',
        id: 'usg_should_skip',
        sessionId: 'ses_z',
        ts: '2026-08-01T05:00:00.000Z',
        inputTokens: 999,
        outputTokens: 1,
        raw: { totalTokens: 1000 }
      }) +
        '\n' +
        JSON.stringify({
          type: 'user.message',
          sessionId: 'ses_z',
          ts: '2026-08-01T05:00:01.000Z',
          text: 'x'
        }) +
        '\n'
    )
    const emptyCli = join(root, 'cli-empty')
    mkdirSync(emptyCli, { recursive: true })
    const stats = aggregateUsageStats({
      transcriptDir,
      cliSessionsRoot: emptyCli,
      ledgerEntries: [
        {
          date: '2026-08-01',
          totalTokens: 42,
          model: 'grok-4.5',
          ts: '2026-08-01T05:00:00.000Z',
          hour: 5
        }
      ],
      range: 'all',
      now: new Date('2026-08-01T12:00:00.000Z'),
      timeZone: 'UTC'
    })
    expect(stats.totalTokens).toBe(42) // 不是 1000
    expect(stats.messages).toBe(1)
    expect(stats.favoriteModel).toBe('grok-4.5')
    expect(stats.byModel[0]).toMatchObject({
      model: 'grok-4.5',
      tokens: 42,
      inputTokens: 0,
      outputTokens: 0
    })
    rmSync(root, { recursive: true, force: true })
  })

  it('T012：sum(dailyByModel)==sum(byModel)==totalTokens，含 in/out', () => {
    const emptyCli = join(tmpdir(), `usage-matrix-cli-${Date.now()}`)
    const emptyT = join(tmpdir(), `usage-matrix-t-${Date.now()}`)
    mkdirSync(emptyCli, { recursive: true })
    mkdirSync(emptyT, { recursive: true })
    const stats = aggregateUsageStats({
      transcriptDir: emptyT,
      cliSessionsRoot: emptyCli,
      ledgerEntries: [
        {
          date: '2026-08-01',
          model: 'grok-4.5',
          totalTokens: 100,
          inputTokens: 80,
          outputTokens: 20,
          ts: '2026-08-01T10:00:00.000Z',
          hour: 10
        },
        {
          date: '2026-08-01',
          model: 'grok-4.5',
          totalTokens: 50,
          inputTokens: 40,
          outputTokens: 10,
          ts: '2026-08-01T11:00:00.000Z',
          hour: 11
        },
        {
          date: '2026-08-02',
          model: null, // → unknown
          totalTokens: 30,
          inputTokens: 25,
          outputTokens: 5,
          ts: '2026-08-02T09:00:00.000Z',
          hour: 9
        },
        {
          date: '2026-08-02',
          model: 'other-model',
          totalTokens: 20,
          inputTokens: 15,
          outputTokens: 5,
          ts: '2026-08-02T12:00:00.000Z',
          hour: 12
        }
      ],
      range: 'all',
      now: new Date('2026-08-02T20:00:00.000Z'),
      timeZone: 'UTC'
    })
    const sumDailyByModel = stats.dailyByModel.reduce((s, r) => s + r.tokens, 0)
    const sumByModel = stats.byModel.reduce((s, r) => s + r.tokens, 0)
    expect(stats.totalTokens).toBe(200)
    expect(sumDailyByModel).toBe(stats.totalTokens)
    expect(sumByModel).toBe(stats.totalTokens)
    expect(stats.dailyByModel).toEqual(
      expect.arrayContaining([
        { date: '2026-08-01', model: 'grok-4.5', tokens: 150 },
        { date: '2026-08-02', model: UNKNOWN_MODEL, tokens: 30 },
        { date: '2026-08-02', model: 'other-model', tokens: 20 }
      ])
    )
    const g = stats.byModel.find((m) => m.model === 'grok-4.5')
    expect(g).toMatchObject({
      tokens: 150,
      inputTokens: 120,
      outputTokens: 30,
      messages: 0
    })
    rmSync(emptyCli, { recursive: true, force: true })
    rmSync(emptyT, { recursive: true, force: true })
  })

  it('range 7d 过滤过旧 CLI 活动', () => {
    const root = join(tmpdir(), `usage-range-${Date.now()}`)
    const transcriptDir = join(root, 't')
    const cliRoot = join(root, 'c')
    mkdirSync(transcriptDir, { recursive: true })
    const oldId = '019f-old'
    const dir = join(cliRoot, 'x', oldId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'summary.json'),
      JSON.stringify({
        info: { id: oldId, cwd: '/x' },
        updated_at: '2026-01-01T00:00:00.000Z',
        num_chat_messages: 10
      })
    )
    writeFileSync(
      join(dir, 'signals.json'),
      JSON.stringify({ userMessageCount: 10 })
    )
    const stats = aggregateUsageStats({
      transcriptDir,
      cliSessionsRoot: cliRoot,
      range: '7d',
      now: new Date('2026-08-01T00:00:00.000Z'),
      timeZone: 'UTC'
    })
    expect(stats.messages).toBe(0)
    expect(stats.sessions).toBe(0)
    rmSync(root, { recursive: true, force: true })
  })
})
