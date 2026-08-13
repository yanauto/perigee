import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EVENT_SCHEMA_VERSION, type SessionEvent } from '@perigee/event-schema'
import { TranscriptStore } from './transcript-store.js'

const tmpRoots: string[] = []

function makeStore(): TranscriptStore {
  const root = mkdtempSync(join(tmpdir(), 'perigee-transcript-'))
  tmpRoots.push(root)
  return new TranscriptStore(root)
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function userMessage(id: string, text: string): SessionEvent {
  return {
    type: 'user.message',
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId: 'ses_1',
    id,
    ts: '2026-01-01T00:00:00.000Z',
    text
  } as SessionEvent
}

describe('TranscriptStore', () => {
  it('skips malformed jsonl lines without losing valid transcript events', () => {
    const store = makeStore()
    writeFileSync(
      store.pathFor('ses_1'),
      [
        JSON.stringify(userMessage('ev_1', 'before')),
        '{not valid json',
        JSON.stringify(userMessage('ev_2', 'after')),
        ''
      ].join('\n'),
      'utf8'
    )

    expect(store.readAll('ses_1')).toEqual([
      userMessage('ev_1', 'before'),
      userMessage('ev_2', 'after')
    ])
  })
})