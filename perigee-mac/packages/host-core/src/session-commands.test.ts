import { describe, expect, it } from 'vitest'
import {
  parseSessionCommand,
  sessionCommandCapabilities
} from './session-commands.js'

describe('session-commands', () => {
  it('capabilities 含 6 项且 rewind unsupported', () => {
    const caps = sessionCommandCapabilities()
    expect(caps.map((c) => c.name).sort()).toEqual(
      ['compact', 'effort', 'mcps', 'model', 'rewind', 'skill'].sort()
    )
    expect(caps.find((c) => c.name === 'rewind')?.support).toBe('unsupported')
    expect(caps.find((c) => c.name === 'model')?.support).toBe('full')
    expect(caps.find((c) => c.name === 'effort')?.support).toBe('full')
    expect(caps.find((c) => c.name === 'compact')?.support).toBe('full')
  })

  it('parse 覆盖 model/effort/compact/rewind/mcps/skill', () => {
    expect(parseSessionCommand('model grok-4.5')).toEqual({
      kind: 'model',
      modelId: 'grok-4.5'
    })
    expect(parseSessionCommand('/effort low')).toEqual({
      kind: 'effort',
      effort: 'low'
    })
    expect(parseSessionCommand('compact keep plan')).toEqual({
      kind: 'compact',
      preserveHint: 'keep plan'
    })
    expect(parseSessionCommand('rewind')).toEqual({ kind: 'rewind' })
    expect(parseSessionCommand('mcps list')).toEqual({ kind: 'mcps', action: 'list' })
    expect(parseSessionCommand('mcps enable foo')).toEqual({
      kind: 'mcps',
      action: 'enable',
      name: 'foo'
    })
    expect(parseSessionCommand('/review --fast')).toEqual({
      kind: 'skill',
      skillName: 'review',
      args: '--fast'
    })
  })
})
