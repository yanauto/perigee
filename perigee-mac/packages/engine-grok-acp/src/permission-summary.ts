/**
 * 人审卡文案：从 ACP request_permission 抽大白话 action/detail，
 * 禁止把整包 params JSON 丢给 UI。
 */
import { extractPathsFromToolArgs } from '@perigee/event-schema'

export type PermissionSummary = {
  /** 短标题（卡头）：执行命令 / 写入文件 / … */
  action: string
  /** 正文：命令串或路径等，人可读 */
  detail: string
  /** 原始工具名/title，供分类器与风险启发式用 */
  toolName: string
  kind: string
  paths: string[]
}

const CMD_KEYS = ['command', 'cmd', 'script', 'shell', 'code', 'bash', 'powershell'] as const
const PATH_KEYS = ['path', 'file', 'file_path', 'filepath', 'target', 'uri'] as const

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function strField(o: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 从 rawInput / title 抽出真正要执行的命令 */
export function extractCommand(rawInput: unknown, title = ''): string {
  if (typeof rawInput === 'string') {
    const s = rawInput.trim()
    if (!s) return ''
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return extractCommand(JSON.parse(s), title)
      } catch {
        return s
      }
    }
    return s
  }
  const o = asRecord(rawInput)
  if (o) {
    const direct = strField(o, CMD_KEYS)
    if (direct) return direct
    const nested = asRecord(o.input) ?? asRecord(o.rawInput) ?? asRecord(o.args)
    if (nested) {
      const inner = strField(nested, CMD_KEYS)
      if (inner) return inner
    }
  }
  const t = title.trim()
  if (!t) return ''
  // Execute `cmd` / Run `cmd`
  const tick = t.match(/`([^`]+)`/)
  if (tick?.[1]?.trim()) return tick[1].trim()
  const prefixed = t.match(/^(?:Execute|Run|Shell|Bash)\s+(.+)$/i)
  if (prefixed?.[1]?.trim()) return prefixed[1].trim().replace(/^`|`$/g, '')
  return ''
}

function extractPathHint(rawInput: unknown, paths: string[]): string {
  if (paths[0]) return paths[0]
  const o = asRecord(rawInput)
  if (!o) return typeof rawInput === 'string' ? rawInput.trim() : ''
  const p = strField(o, PATH_KEYS)
  if (p) return p
  const nested = asRecord(o.input) ?? asRecord(o.args)
  if (nested) {
    const p2 = strField(nested, PATH_KEYS)
    if (p2) return p2
  }
  return ''
}

function extractDescription(rawInput: unknown, toolCall: Record<string, unknown>): string {
  if (typeof toolCall.description === 'string' && toolCall.description.trim()) {
    return toolCall.description.trim()
  }
  const o = asRecord(rawInput)
  if (o && typeof o.description === 'string' && o.description.trim()) {
    return o.description.trim()
  }
  return ''
}

function looksShell(kind: string, toolName: string, title: string, command: string): boolean {
  if (command) return true
  if (/execute|terminal|shell|bash/i.test(kind)) return true
  if (/\b(bash|shell|run_terminal|run_command|execute|terminal|cmd|powershell)\b/i.test(toolName)) {
    return true
  }
  if (/^(Execute|Run|Shell|Bash)\b/i.test(title)) return true
  return false
}

function looksWrite(kind: string, toolName: string): boolean {
  if (/edit|write|delete/i.test(kind)) return true
  return /\b(write|write_file|write_text|edit|str_replace|apply_patch|create_file|delete_file|remove_file|fs_write|search_replace|multi_edit)\b/i.test(
    toolName
  )
}

function looksRead(kind: string, toolName: string): boolean {
  if (/read|search|explore/i.test(kind)) return true
  return /\b(read|read_file|read_text|list|ls|glob|grep|search|find|stat|cat|head|tail)\b/i.test(
    toolName
  )
}

function looksBrowser(kind: string, toolName: string, title: string): boolean {
  const h = `${kind}\n${toolName}\n${title}`
  return /browser_|tabs_|page_|windows_|workspace_|\bgcu\b|computer[\s_-]?use|grok-computer-use/i.test(
    h
  )
}

/**
 * 从 request_permission 的 params 生成人话摘要。
 * 输入为完整 params 或已拆好的字段均可。
 */
export function summarizePermissionRequest(params: Record<string, unknown>): PermissionSummary {
  const toolCall = asRecord(params.toolCall) ?? {}
  const kind = String(toolCall.kind ?? params.kind ?? '')
  const toolName = String(
    params.toolName || params.tool || toolCall.toolName || toolCall.name || ''
  )
  const title = String(toolCall.title ?? params.title ?? '')
  const rawInput = toolCall.rawInput ?? toolCall.input ?? params.rawInput ?? params.input
  const paths = extractPathsFromToolArgs(rawInput)
  const command = extractCommand(rawInput, title)
  const pathHint = extractPathHint(rawInput, paths)
  const desc = extractDescription(rawInput, toolCall)
  const classifyName = toolName || title || kind || 'tool'

  if (looksShell(kind, toolName, title, command)) {
    const detail = command || title || desc || '（无命令详情）'
    return {
      action: '执行命令',
      detail,
      toolName: classifyName,
      kind: kind || 'execute',
      paths
    }
  }

  if (looksWrite(kind, toolName) || (pathHint && /write|edit|delete/i.test(`${kind} ${toolName}`))) {
    return {
      action: '写入文件',
      detail: pathHint || title || desc || '（无路径）',
      toolName: classifyName,
      kind: kind || 'edit',
      paths: paths.length ? paths : pathHint ? [pathHint] : []
    }
  }

  if (looksRead(kind, toolName)) {
    return {
      action: '读取文件',
      detail: pathHint || title || desc || '（无路径）',
      toolName: classifyName,
      kind: kind || 'read',
      paths: paths.length ? paths : pathHint ? [pathHint] : []
    }
  }

  if (looksBrowser(kind, toolName, title)) {
    return {
      action: '浏览器操作',
      detail: title || toolName || desc || 'Computer Use',
      toolName: classifyName,
      kind: kind || 'browser',
      paths
    }
  }

  // 未知：短标题 + 可用线索，绝不 dump 整包 JSON
  const detail =
    command ||
    pathHint ||
    (title && title.length <= 200 ? title : '') ||
    desc ||
    (toolName && !/^tool$/i.test(toolName) ? toolName : '') ||
    '需要你确认后才能继续'
  return {
    action: '操作审批',
    detail,
    toolName: classifyName,
    kind,
    paths
  }
}

/** client fs/write_text_file 人审摘要 */
export function summarizeFsWrite(path: string, byteLength: number): PermissionSummary {
  const size =
    byteLength < 1024
      ? `${byteLength} B`
      : byteLength < 1024 * 1024
        ? `${(byteLength / 1024).toFixed(1)} KB`
        : `${(byteLength / 1024 / 1024).toFixed(1)} MB`
  return {
    action: '写入文件',
    detail: `${path} · ${size}`,
    toolName: 'write_text_file',
    kind: 'edit',
    paths: [path]
  }
}
