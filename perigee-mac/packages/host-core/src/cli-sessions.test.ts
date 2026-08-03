import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findExternalCliSession, listExternalCliSessions } from './cli-sessions.js'

describe('cli-sessions', () => {
  it('listExternalCliSessions 从 summary.json 枚举', () => {
    const home = join(tmpdir(), `grok-cli-ses-${Date.now()}`)
    const cwdKey = encodeURIComponent('/tmp/proj')
    const sid = '019f0000-1111-2222-3333-444444444444'
    const dir = join(home, 'sessions', cwdKey, sid)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'summary.json'),
      JSON.stringify({
        info: { id: sid, cwd: '/tmp/proj' },
        session_summary: 'Hello test',
        generated_title: 'Hello test',
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T01:00:00Z',
        current_model_id: 'grok-4.5',
        reasoning_effort: 'high',
        num_messages: 3
      }),
      'utf8'
    )

    const list = listExternalCliSessions({ grokHome: home, limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: sid,
      title: 'Hello test',
      cwd: '/tmp/proj',
      modelId: 'grok-4.5',
      reasoningEffort: 'high'
    })

    const found = findExternalCliSession(sid, { grokHome: home })
    expect(found?.id).toBe(sid)

    const filtered = listExternalCliSessions({ grokHome: home, cwd: '/tmp/other' })
    expect(filtered).toHaveLength(0)

    rmSync(home, { recursive: true, force: true })
  })
})
