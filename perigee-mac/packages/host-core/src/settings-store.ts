import { readFileSync, existsSync } from 'node:fs'
import {
  type PermissionPolicy,
  normalizePermissionPolicy
} from '@perigee/engine-protocol'
import { writeJsonAtomic } from './atomic-write.js'

/** headless = grok -p；acp = grok agent stdio（波次2）；grok-build = headless 别名 */
export type EngineMode = 'acp' | 'headless' | 'stub' | 'grok-build'

/** 权限策略：单源 engine-protocol（MEGA §12.2） */
export type { PermissionPolicy }

function cloneDefaults(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    layout: {
      ...DEFAULT_SETTINGS.layout,
      panes: { ...DEFAULT_SETTINGS.layout.panes }
    },
    mcp: { servers: [...DEFAULT_SETTINGS.mcp.servers] },
    gcu: { ...DEFAULT_SETTINGS.gcu }
  }
}

/** 合并 layout：兼容旧 settings.json（无 panes / filePaneWidth / terminalHeight） */
export function mergeLayout(raw?: Partial<AppSettings['layout']> | null): AppSettings['layout'] {
  const base = {
    ...DEFAULT_SETTINGS.layout,
    panes: { ...DEFAULT_SETTINGS.layout.panes }
  }
  if (!raw) return base
  const filePaneWidth =
    typeof raw.filePaneWidth === 'number'
      ? raw.filePaneWidth
      : typeof raw.contextWidth === 'number'
        ? raw.contextWidth
        : base.filePaneWidth
  const mainPane =
    raw.mainPane === 'chat' ||
    raw.mainPane === 'split' ||
    raw.mainPane === 'diff' ||
    raw.mainPane === 'file'
      ? raw.mainPane
      : base.mainPane
  return {
    ...base,
    ...raw,
    filePaneWidth,
    mainPane,
    panes: {
      ...base.panes,
      ...(raw.panes ?? {})
    }
  }
}

export interface AppSettings {
  engineMode: EngineMode
  grokBinary: string
  model: string
  maxTurns: number
  /** 兼容字段：与 permissionPolicy 同步（ask→false，yolo→true） */
  alwaysApproveTools: boolean
  /** 产品默认 ask（对齐 Claude Code Desktop Manual，推荐新人审） */
  permissionPolicy: PermissionPolicy
  /** 单回合超时 ms */
  turnTimeoutMs: number
  /** ACP 失败时自动回退 headless */
  acpFallbackHeadless: boolean
  /** Git 仓是否为每会话建 worktree（ADR 0009） */
  useWorktree: boolean
  /** 非活动会话回合结束时 OS 通知 */
  notifyOnTurnEnd: boolean
  /**
   * 终端命令执行（E：非完整交互 PTY，会话 cwd 下 spawn shell -c）。
   * 默认关；开启后 terminal.write 真跑命令。
   */
  terminalShellEnabled: boolean
  /**
   * 跨会话消息闸（F2）。默认关；开启后允许 session.sendCross。
   */
  crossSessionSendEnabled: boolean
  theme: 'dark' | 'light'
  fontSize: number
  layout: {
    railWidth: number
    /** @deprecated 迁移至 filePaneWidth；读时兼容 */
    contextWidth: number
    /** 独立文件列宽度（波次 C） */
    filePaneWidth: number
    /** 检查器宽度 */
    inspectorWidth: number
    /** 底栏终端高度 */
    terminalHeight: number
    /** 对话视图模式：normal | verbose | summary */
    viewMode: 'normal' | 'verbose' | 'summary'
    /**
     * 主区布局：chat | split | diff | file（文件升主区）
     */
    mainPane: 'chat' | 'split' | 'diff' | 'file'
    /** @deprecated 文件/终端已独立 pane；读时兼容 */
    contextTab: 'files' | 'md' | 'diff' | 'terminal' | 'settings'
    /** 分区显隐（波次 C） */
    panes: {
      file: boolean
      terminal: boolean
      inspector: boolean
    }
  }
  mcp: {
    servers: {
      name: string
      command: string
      enabled: boolean
      args?: string[]
      url?: string
      type?: 'stdio' | 'http' | 'sse'
    }[]
  }
  gcu: {
    bridgeUrl: string
  }
  /** 最近一次预览 URL（壳配置，非 CLI） */
  lastPreviewUrl?: string
  /**
   * 终端模式：echo | shell-c | pty（pty 需原生模块，不可用时降级）
   */
  terminalMode?: 'echo' | 'shell-c' | 'pty'
}

