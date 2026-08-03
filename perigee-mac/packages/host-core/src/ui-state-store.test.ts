import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { UiStateStore } from './ui-state-store.js'

describe('UiStateStore', () => {
  it('get/set 持久化', () => {
    const path = join(tmpdir(), `ui-state-${Date.now()}.json`)
    const s = new UiStateStore(path)
    expect(s.get('home.groups')).toBeUndefined()
    s.set('home.groups', { a: 1, b: ['x'] })
    expect(s.get('home.groups')).toEqual({ a: 1, b: ['x'] })
    const s2 = new UiStateStore(path)
    expect(s2.get('home.groups')).toEqual({ a: 1, b: ['x'] })
    s2.set('home.groups', undefined)
    expect(s2.get('home.groups')).toBeUndefined()
    rmSync(path, { force: true })
  })
})
