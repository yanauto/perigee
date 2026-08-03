/**
 * session.command 路由：解析命令串、能力矩阵（与真机探针一致）。
 * 实际执行在 Host/main（需引擎句柄）；本模块保持可单测的纯逻辑。
 */

export type CommandSupport = 'full' | 'partial' | 'unsupported'

export type CommandCapability = {
  name: string
  support: CommandSupport
  /** 给人看的原因 / 用法 */
  detail: string
  /** 探针/实现依据 */
  evidence?: string
}

export type ParsedSessionCommand =
  | { kind: 'model'; modelId: string }
  | { kind: 'effort'; effort: string }
  | { kind: 'compact'; preserveHint?: string }
  | { kind: 'rewind' }
  | { kind: 'mcps'; action: 'list' | 'enable' | 'disable'; name?: string }
  | { kind: 'skill'; skillName: string; args?: string }
  | { kind: 'unknown'; raw: string }

export type CommandResultStatus = 'ok' | 'unsupported' | 'error'

export type SessionCommandResult = {
  ok: boolean
  status: CommandResultStatus
  command: string
  detail: string
  data?: unknown
}

/** 与 2026-08-01 本机 ACP 探针一致的能力清单 */
export function sessionCommandCapabilities(): CommandCapability[] {
  return [
    {
      name: 'model',
      support: 'full',
      detail: 'session/set_model { sessionId, modelId }',
      evidence: 'ACP 探针 set_model → Ok；engine GrokAcpEngine.setModel'
    },
    {
      name: 'effort',
      support: 'full',
      detail:
        'session/set_model + _meta.reasoningEffort（low|medium|high）；同模型热切',
      evidence:
        'vendor pager Effect::SwitchModel 写 REASONING_EFFORT_META_KEY；本机探针 summary.reasoning_effort high→low'
    },
    {
      name: 'compact',
      support: 'full',
      detail: '经 session/prompt 发送 `/compact`（AvailableCommand）',
      evidence:
        'available_commands_update 含 compact；prompt `/compact` → stopReason end_turn totalTokens=0'
    },
    {
      name: 'rewind',
      support: 'unsupported',
      detail:
        'CLI `/rewind` 为 pager/shell 内部 handle_rewind，无 session/rewind ACP 方法；非 AvailableCommand',
      evidence:
        'ACP session/rewind Method not found；available_commands 无 rewind；diff.revertTurn 仅文件级'
    },
    {
      name: 'mcps',
      support: 'partial',
      detail: 'list/enable/disable 走 Desktop settings + CLI config 桥；无完整 mcp add UI',
      evidence: 'integrations.setMcpEnabled / loadGrokConfigSnapshot'
    },
    {
      name: 'skill',
      support: 'full',
      detail: 'session/prompt 发送 `/<skill>`（与 AvailableCommand 同名 skill）',
      evidence: 'available_commands 含 skills 名；与 compact 同路径 prompt 路由'
    }
  ]
}

export function parseSessionCommand(cmd: string): ParsedSessionCommand {
  const raw = cmd.trim()
  if (!raw) return { kind: 'unknown', raw: '' }
  // 允许前导 /
  const body = raw.startsWith('/') ? raw.slice(1).trim() : raw
  const m = body.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  if (!m) return { kind: 'unknown', raw }
  const name = m[1]!.toLowerCase()
  const args = (m[2] ?? '').trim()

  if (name === 'model' || name === 'm') {
    if (!args) return { kind: 'unknown', raw }
    return { kind: 'model', modelId: args.split(/\s+/)[0]! }
  }
  if (name === 'effort') {
    if (!args) return { kind: 'unknown', raw }
    return { kind: 'effort', effort: args.split(/\s+/)[0]!.toLowerCase() }
  }
  if (name === 'compact') {
    return { kind: 'compact', preserveHint: args || undefined }
  }
  if (name === 'rewind' || name === 'undo') {
    return { kind: 'rewind' }
  }
  if (name === 'mcps' || name === 'mcp') {
    if (!args || args === 'list') return { kind: 'mcps', action: 'list' }
    const parts = args.split(/\s+/)
    const act = parts[0]!.toLowerCase()
    if (act === 'enable' || act === 'on') {
      return { kind: 'mcps', action: 'enable', name: parts[1] }
    }
    if (act === 'disable' || act === 'off') {
      return { kind: 'mcps', action: 'disable', name: parts[1] }
    }
    if (act === 'list') return { kind: 'mcps', action: 'list' }
    return { kind: 'mcps', action: 'list' }
  }
  // 其余当 skill：/review → skill review
  return { kind: 'skill', skillName: name, args: args || undefined }
}

export function unsupportedResult(command: string, detail: string): SessionCommandResult {
  return { ok: false, status: 'unsupported', command, detail }
}

export function okResult(command: string, detail: string, data?: unknown): SessionCommandResult {
  return { ok: true, status: 'ok', command, detail, data }
}

export function errorResult(command: string, detail: string): SessionCommandResult {
  return { ok: false, status: 'error', command, detail }
}
