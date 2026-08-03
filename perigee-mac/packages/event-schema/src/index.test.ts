import { describe, expect, it } from 'vitest'
import {
  EVENT_SCHEMA_VERSION,
  extractPathsFromToolArgs,
  isSessionEvent,
  newEventId,
  type SessionEvent
} from './index.js'

describe('event-schema v3', () => {
  it('accepts thought.delta and turn.end', () => {
    const thought: SessionEvent = {
      type: 'thought.delta',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: 's1',
      id: newEventId(),
      ts: new Date().toISOString(),
      text: '…'
    }
    const end: SessionEvent = {
      type: 'turn.end',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: 's1',
      id: newEventId(),
      ts: new Date().toISOString(),
      stopReason: 'end_turn',
      engineSessionId: '019f…'
    }
    expect(isSessionEvent(thought)).toBe(true)
    expect(isSessionEvent(end)).toBe(true)
    expect(EVENT_SCHEMA_VERSION).toBe(3)
  })

  it('rejects schema v1', () => {
    expect(
      isSessionEvent({
        type: 'error',
        schemaVersion: 1,
        sessionId: 's1',
        id: 'x',
        ts: 't',
        message: 'nope'
      })
    ).toBe(false)
  })

  it('extracts paths from tool args', () => {
    expect(
      extractPathsFromToolArgs({
        target_file: 'src/a/b.ts',
        path: 'docs/x.md'
      })
    ).toEqual(expect.arrayContaining(['src/a/b.ts', 'docs/x.md']))
  })
})
