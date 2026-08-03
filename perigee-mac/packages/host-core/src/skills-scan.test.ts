import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { filterSkills, scanGrokSkills } from './skills-scan.js'

describe('scanGrokSkills / filterSkills', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'gd-skills-home-'))
    mkdirSync(join(home, '.grok/skills/demo-skill'), { recursive: true })
    writeFileSync(
      join(home, '.grok/skills/demo-skill/SKILL.md'),
      '# Demo\n\nA demo skill for tests.\n'
    )
    mkdirSync(join(home, '.grok/bundled/skills/bundled-one'), { recursive: true })
    writeFileSync(join(home, '.grok/bundled/skills/bundled-one/SKILL.md'), '# B\n\nBundled desc.\n')
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('扫描 user + bundled', () => {
    const list = scanGrokSkills(home)
    expect(list.map((s) => s.name).sort()).toEqual(['bundled-one', 'demo-skill'])
    expect(list.find((s) => s.name === 'demo-skill')?.description).toMatch(/demo skill/i)
  })

  it('filter 按名', () => {
    const list = scanGrokSkills(home)
    expect(filterSkills('demo', list)).toHaveLength(1)
    expect(filterSkills('', list).length).toBeGreaterThan(0)
  })
})
