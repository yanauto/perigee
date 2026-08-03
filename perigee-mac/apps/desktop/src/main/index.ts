/**
 * Perigee main 入口：状态、窗口、生命周期；IPC/引擎/总线见同级模块。
 */
import {
  app,
  BrowserWindow,
  shell,
  Menu,
  globalShortcut,
  Notification
} from 'electron'
import { join, basename as pathBasename } from 'node:path'
import { existsSync, statSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import type { MediaPart } from '@perigee/engine-protocol'
import {
  classifyMediaPath,
  mimeFromPath,
  MEDIA_MAX_BYTES
} from '@perigee/engine-grok-acp'
import {
  EventBus,
  SessionManager,
  WorkspaceStore,
  defaultStatePath,
  FsService,
  DiffService,
  TurnTracker,
  ApprovalGate,
  TranscriptStore,
  SettingsStore,
  SessionStore,
  WorktreeService,
  ShellRunner,
  resolveGrokBinary,
  resolveAnyPath,
  UsageLedger,
  UiStateStore,
  RoutineStore,
  RoutineScheduler,
  type SessionRecord,
  type AppSettings,
  type PersistedSession,
  type Routine,
  type RoutineFireResult
} from '@perigee/host-core'
import { openExternalSafe } from './security.js'
import type { AgentEngine } from '@perigee/engine-protocol'
import { PtyService } from './pty-service.js'
import type { MainCtx, OpenWorkspaceResult } from './ctx.js'
import {
  agentConfigFromCli,
  createEngine as createEngineImpl
} from './create-engine.js'
import {
  wireBus,
  flushDeltaBroadcast,
  enqueueDeltaBroadcast,
  hasPendingDeltaBroadcast
} from './wire-bus.js'
import { registerIpc } from './ipc/register.js'

// ── 运行时状态（MainCtx 经 getter/setter 闭包暴露） ──────────────
let mainWindow: BrowserWindow | null = null
const bus = new EventBus()
const turnTracker = new TurnTracker(bus)
let settingsStore: SettingsStore
let workspaceStore: WorkspaceStore
let transcript: TranscriptStore
let sessionStore: SessionStore
let sessions: SessionManager
let fsService: FsService | null = null
/** T027：无工作区时按绝对路径读写的兜底实例（相对路径以主目录为基准） */
let fsFallback: FsService | null = null
let diffs: DiffService | null = null
let worktrees: WorktreeService | null = null
let uiStateStore: UiStateStore
let usageLedger: UsageLedger
let routineStore: RoutineStore
let routineScheduler: RoutineScheduler
const approvals = new ApprovalGate()
let currentWorkspace: string | null = null
let engine: AgentEngine
let engineModeActual = 'stub'
const termBuffers = new Map<string, string>() // sessionId -> log
/** T018：由 Routine 拉起的会话 id → 强制免询问（兜底，与 ACP session meta yolo 双保险） */
const routineSessionIds = new Set<string>()
const shellRunner = new ShellRunner((sessionId, chunk) => appendTerm(sessionId, chunk))
const ptyService = new PtyService(
  (sessionId, chunk) => appendTerm(sessionId, chunk),
  (sessionId, exitCode) => {
    appendTerm(sessionId, `\n[process exited ${exitCode ?? '?'}]\n`)
    broadcast('terminal:exit', { sessionId, exitCode })
  }
)

/** 读写通道用：优先当前工作区服务，没有就用兜底（**不做工作区包含检查**，见 T027） */
function fsAnyPath(): FsService {
  if (fsService) return fsService
  if (!fsFallback) fsFallback = new FsService(app.getPath('home'))
  return fsFallback
}

/** Finder 中显示（单一实现，workspace:reveal 与 system:revealInFinder 共用） */
function revealInFinder(p: string): { ok: boolean; reason?: string } {
  const target = String(p ?? '')
  if (!target) return { ok: false, reason: '空路径' }
  shell.showItemInFolder(target)
  return { ok: true }
}

function grokVersion(): string | null {
  const bin = settingsStore?.load()?.grokBinary || resolveGrokBinary()
  for (const args of [['-v'], ['--version'], ['version']] as string[][]) {
    try {
      const out = execFileSync(bin, args, { encoding: 'utf8', timeout: 5000 })
      const line = out.trim().split('\n')[0]
      if (line) return line
    } catch {
      /* try next */
    }
  }
  return null
}

function persistSession(rec: SessionRecord, engineSessionId?: string): void {
  if (rec.kind === 'side') return // 侧问不持久化
  /* T029：已被删除的会话不许写回（store 层还有墓碑兜底，这里少做一次无谓 IO） */
  if (sessionStore.isRemoved(rec.id)) return
  const p: PersistedSession = {
    id: rec.id,
    title: rec.title,
    workspacePath: rec.workspacePath,
    primaryWorkspacePath: rec.primaryWorkspacePath,
    worktreePath: rec.worktreePath,
    worktreeBranch: rec.worktreeBranch,
    kind: rec.kind,
    parentSessionId: rec.parentSessionId,
    engineId: rec.engineId,
    engineSessionId: engineSessionId ?? rec.engineSessionId,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    status: rec.status,
    lastReadAt: rec.lastReadAt ?? null,
    lastActivityAt: rec.lastActivityAt
  }
  sessionStore.upsert(p)
}

function createWindow(): void {
  const settings = settingsStore.load()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Perigee',
    show: false,
    backgroundColor: '#000000',
    // darwin：hiddenInset + 红绿灯；win/linux：系统默认 frame（ADR-0001 / win 满配）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 14 } as const }
      : {}),
    webPreferences: {
      // CJS preload（见 electron.vite.config preload output format:cjs）
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // 超时仍显示，避免卡在不可见窗口；真黑屏时至少看得到窗
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }, 1500)

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[perigee] did-fail-load', code, desc, url)
  })
  mainWindow.webContents.on('preload-error', (_e, path, err) => {
    console.error('[perigee] preload-error', path, err)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const html = join(__dirname, '../renderer/index.html')
    console.log('[perigee] loadFile', html, 'exists=', existsSync(html))
    void mainWindow.loadFile(html)
  }

  void settings
}

