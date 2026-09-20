/**
 * 窗上权限档 ↔ 官方 CLI permission_mode / Plan。
 * 名称跟官方：Ask / Auto / Always-approve；Plan 独立。
 * 不写 CLI 配置文件。引擎四态只在这里映射一次。
 */
import type { AgentEnginePolicy, AgentModeState, AgentPermMode } from './types.js'

export const AGENT_PERM_MODES: AgentPermMode[] = ['ask', 'auto', 'always-approve']

const MODE_LABEL: Record<AgentPermMode, string> = {
  ask: '问我',
  auto: '自动',
  'always-approve': '全放行'
}

const MODE_OFFICIAL: Record<AgentPermMode, string> = {
  ask: 'Ask',
  auto: 'Auto',
  'always-approve': 'Always-approve'
}

export function isAgentPermMode(value: unknown): value is AgentPermMode {
  return value === 'ask' || value === 'auto' || value === 'always-approve'
}

/** CLI / 人口令 → 官方三档 */
export function parseAgentPermMode(raw: unknown): AgentPermMode | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (!t) return null
  if (t === 'ask' || t === '问我' || t === 'default' || t === 'manual') return 'ask'
  if (t === 'auto' || t === '自动') return 'auto'
  if (
    t === 'always-approve' ||
    t === 'always' ||
    t === 'yolo' ||
    t === 'bypass' ||
    t === '全放行' ||
    t === 'full'
  ) {
    return 'always-approve'
  }
  return null
}

export function parsePlanFlag(raw: unknown): boolean | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!t) return null
  if (t === 'on' || t === '1' || t === 'true' || t === '开' || t === 'yes') return true
  if (t === 'off' || t === '0' || t === 'false' || t === '关' || t === 'no') return false
  return null
}

/** 读 CLI 快照的 permission_mode。host-core 的 auto→ask 只用于旧桌面四态，这里保留官方 Auto。 */
export function cliModeFromSnapshot(raw: unknown): AgentPermMode {
  return parseAgentPermMode(raw) ?? 'ask'
}

export function modeLabel(mode: AgentPermMode): string {
  return MODE_LABEL[mode]
}

export function modeOfficial(mode: AgentPermMode): string {
  return MODE_OFFICIAL[mode]
}

/** Plan 开时引擎走 plan（ACP session/set_mode=plan）；关则按三档。 */
export function enginePolicyOf(mode: AgentPermMode, plan: boolean): AgentEnginePolicy {
  if (plan) return 'plan'
  if (mode === 'always-approve') return 'yolo'
  if (mode === 'auto') return 'accept_edits'
  return 'ask'
}

export function coverNoteOf(mode: AgentPermMode, cliMode: AgentPermMode, plan: boolean): string | null {
  const bits: string[] = []
  if (cliMode === 'always-approve' && mode !== 'always-approve') {
    bits.push(
      'CLI 配置是全放行（Always-approve）。窗上改档拦不住 CLI 自己放行的工具；只有引擎还收到的批准请求会按窗上的档走。'
    )
  } else if (mode === 'always-approve' && cliMode !== 'always-approve') {
    bits.push('窗上全放行：引擎会自动批本会话收到的批准请求。没有改 CLI 配置文件。')
  } else if (mode === 'auto' && cliMode !== 'auto') {
    bits.push('窗上自动：安全类工具引擎会先批，危险的仍会问。不是终端里的 /auto，也没改 CLI 配置。')
  } else if (mode === 'ask' && cliMode === 'auto') {
    bits.push('CLI 配置是 Auto。窗上问我：引擎收到的批准会停下来问你；CLI 自己先放行的仍可能过。')
  }
  if (plan) {
    bits.push('Plan 开：下一轮先写计划再改文件。')
  }
  return bits.length ? bits.join(' ') : null
}

export function buildAgentModeState(input: {
  mode: AgentPermMode
  plan: boolean
  cliMode: AgentPermMode
  followCli: boolean
  liveApply: string
  effort?: string
  sandbox?: string
}): AgentModeState {
  return {
    mode: input.mode,
    plan: input.plan,
    cliMode: input.cliMode,
    followCli: input.followCli,
    policy: enginePolicyOf(input.mode, input.plan),
    coverNote: coverNoteOf(input.mode, input.cliMode, input.plan),
    liveApply: input.liveApply,
    label: modeLabel(input.mode),
    official: modeOfficial(input.mode),
    effort: input.effort ?? '',
    sandbox: input.sandbox ?? 'off'
  }
}
