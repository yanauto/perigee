/** 官方 `--effort` / `--sandbox`。窗上只记偏好，不写 ~/.grok。 */

export const EFFORT_LEVELS = ['low', 'medium', 'high'] as const
export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export const SANDBOX_PROFILES = ['off', 'workspace', 'read-only', 'strict'] as const
export type SandboxProfile = (typeof SANDBOX_PROFILES)[number]

export function parseEffort(raw: unknown): EffortLevel | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (t === 'low' || t === 'medium' || t === 'high') return t
  if (t === 'off' || t === 'default' || t === 'cli' || t === '') return null
  return null
}

export function parseSandbox(raw: unknown): SandboxProfile | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (t === 'off' || t === 'workspace' || t === 'read-only' || t === 'readonly' || t === 'strict') {
    return t === 'readonly' ? 'read-only' : (t as SandboxProfile)
  }
  if (t === 'cli' || t === 'default' || t === '') return null
  return null
}

export function effortLabel(level: EffortLevel | ''): string {
  if (level === 'low') return '少想'
  if (level === 'medium') return '中等'
  if (level === 'high') return '多想'
  return '跟 CLI'
}

export function sandboxLabel(profile: SandboxProfile): string {
  if (profile === 'off') return '关'
  if (profile === 'workspace') return '工作区'
  if (profile === 'read-only') return '只读'
  return '严格'
}
