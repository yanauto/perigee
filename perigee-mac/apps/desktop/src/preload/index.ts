/**
 * Preload 必须能以 CJS 在 sandbox 中加载。
 * 勿依赖仅 ESM 的包；类型仅作注释，运行时不 import event-schema。
 */
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

/**
 * SessionEvent 不可从 event-schema ESM 直接 import（preload 必须 CJS）。
 * 形状与 packages/event-schema + renderer perigee-api 对齐；运行时只透传。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionEvent = any

const on = (channel: string, cb: (...args: unknown[]) => void): (() => void) => {
  const listener = (_: IpcRendererEvent, ...args: unknown[]) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (partial: unknown) => ipcRenderer.invoke('settings:update', partial),
    onChanged: (cb: (s: unknown) => void) => on('settings:changed', (s) => cb(s))
  },
  workspace: {
    getState: () => ipcRenderer.invoke('workspace:getState'),
    openDialog: () => ipcRenderer.invoke('workspace:openDialog'),
    openPath: (path: string) => ipcRenderer.invoke('workspace:openPath', path),
    close: () => ipcRenderer.invoke('workspace:close'),
    reveal: (path: string) => ipcRenderer.invoke('workspace:reveal', path),
    onChanged: (cb: (payload: unknown) => void) =>
      on('workspace:changed', (p) => cb(p))
  },
  fs: {
    list: (rel: string, depth?: number) => ipcRenderer.invoke('fs:list', rel, depth),
    read: (rel: string) => ipcRenderer.invoke('fs:read', rel),
    write: (rel: string, content: string) => ipcRenderer.invoke('fs:write', rel, content),
    /**
     * T006：Electron ≥32 起 File.path 已移除；同步用 webUtils.getPathForFile。
     * 必须在 preload 调（renderer 无 webUtils）；File 经 contextBridge 调用传入可行。
     */
    pathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  /** 主进程 TOC 渲染；聊天请用 renderer markdown（见 API-preload 双管线） */
  md: {
    render: (source: string) => ipcRenderer.invoke('md:render', source)
  },
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    get: (id: string) => ipcRenderer.invoke('session:get', id),
    listExternal: (opts?: { cwd?: string; limit?: number }) =>
      ipcRenderer.invoke('session:listExternal', opts),
    resumeExternal: (cliSessionId: string) =>
      ipcRenderer.invoke('session:resumeExternal', cliSessionId),
    /** T030：物理删除外部 CLI 会话的 transcript 目录（不可恢复） */
    removeExternal: (cliSessionId: string) =>
      ipcRenderer.invoke('session:removeExternal', cliSessionId),
    command: (sessionId: string, cmd: string) =>
      ipcRenderer.invoke('session:command', sessionId, cmd),
    commandCapabilities: () => ipcRenderer.invoke('session:commandCapabilities'),
    create: (title?: string) => ipcRenderer.invoke('session:create', title),
    createSide: (parentSessionId: string) =>
      ipcRenderer.invoke('session:createSide', parentSessionId),
    revealWorktree: (sessionId: string) =>
      ipcRenderer.invoke('session:revealWorktree', sessionId),
    discardWorktree: (sessionId: string) =>
      ipcRenderer.invoke('session:discardWorktree', sessionId),
    worktreeStatus: (sessionId: string) =>
      ipcRenderer.invoke('session:worktreeStatus', sessionId),
    promote: (
      sessionId: string,
      opts?: { pushOnly?: boolean; title?: string; body?: string; base?: string }
    ) => ipcRenderer.invoke('session:promote', sessionId, opts),
    send: (sessionId: string, text: string, opts?: { mediaPaths?: string[] }) =>
      ipcRenderer.invoke('session:send', sessionId, text, opts),
    sendCross: (fromSessionId: string, toSessionId: string, text: string) =>
      ipcRenderer.invoke('session:sendCross', fromSessionId, toSessionId, text),
    history: (sessionId: string) => ipcRenderer.invoke('session:history', sessionId),
    cancel: (sessionId: string) => ipcRenderer.invoke('session:cancel', sessionId),
    export: (sessionId: string) => ipcRenderer.invoke('session:export', sessionId),
    restart: (sessionId: string) => ipcRenderer.invoke('session:restart', sessionId),
    rename: (sessionId: string, title: string) =>
      ipcRenderer.invoke('session:rename', sessionId, title),
    remove: (sessionId: string) => ipcRenderer.invoke('session:remove', sessionId),
    contextInfo: (sessionId: string) =>
      ipcRenderer.invoke('session:contextInfo', sessionId),
    markRead: (sessionId: string) => ipcRenderer.invoke('session:markRead', sessionId),
    blur: () => ipcRenderer.invoke('session:blur'),
    onEvent: (cb: (event: SessionEvent) => void) =>
      on('session:event', (e) => cb(e as SessionEvent)),
    onUpdated: (cb: (sessions: unknown) => void) =>
      on('session:updated', (s) => cb(s))
  },
  stats: {
    usage: (range?: 'all' | '30d' | '7d') => ipcRenderer.invoke('stats:usage', range)
  },
  uiState: {
    get: (key: string) => ipcRenderer.invoke('uiState:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('uiState:set', key, value)
  },
  diagnostics: {
    export: () => ipcRenderer.invoke('diagnostics:export')
  },
  diff: {
    list: (sessionId?: string) => ipcRenderer.invoke('diff:list', sessionId),
    unified: (id: string) => ipcRenderer.invoke('diff:unified', id),
    accept: (id: string) => ipcRenderer.invoke('diff:accept', id),
    reject: (id: string) => ipcRenderer.invoke('diff:reject', id),
    acceptAll: (sessionId: string) => ipcRenderer.invoke('diff:acceptAll', sessionId),
    rejectAll: (sessionId: string) => ipcRenderer.invoke('diff:rejectAll', sessionId),
    revertTurn: (sessionId: string, turnId: string) =>
      ipcRenderer.invoke('diff:revertTurn', sessionId, turnId),
    onUpdated: (cb: (list: unknown) => void) => on('diff:updated', (l) => cb(l))
  },
  approval: {
    list: (sessionId?: string) => ipcRenderer.invoke('approval:list', sessionId),
    resolve: (id: string, approved: boolean, policy?: string) =>
      ipcRenderer.invoke('approval:resolve', id, approved, policy),
    onUpdated: (cb: (list: unknown) => void) => on('approval:updated', (l) => cb(l))
  },
  terminal: {
    read: (sessionId: string) => ipcRenderer.invoke('terminal:read', sessionId),
    clear: (sessionId: string) => ipcRenderer.invoke('terminal:clear', sessionId),
    write: (sessionId: string, line: string) =>
      ipcRenderer.invoke('terminal:write', sessionId, line),
    writeRaw: (sessionId: string, data: string) =>
      ipcRenderer.invoke('terminal:writeRaw', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    attach: (sessionId: string, size?: { cols: number; rows: number }) =>
      ipcRenderer.invoke('terminal:attach', sessionId, size),
    availability: () => ipcRenderer.invoke('terminal:availability'),
    kill: (sessionId: string) => ipcRenderer.invoke('terminal:kill', sessionId),
    status: (sessionId: string) => ipcRenderer.invoke('terminal:status', sessionId),
    onData: (cb: (payload: unknown) => void) => on('terminal:data', (p) => cb(p)),
    onExit: (cb: (payload: unknown) => void) => on('terminal:exit', (p) => cb(p))
  },
  preview: {
    open: (url: string) => ipcRenderer.invoke('preview:open', url)
  },
  /**
   * T027：系统级打开（应用内读不了的文件的兜底出口）
   * - openPath：Electron shell.openPath（系统默认应用）
   * - revealInFinder：复用既有 Finder 显示实现（main 侧与 workspace:reveal 同一个函数）
   */
  system: {
    openPath: (path: string): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('system:openPath', path),
    revealInFinder: (path: string): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('system:revealInFinder', path)
  },
  integrations: {
    status: () => ipcRenderer.invoke('integrations:status'),
    listSkills: () => ipcRenderer.invoke('integrations:listSkills'),
    listModels: () => ipcRenderer.invoke('integrations:listModels'),
    setMcpEnabled: (name: string, enabled: boolean) =>
      ipcRenderer.invoke('integrations:setMcpEnabled', name, enabled),
    ghStatus: () => ipcRenderer.invoke('integrations:ghStatus'),
    gcuStatus: () => ipcRenderer.invoke('integrations:gcuStatus'),
    gcuAlignMcpCommand: () => ipcRenderer.invoke('integrations:gcuAlignMcpCommand'),
    rebuildEngine: () => ipcRenderer.invoke('integrations:rebuildEngine')
  },
  clipboard: {
    write: (text: string) => ipcRenderer.invoke('clipboard:write', text),
    /** T006：剪贴板图落盘，返回绝对路径；无图 null */
    saveImage: (): Promise<string | null> => ipcRenderer.invoke('clipboard:saveImage')
  },
  /**
   * T018：Routines 调度（能力层；UI 归 T019）
   * 字段契约见 docs/API-preload.md · docs/工单/T018
   */
  routines: {
    list: () => ipcRenderer.invoke('routines:list'),
    create: (input: unknown) => ipcRenderer.invoke('routines:create', input),
    update: (id: string, patch: unknown) => ipcRenderer.invoke('routines:update', id, patch),
    remove: (id: string) => ipcRenderer.invoke('routines:remove', id),
    toggle: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('routines:toggle', id, enabled),
    runNow: (id: string) => ipcRenderer.invoke('routines:runNow', id),
    onChanged: (cb: (routines: unknown) => void) =>
      on('routines:changed', (list) => cb(list))
  },
  menu: {
    on: (name: string, cb: () => void) => on(`menu:${name}`, () => cb())
  },
  securityProbe: {
    hasRequire: typeof (globalThis as { require?: unknown }).require === 'function'
  }
}

contextBridge.exposeInMainWorld('perigee', api)
export type PerigeeApi = typeof api
