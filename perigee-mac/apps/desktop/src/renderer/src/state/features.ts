import type { CommandCapability, CommandSupport } from '../lib/perigee-api'

/**
 * 桥 feature-detect（T007 对齐 T005 真实契约）。
 * 探测 preload 方法存在性；命令粒度走 commandCapabilities() 逐项判定。
 * 未就绪 → 入口置灰并注明「桥接中」，不做假按钮（纲领 §5）。
 */

export type BridgeFeatures = {
  /** CLI 历史会话枚举（session.listExternal） */
  cliSessions: boolean
  /** CLI 会话恢复（session.resumeExternal；ACP-only，运行时还需 engineMode=acp） */
  resumeExternal: boolean
  /** Slash/命令路由（session.command + commandCapabilities） */
  command: boolean
  /** 剪贴板图片落盘（T006 桥，未就绪保持置灰） */
  saveClipboardImage: boolean
  /** 拖放 File → 路径（T006 桥，未就绪保持置灰） */
  filePathForDrop: boolean
  /** 上下文窗口占比（T006 桥，未就绪只显示 tokens） */
  contextInfo: boolean
  /** 模型列表（integrations.listModels） */
  listModels: boolean
  /** T008：已读追踪（session.markRead + list 带 attention 字段） */
  readTracking: boolean
  /** T008：用量聚合（stats.usage） */
  stats: boolean
  /** T008：UI 状态持久化桶（uiState.get/set；未就绪降级 localStorage） */
  uiState: boolean
  /** T018：定时任务（routines.list/create/…；未就绪则 Routines 入口整块隐藏） */
  routines: boolean
}

export function detectFeatures(): BridgeFeatures {
  const api = typeof window !== 'undefined' ? window.perigee : undefined
  const a = api as unknown as Record<string, unknown> | undefined
  const session = a?.['session'] as Record<string, unknown> | undefined
  const clipboard = a?.['clipboard'] as Record<string, unknown> | undefined
  const fs = a?.['fs'] as Record<string, unknown> | undefined
  const integrations = a?.['integrations'] as Record<string, unknown> | undefined
  const stats = a?.['stats'] as Record<string, unknown> | undefined
  const uiState = a?.['uiState'] as Record<string, unknown> | undefined
  const routines = a?.['routines'] as Record<string, unknown> | undefined
  return {
    cliSessions: typeof session?.['listExternal'] === 'function',
    resumeExternal: typeof session?.['resumeExternal'] === 'function',
    command:
      typeof session?.['command'] === 'function' &&
      typeof session?.['commandCapabilities'] === 'function',
    saveClipboardImage: typeof clipboard?.['saveImage'] === 'function',
    filePathForDrop: typeof fs?.['pathForFile'] === 'function',
    contextInfo: typeof session?.['contextInfo'] === 'function',
    listModels: typeof integrations?.['listModels'] === 'function',
    readTracking: typeof session?.['markRead'] === 'function',
    stats: typeof stats?.['usage'] === 'function',
    uiState: typeof uiState?.['get'] === 'function' && typeof uiState?.['set'] === 'function',
    routines:
      typeof routines?.['list'] === 'function' && typeof routines?.['onChanged'] === 'function'
  }
}

/* ---------- 命令能力（T005 commandCapabilities） ---------- */

let capsCache: CommandCapability[] | null = null
let capsInflight: Promise<CommandCapability[]> | null = null

/** 拉取命令能力表（带缓存；失败返回空表 = 全 unsupported） */
export function fetchCommandCapabilities(): Promise<CommandCapability[]> {
  if (capsCache) return Promise.resolve(capsCache)
  if (capsInflight) return capsInflight
  capsInflight = window.perigee.session
    .commandCapabilities()
    .then((caps) => {
      capsCache = Array.isArray(caps) ? caps : []
      return capsCache
    })
    .catch(() => {
      capsCache = []
      return capsCache
    })
    .finally(() => {
      capsInflight = null
    })
  return capsInflight
}

/** 单项命令的支持状态（缺表/缺项 = unsupported，安全降级） */
export function capabilityOf(caps: CommandCapability[] | null, name: string): CommandSupport {
  if (!caps) return 'unsupported'
  return caps.find((c) => c.name === name)?.support ?? 'unsupported'
}
