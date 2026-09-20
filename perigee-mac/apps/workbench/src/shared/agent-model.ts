/**
 * 窗上模型 ↔ 官方 `grok models` / `-m` / ACP session/set_model。
 * 不写 ~/.grok/config.toml。
 */
import type { AgentModelEntry } from './types.js'

export function isModelId(value: unknown): value is string {
  const t = String(value ?? '').trim()
  return /^[A-Za-z0-9._:+-]{2,80}$/.test(t)
}

/** 列表里的官方默认；没有标记时不选带 fast 的。 */
export function pickDefaultModel(
  models: AgentModelEntry[],
  cliDefault?: string
): string {
  const marked = models.find((m) => m.isDefault)?.id
  const fromCli = (cliDefault || marked || '').trim()
  if (fromCli && !/fast/i.test(fromCli)) return fromCli
  const notFast = models.find((m) => m.id && !/fast/i.test(m.id))
  if (notFast?.id) return notFast.id
  return fromCli || models[0]?.id || ''
}

export function mergeModelList(
  models: AgentModelEntry[],
  extra?: string
): AgentModelEntry[] {
  const out: AgentModelEntry[] = []
  for (const m of models) {
    const id = m.id.trim()
    if (!id || out.some((x) => x.id === id)) continue
    out.push({ id, isDefault: m.isDefault === true })
  }
  const add = extra?.trim() ?? ''
  if (add && !out.some((x) => x.id === add)) {
    out.unshift({ id: add })
  }
  return out
}
