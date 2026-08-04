/**
 * ACP 侧权限分类器与 mode 映射。
 * 四态 type + normalize：**单源** `@perigee/engine-protocol`（勿再复制）。
 */
import {
  type PermissionPolicy,
  normalizePermissionPolicy
} from '@perigee/engine-protocol'

export type { PermissionPolicy }
export { normalizePermissionPolicy }

/** Host 分类器裁决（兜底；原生 session/set_mode 优先） */
export type PermissionVerdict = 'allow' | 'deny' | 'pending'

export type ToolPermissionContext = {
  /** 工具名 / title（request_permission 里 toolName / toolCall.title） */
  toolName?: string
  /** tool kind 若引擎有上报 */
  kind?: string
  /** 原始 detail / JSON 摘要 */
  detail?: string
  /** 可解析到的路径线索 */
  paths?: string[]
}

/** client fs/write_text_file 是否允许静默落盘 */
export function allowsSilentClientWrite(policy: PermissionPolicy): boolean {
  return policy === 'yolo' || policy === 'accept_edits'
}

/** client fs/write 是否在 plan 下硬拒 */
export function deniesClientWrite(policy: PermissionPolicy): boolean {
  return policy === 'plan'
}

/**
 * 旧接口：yolo 全自动；accept_edits **不再** 无脑全放（改走 classifyToolPermission）。
 * 保留：仅 yolo 视为「一律 auto-approve」。
 */
export function autoApprovesToolPermission(policy: PermissionPolicy): boolean {
  return policy === 'yolo'
}

/**
 * Desktop → ACP `session/set_mode` 的 modeId。
 * vendor SessionMode 实测：plan / ask / default（acceptEdits/yolo 走 Host 分类 + 客户端闸）。
 */
export function policyToAcpModeId(policy: PermissionPolicy): string {
  switch (policy) {
    case 'plan':
      return 'plan'
    case 'ask':
      return 'ask'
    case 'accept_edits':
    case 'yolo':
      return 'default'
    default:
      return 'default'
  }
}

/** 危险 shell / 破坏性命令启发式（accept_edits 下仍 pending；plan 下 deny） */
const DANGEROUS_SHELL_RE =
  /\b(rm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r)|rm\s+-rf|git\s+push\s+.*--force|git\s+push\s+-f|git\s+reset\s+--hard|curl\s+[^\n|]*\|\s*(ba)?sh|wget\s+[^\n|]*\|\s*(ba)?sh|dd\s+if=|mkfs\.|chmod\s+-R\s+777|sudo\s+|:\(\)\s*\{\s*:\|:&\s*\})/i

/** 常见「非危险」FS 命令（accept_edits 可 auto；不含 npm/pip install） */
const COMMON_FS_CMD_RE =
  /\b(mkdir|touch|mv|cp|chmod|chown|ln\s|rsync|tee|cat\s*>|echo\s+.*>)\b/i

/** 只读 / 探索类 */
const READONLY_TOOL_RE =
  /\b(read|read_file|read_text|list|ls|glob|grep|search|find|stat|cat|head|tail|tree|pwd|which|type|file|wc|diff|git\s+(status|log|diff|show|branch|remote)|rg|fd)\b/i

/** 写源码 / 编辑类工具名 */
const WRITE_TOOL_RE =
  /\b(write|write_file|write_text|edit|str_replace|apply_patch|create_file|delete_file|remove_file|fs_write|search_replace|multi_edit)\b/i

/** shell / bash / run 类 */
const SHELL_TOOL_RE = /\b(bash|shell|run_terminal|run_command|execute|terminal|cmd|powershell)\b/i

/**
 * Flyby 浏览器控制工具（ADR 0010：高风险效应器）。
 * 只读状态类 vs 会改浏览器状态的动作。
 */
// 注意：browser_status 等以下划线连接，不能写 browser_\b（_ 后无词界）
const GCU_TOOL_RE =
  /browser_|tabs_|page_|windows_|workspace_|\bgcu\b|computer[\s_-]?use|grok-computer-use/i
const GCU_READONLY_RE =
  /browser_status|tabs_list|windows_list|workspace_list|page_read|page_screenshot|page_url|page_title/i