function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

/** diff 推送：只发元数据，避免 before/after 全文 IPC（审计 C2-03） */
function broadcastDiffs(): void {
  broadcast('diff:updated', diffs?.listMeta() ?? [])
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

/** 从工作区相对路径装入 MediaPart（图/PDF base64） */
function loadMediaParts(relPaths: string[], workspaceRoot: string | null): MediaPart[] {
  if (!workspaceRoot || !relPaths.length) return []
  const seen = new Set<string>()
  const out: MediaPart[] = []
  for (const rel of relPaths) {
    const key = rel.replace(/\\/g, '/')
    if (!key || seen.has(key)) continue
    seen.add(key)
    /* T027：附件可能来自工作区外（剪贴板落盘在 userData/attachments、用户拖入任意路径），
       这里同样不做工作区包含检查——解析不了才跳过 */
    let abs: string
    try {
      abs = resolveAnyPath(workspaceRoot, key)
    } catch {
      continue
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) continue
    const kind = classifyMediaPath(abs)
    if (kind === 'file') continue
    const mime = mimeFromPath(abs)
    const max =
      kind === 'image' ? MEDIA_MAX_BYTES.image : kind === 'pdf' ? MEDIA_MAX_BYTES.pdf : MEDIA_MAX_BYTES.file
    const st = statSync(abs)
    if (st.size > max) continue
    let dataBase64: string | undefined
    try {
      dataBase64 = readFileSync(abs).toString('base64')
    } catch {
      dataBase64 = undefined
    }
    out.push({
      kind,
      name: pathBasename(abs),
      mimeType: mime,
      uri: pathToFileURL(abs).href,
      dataBase64,
      byteLength: st.size
    })
  }
  return out
}

function appendTerm(sessionId: string, chunk: string): void {
  const prev = termBuffers.get(sessionId) ?? ''
  const next = (prev + chunk).slice(-80_000)
  termBuffers.set(sessionId, next)
  broadcast('terminal:data', { sessionId, chunk })
}

/**
 * T018：Routine 到点/立即执行 —— 新开会话、发 instruction、等轮次结束。
 * 权限强制 yolo（会话 meta + routineSessionIds 兜底）；不补跑错过点。
 */
async function fireRoutineSession(routine: Routine): Promise<RoutineFireResult> {
  const startedAt = Date.now()
  const workspace = String(routine.workspace || '').trim()
  if (!workspace || !existsSync(workspace) || !statSync(workspace).isDirectory()) {
    throw new Error(`routine workspace 无效: ${workspace || '(empty)'}`)
  }
  const s = settingsStore.load()
  const sessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const engineMeta: Record<string, unknown> = {
    permissionPolicy: 'yolo',
    mcpServerNames: Array.isArray(routine.mcpServers) ? routine.mcpServers : []
  }
  if (routine.model?.trim()) engineMeta.model = routine.model.trim()
  if (routine.effort?.trim()) engineMeta.reasoningEffort = routine.effort.trim()

  const rec = await sessions.create(workspace, {
    id: sessionId,
    title: `Routine · ${routine.name}`,
    kind: 'main',
    primaryWorkspacePath: workspace,
    engineCwd: workspace,
    engineMeta,
    // null → 有活动后 attention=unread（侧栏绿点）
    lastReadAt: null
  })
  routineSessionIds.add(rec.id)
  termBuffers.set(rec.id, '')
  persistSession(rec)
  broadcast('session:updated', sessions.list())

  const TURN_TIMEOUT_MS = Math.max(s.turnTimeoutMs || 600_000, 120_000)
  let settled = false
  let settle!: (status: 'ok' | 'fail') => void
  let unsubWait: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let sawBusy = false
  const waitDone = new Promise<'ok' | 'fail'>((resolve) => {
    settle = (status) => {
      if (settled) return
      settled = true
      unsubWait?.()
      if (timer) clearTimeout(timer)
      resolve(status)
    }
    unsubWait = bus.subscribe((event) => {
      if (event.sessionId !== rec.id) return
      if (event.type === 'error') {
        settle('fail')
        return
      }
      if (event.type === 'turn.end') {
        settle('ok')
        return
      }
      if (event.type === 'session.status') {
        if (event.status === 'streaming' || event.status === 'tool_running') sawBusy = true
        if (event.status === 'error') settle('fail')
        else if ((event.status === 'idle' || event.status === 'done') && sawBusy) settle('ok')
      }
    })
    timer = setTimeout(() => settle('fail'), TURN_TIMEOUT_MS)
  })

  let failSummary: string | undefined
  try {
    await sessions.send(rec.id, routine.instruction)
  } catch (e) {
    failSummary = e instanceof Error ? e.message : String(e)
    settle('fail')
  }
  // send 多在回合结束后才 resolve；补一次状态快照，避免漏事件挂死
  if (!settled) {
    const cur = sessions.get(rec.id)
    if (cur?.status === 'error') settle('fail')
    else if (cur && (cur.status === 'idle' || cur.status === 'done')) settle('ok')
  }
  const status = await waitDone

  const durationMs = Date.now() - startedAt
  const hist = bus.history(rec.id)
  let summary: string | undefined = failSummary
  if (!summary) {
    for (let i = hist.length - 1; i >= 0; i--) {
      const ev = hist[i]!
      if (ev.type === 'assistant.message' && typeof (ev as { text?: string }).text === 'string') {
        summary = (ev as { text: string }).text.replace(/\s+/g, ' ').trim().slice(0, 200)
        break
      }
      if (ev.type === 'error' && typeof (ev as { message?: string }).message === 'string') {
        summary = (ev as { message: string }).message.slice(0, 200)
        break
      }
    }
  }
  if (!summary) summary = status === 'ok' ? '完成' : '失败或超时'

  const fresh = sessions.get(rec.id)
  if (fresh) persistSession(fresh)
  broadcast('session:updated', sessions.list())
  return { sessionId: rec.id, status, summary, durationMs }
}

function openWorkspace(path: string): OpenWorkspaceResult {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return { ok: false, reason: '路径不是有效目录' }
  }
  currentWorkspace = path
  fsService = new FsService(path)
  diffs = new DiffService(path)
  const state = workspaceStore.recordOpen(path)
  broadcast('workspace:changed', { currentWorkspace: path, state })
  return { ok: true, path, state }
}

function numOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return undefined
}

function createEngine(settings: AppSettings): AgentEngine {
  return createEngineImpl(settings, ctx)
}

/** 组装 MainCtx：闭包绑定本模块 let 状态 */
const ctx: MainCtx = {
  get mainWindow() {
    return mainWindow
  },
  set mainWindow(v) {
    mainWindow = v
  },
  bus,
  turnTracker,
  get settingsStore() {
    return settingsStore
  },
  set settingsStore(v) {
    settingsStore = v
  },
  get workspaceStore() {
    return workspaceStore
  },
  set workspaceStore(v) {
    workspaceStore = v
  },
  get transcript() {
    return transcript
  },
  set transcript(v) {
    transcript = v
  },
  get sessionStore() {
    return sessionStore
  },
  set sessionStore(v) {
    sessionStore = v
  },
  get sessions() {
    return sessions
  },
  set sessions(v) {
    sessions = v
  },
  get fsService() {
    return fsService
  },
  set fsService(v) {
    fsService = v
  },
  get fsFallback() {
    return fsFallback
  },
  set fsFallback(v) {
    fsFallback = v
  },
  get diffs() {
    return diffs
  },
  set diffs(v) {
    diffs = v
  },
  get worktrees() {
    return worktrees
  },
  set worktrees(v) {
    worktrees = v
  },
  get uiStateStore() {
    return uiStateStore
  },
  set uiStateStore(v) {
    uiStateStore = v
  },
  get usageLedger() {
    return usageLedger
  },
  set usageLedger(v) {
    usageLedger = v
  },
  get routineStore() {
    return routineStore
  },
  set routineStore(v) {
    routineStore = v
  },
  get routineScheduler() {
    return routineScheduler
  },
  set routineScheduler(v) {
    routineScheduler = v
  },
  approvals,
  get currentWorkspace() {
    return currentWorkspace
  },
  set currentWorkspace(v) {
    currentWorkspace = v
  },
  get engine() {
    return engine
  },
  set engine(v) {
    engine = v
  },
  get engineModeActual() {
    return engineModeActual
  },
  set engineModeActual(v) {
    engineModeActual = v
  },
  termBuffers,
  routineSessionIds,
  shellRunner,
  ptyService,
  broadcast,
  broadcastDiffs,
  notify,
  flushDeltaBroadcast,
  enqueueDeltaBroadcast,
  fsAnyPath,
  revealInFinder,
  persistSession,
  createEngine,
  agentConfigFromCli,
  loadMediaParts,
  appendTerm,
  openWorkspace,
  fireRoutineSession,
  grokVersion,
  numOrUndef
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : [{ label: 'File', submenu: [{ role: 'quit' as const }] }]),
    {
      label: '工作区',
      submenu: [
        {
          label: '打开文件夹…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-workspace')
        },
        {
          label: '命令面板',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('menu:command-palette')
        },
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:settings')
        }
      ]
    },
    {
      label: '会话',
      submenu: [
        {
          label: '新建会话',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-session')
        },
        {
          label: '导出会话…',
          click: () => mainWindow?.webContents.send('menu:export-session')
        }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  settingsStore = new SettingsStore(join(userData, 'settings.json'))
  workspaceStore = new WorkspaceStore(defaultStatePath(userData))
  transcript = new TranscriptStore(join(userData, 'transcripts'))
  sessionStore = new SessionStore(SessionStore.defaultPath(userData))
  uiStateStore = new UiStateStore(UiStateStore.defaultPath(userData))
  usageLedger = new UsageLedger(UsageLedger.defaultDir(userData))
  // T011：旧 transcript usage 一次性迁入账本（幂等）
  usageLedger.ensureMigrated(join(userData, 'transcripts'))
  worktrees = new WorktreeService(join(userData, 'worktrees'))
  // T018：Routines 持久化 + 调度（userData/routines.json）
  routineStore = new RoutineStore(RoutineStore.defaultPath(userData))
  routineScheduler = new RoutineScheduler({
    store: routineStore,
    onFire: (r) => fireRoutineSession(r),
    notify: (title, body) => notify(title, body)
  })
  routineScheduler.onChanged((list) => broadcast('routines:changed', list))

  const settings = settingsStore.load()
  if (!settings.grokBinary) {
    settingsStore.update({ grokBinary: resolveGrokBinary() })
  }
  engine = createEngine(settingsStore.load())
  sessions = new SessionManager(engine, bus)
  turnTracker.attach(() => diffs)
  // 恢复会话元数据（引擎按需 start）；跳过 side
  for (const p of sessionStore.load().sessions) {
    if (p.kind === 'side') continue
    sessions.hydrate({
      id: p.id,
      title: p.title,
      workspacePath: p.workspacePath,
      primaryWorkspacePath: p.primaryWorkspacePath ?? p.workspacePath,
      worktreePath: p.worktreePath,
      worktreeBranch: p.worktreeBranch,
      kind: p.kind ?? 'main',
      parentSessionId: p.parentSessionId,
      status: 'idle',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      engineId: p.engineId,
      engineSessionId: p.engineSessionId,
      lastReadAt: p.lastReadAt ?? null,
      lastActivityAt: p.lastActivityAt
    })
  }
  wireBus(ctx)
  registerIpc(ctx)
  buildMenu()
  createWindow()
  // T018：恢复全部 enabled Routine 的调度
  routineScheduler.start()

  const state = workspaceStore.load()
  if (state.lastWorkspacePath && existsSync(state.lastWorkspacePath)) {
    openWorkspace(state.lastWorkspacePath)
  }

  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try {
    routineScheduler?.stop()
  } catch {
    /* */
  }
  try {
    if (hasPendingDeltaBroadcast()) flushDeltaBroadcast()
  } catch {
    /* */
  }
  try {
    transcript?.flushAll?.()
  } catch {
    /* */
  }
  sessions?.disposeAll()
})
