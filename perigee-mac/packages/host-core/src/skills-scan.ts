import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

export type SkillEntry = {
  name: string
  path: string
  description: string
  source: 'user' | 'bundled'
}

/**
 * 扫描 ~/.grok/skills 与 ~/.grok/bundled/skills（只读列名 + 描述前几行）。
 * 探测失败返回空数组，不抛。
 */
export function scanGrokSkills(home = homedir()): SkillEntry[] {
  const roots: { dir: string; source: 'user' | 'bundled' }[] = [
    { dir: join(home, '.grok/skills'), source: 'user' },
    { dir: join(home, '.grok/bundled/skills'), source: 'bundled' }
  ]
  const out: SkillEntry[] = []
  const seen = new Set<string>()

  for (const { dir, source } of roots) {
    if (!existsSync(dir)) continue
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const skillDir = join(dir, name)
      let st
      try {
        st = statSync(skillDir)
      } catch {
        continue
      }
      // 符号链接目录也算
      const md = join(skillDir, 'SKILL.md')
      if (!st.isDirectory() && !existsSync(md)) continue
      if (!existsSync(md)) continue
      if (seen.has(name)) continue
      seen.add(name)
      let description = ''
      try {
        const text = readFileSync(md, 'utf8')
        // 取首个非空非 # 行作描述
        for (const line of text.split('\n')) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          if (t.startsWith('---')) continue
          description = t.replace(/^description:\s*/i, '').replace(/^["']|["']$/g, '').slice(0, 160)
          break
        }
      } catch {
        description = ''
      }
      out.push({ name, path: skillDir, description: description || name, source })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function filterSkills(query: string, skills: SkillEntry[], limit = 12): SkillEntry[] {
  const q = query.trim().toLowerCase().replace(/^\//, '')
  if (!q) return skills.slice(0, limit)
  return skills
    .filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .slice(0, limit)
}