function haystack(ctx: ToolPermissionContext): string {
  return [ctx.toolName, ctx.kind, ctx.detail, ...(ctx.paths ?? [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export function isComputerUseTool(ctx: ToolPermissionContext): boolean {
  return GCU_TOOL_RE.test(haystack(ctx))
}

export function isComputerUseReadonly(ctx: ToolPermissionContext): boolean {
  return GCU_READONLY_RE.test(haystack(ctx))
}

export function isDangerousShell(text: string): boolean {
  return DANGEROUS_SHELL_RE.test(text)
}

export function isCommonFsCommand(text: string): boolean {
  return COMMON_FS_CMD_RE.test(text)
}

export function isReadonlyTool(ctx: ToolPermissionContext): boolean {
  const h = haystack(ctx)
  if (WRITE_TOOL_RE.test(h)) return false
  if (ctx.kind && /read|search|explore/i.test(ctx.kind)) return true
  return READONLY_TOOL_RE.test(h)
}

export function isWriteLikeTool(ctx: ToolPermissionContext): boolean {
  const h = haystack(ctx)
  if (ctx.kind && /edit|write|delete/i.test(ctx.kind)) return true
  return WRITE_TOOL_RE.test(h)
}

export function isShellLikeTool(ctx: ToolPermissionContext): boolean {
  const h = haystack(ctx)
  if (ctx.kind && /execute|terminal|shell/i.test(ctx.kind)) return true
  return SHELL_TOOL_RE.test(h)
}

/**
 * §12.2b 分类器：对 request_permission 的 Host 兜底裁决。
 *
 * | 类别 | accept_edits | plan | ask | yolo |
 * | 源码写 | allow | deny | pending | allow |
 * | 常见 FS | allow | deny（改树）/ allow 只读 | pending | allow |
 * | 危险 shell | pending | deny | pending | allow |
 * | Flyby 只读 | allow | allow | pending | allow |
 * | Flyby 动作 | **pending** | deny | pending | allow |
 * | 只读 | allow | allow | pending | allow |
 */
export function classifyToolPermission(
  policy: PermissionPolicy,
  ctx: ToolPermissionContext
): PermissionVerdict {
  if (policy === 'yolo') return 'allow'
  if (policy === 'ask') return 'pending'

  const h = haystack(ctx)
  const dangerous = isDangerousShell(h)
  const writeLike = isWriteLikeTool(ctx)
  const shellLike = isShellLikeTool(ctx)
  const readonly = isReadonlyTool(ctx)
  const commonFs = shellLike && isCommonFsCommand(h) && !dangerous
  const cu = isComputerUseTool(ctx)
  const cuRo = isComputerUseReadonly(ctx)

  if (policy === 'plan') {
    if (cu) return cuRo ? 'allow' : 'deny'
    if (dangerous) return 'deny'
    if (writeLike) return 'deny'
    if (shellLike && !readonly) {
      // plan：探索性可读/列目录可；改源码树 deny
      if (commonFs || /\b(mkdir|touch|mv|cp|rm|chmod|chown)\b/i.test(h)) return 'deny'
      // 其它 shell 宁可 pending，避免假绿 allow
      return 'pending'
    }
    if (readonly) return 'allow'
    // 未知工具：pending 更安全
    return 'pending'
  }

  // accept_edits：源码写可 auto；Flyby 动作默认 pending（ADR 0010 高风险）
  if (cu) return cuRo ? 'allow' : 'pending'
  if (dangerous) return 'pending'
  if (writeLike) return 'allow'
  if (commonFs) return 'allow'
  if (readonly) return 'allow'
  if (shellLike) return 'pending'
  // 未知：pending（不可只靠启发式假绿）
  return 'pending'
}

/** 从 options 挑 deny/reject 类 optionId */
export function pickDenyOptionId(options: unknown): string | undefined {
  if (!Array.isArray(options)) return undefined
  const opts = options
    .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}))
    .map((o) => ({ id: String(o.optionId ?? o.id ?? ''), kind: String(o.kind ?? '') }))
    .filter((o) => o.id)
  const by = (pred: (o: { id: string; kind: string }) => boolean) => opts.find(pred)?.id
  return (
    by((o) => o.kind === 'reject_once' || o.kind === 'deny_once') ??
    by((o) => /reject|deny|cancel/i.test(o.kind)) ??
    by((o) => /reject|deny|cancel|refuse/i.test(o.id))
  )
}

/** ACP 子进程 argv（全局 flag 在 subcommand 前） */
export function buildAcpStdioArgs(): string[] {
  return ['--no-auto-update', 'agent', 'stdio']
}

/**
 * 将 Desktop settings.mcp.servers 转为 ACP session/new 的 mcpServers 数组。
 * stdio 形状（agent-client-protocol）：{ name, command, args?, env? }
 * command 字段可含参数（按 shell 空白切分）。
 */
export type DesktopMcpServer = {
  name: string
  command: string
  enabled: boolean
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  /** http / sse URL（可选） */
  url?: string
  type?: 'stdio' | 'http' | 'sse'
}

export function buildAcpMcpServers(
  servers: DesktopMcpServer[] | undefined | null
): Array<Record<string, unknown>> {
  if (!servers?.length) return []
  const out: Array<Record<string, unknown>> = []
  for (const s of servers) {
    if (!s.enabled || !s.name) continue
    if (s.url || s.type === 'http' || s.type === 'sse') {
      const url = s.url
      if (!url) continue
      out.push({
        type: s.type === 'sse' ? 'sse' : 'http',
        name: s.name,
        url,
        headers: s.headers
          ? Object.entries(s.headers).map(([name, value]) => ({ name, value }))
          : []
      })
      continue
    }
    const cmd = (s.command || '').trim()
    if (!cmd) continue
    let command = cmd
    let args = s.args ? [...s.args] : []
    if (!s.args?.length) {
      const parts = splitCommandLine(cmd)
      if (parts.length > 0) {
        command = parts[0]!
        args = parts.slice(1)
      }
    }
    out.push({
      type: 'stdio',
      name: s.name,
      command,
      args,
      env: s.env
        ? Object.entries(s.env).map(([name, value]) => ({ name, value }))
        : []
    })
  }
  return out
}

/** 简易命令行切分（支持引号） */
export function splitCommandLine(line: string): string[] {
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return out
}