export const DEFAULT_SETTINGS: AppSettings = {
  // 主路径 ACP；失败可 fallback
  engineMode: 'acp',
  grokBinary: '',
  model: '',
  maxTurns: 30,
  alwaysApproveTools: false,
  permissionPolicy: 'ask',
  turnTimeoutMs: 600_000,
  acpFallbackHeadless: true,
  useWorktree: true,
  notifyOnTurnEnd: true,
  terminalShellEnabled: false,
  crossSessionSendEnabled: false,
  theme: 'dark',
  fontSize: 13.5,
  layout: {
    railWidth: 260,
    contextWidth: 380,
    filePaneWidth: 420,
    inspectorWidth: 400,
    terminalHeight: 220,
    viewMode: 'normal',
    mainPane: 'chat',
    contextTab: 'files',
    panes: {
      file: false,
      terminal: false,
      inspector: true
    }
  },
  mcp: {
    servers: [
      {
        name: 'grok-computer-use',
        command: 'gcu-bridge',
        enabled: true
      }
    ]
  },
  gcu: {
    bridgeUrl: 'http://127.0.0.1:19527'
  },
  lastPreviewUrl: 'http://127.0.0.1:3000',
  terminalMode: 'echo'
}

export class SettingsStore {
  constructor(private filePath: string) {}

  load(): AppSettings {
    try {
      if (!existsSync(this.filePath)) return cloneDefaults()
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
      const mode = raw.engineMode === 'grok-build' ? 'headless' : raw.engineMode
      // 权限双字段归一：优先 permissionPolicy；旧配置仅有 alwaysApproveTools 时反推
      let permissionPolicy: PermissionPolicy = DEFAULT_SETTINGS.permissionPolicy
      let alwaysApproveTools = DEFAULT_SETTINGS.alwaysApproveTools
      if (raw.permissionPolicy !== undefined && raw.permissionPolicy !== null) {
        permissionPolicy = normalizePermissionPolicy(raw.permissionPolicy)
        alwaysApproveTools = permissionPolicy === 'yolo'
      } else if (typeof raw.alwaysApproveTools === 'boolean') {
        alwaysApproveTools = raw.alwaysApproveTools
        permissionPolicy = alwaysApproveTools ? 'yolo' : 'ask'
      }
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        engineMode: (mode as AppSettings['engineMode']) ?? DEFAULT_SETTINGS.engineMode,
        permissionPolicy,
        alwaysApproveTools,
        layout: mergeLayout(raw.layout),
        mcp: {
          servers: raw.mcp?.servers ?? DEFAULT_SETTINGS.mcp.servers
        },
        gcu: { ...DEFAULT_SETTINGS.gcu, ...raw.gcu },
        lastPreviewUrl: raw.lastPreviewUrl ?? DEFAULT_SETTINGS.lastPreviewUrl,
        terminalMode: raw.terminalMode ?? DEFAULT_SETTINGS.terminalMode
      }
    } catch {
      return cloneDefaults()
    }
  }

  save(settings: AppSettings): void {
    writeJsonAtomic(this.filePath, settings)
  }

  update(
    partial: Omit<Partial<AppSettings>, 'layout'> & {
      layout?: Omit<Partial<AppSettings['layout']>, 'panes'> & {
        panes?: Partial<AppSettings['layout']['panes']>
      }
    }
  ): AppSettings {
    const cur = this.load()
    const next: AppSettings = {
      ...cur,
      ...partial,
      layout: partial.layout
        ? {
            ...cur.layout,
            ...partial.layout,
            panes: {
              ...cur.layout.panes,
              ...(partial.layout.panes ?? {})
            }
          }
        : cur.layout,
      mcp: partial.mcp ?? cur.mcp,
      gcu: { ...cur.gcu, ...partial.gcu }
    }
    // 权限双字段互相同步：以 permissionPolicy 为准；仅改 alwaysApprove 时反推 policy
    if (partial.permissionPolicy !== undefined) {
      next.permissionPolicy = normalizePermissionPolicy(partial.permissionPolicy)
      next.alwaysApproveTools = next.permissionPolicy === 'yolo'
    } else if (partial.alwaysApproveTools !== undefined) {
      next.permissionPolicy = partial.alwaysApproveTools ? 'yolo' : 'ask'
      next.alwaysApproveTools = partial.alwaysApproveTools
    }
    this.save(next)
    return next
  }
}
