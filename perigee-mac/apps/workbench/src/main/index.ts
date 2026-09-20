import { app, dialog, ipcMain, Menu, type BrowserWindow } from 'electron'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { CONTROL_FILE, PRODUCT_NAME } from '../shared/constants'
import { isPageId } from '../shared/pages'
import { isAgentPermMode } from '../shared/agent-mode'
import type { AccountModal } from '../shared/types'
import { attachGrok, probeGrok } from './grok-engine'
import { registerInspectIpc } from './inspect-ipc'
import { registerSessionListIpc } from './sessions-ipc'
import { registerSlashIpc } from './slash-ipc'
import { createStore } from './store'
import { startControlServer, shotPath } from './control-server'
import {
  capturePng,
  createWorkbenchWindow,
  markWorkbenchQuitting,
  revealWorkbenchWindow,
  shouldShowWindow,
  waitPaint
} from './window'

const show = shouldShowWindow()

app.setName(PRODUCT_NAME)
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

let mainWindow: BrowserWindow | undefined

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) revealWorkbenchWindow(mainWindow)
  })
  void boot()
}

async function boot(): Promise<void> {
  if (show) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
  }
  await app.whenReady()

  if (!show) {
    app.dock?.hide()
    if (process.platform === 'darwin') {
      app.setActivationPolicy('accessory')
    }
  }

  const store = createStore(show)
  store.setBridge(
    attachGrok(store, () => store.enginePolicy(), () => store.engineModel(), {
      effortOf: () => store.engineEffort(),
      sandboxOf: () => store.engineSandbox()
    })
  )
  store.setGrok(await probeGrok(), { gate: true })
  registerInspectIpc(() => store.get().workspace.path)
  registerSessionListIpc(
    () => store.get().workspace.path,
    {
      continueRecent: () => store.continueRecent(),
      renameLocal: (id, title) => store.renameLocalTitle(id, title),
      dropCli: (id) => store.dropCliSession(id)
    }
  )
  registerSlashIpc({
    getState: () => store.get(),
    submit: (text) => store.submit(text),
    getCwd: () => store.get().workspace.path
  })
  store.startRoutines()
  const win = createWorkbenchWindow()
  mainWindow = win

  const push = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('wb:state', store.get())
    }
  }
  store.subscribe(push)

  ipcMain.handle('wb:get-state', () => store.get())
  ipcMain.handle('wb:submit', (_e, text: unknown) => store.submit(String(text ?? '')))
  ipcMain.handle('wb:goto', (_e, id: unknown, extra?: unknown) =>
    store.goto(String(id ?? ''), extra == null || extra === '' ? undefined : String(extra))
  )
  ipcMain.handle('wb:set-modal', (_e, next: unknown) => {
    const value = next == null || next === '' ? null : String(next)
    const allowed: AccountModal[] = [
      'plan',
      'deactivate',
      'env',
      'api-key',
      'secret',
      'secret-scope',
      'auto-preview',
      'auto-trigger',
      'auto-people',
      'auto-test',
      'auto-review',
      'bugbot-rule',
      'browse-mcp'
    ]
    if (value !== null && !allowed.includes(value as AccountModal)) {
      throw new Error('unknown modal')
    }
    return store.setModal(value as AccountModal)
  })
  ipcMain.handle('wb:set-plan', (_e, next: unknown) => {
    const value = String(next ?? '')
    if (value !== 'free' && value !== 'pro' && value !== 'pro+' && value !== 'ultra') {
      throw new Error('unknown plan')
    }
    return store.setPlan(value)
  })
  ipcMain.handle('wb:set-spend-limit', (_e, next: unknown) => {
    if (next === null || next === 'null') return store.setSpendLimit(null)
    const n = Number(next)
    if (!Number.isFinite(n) || n < 0) throw new Error('invalid spend limit')
    return store.setSpendLimit(n)
  })
  ipcMain.handle('wb:update-profile', (_e, payload: unknown) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    return store.updateProfile({
      firstName: body.firstName == null ? undefined : String(body.firstName),
      lastName: body.lastName == null ? undefined : String(body.lastName)
    })
  })
  ipcMain.handle('wb:logout', () => store.logout())
  ipcMain.handle('wb:deactivate', () => store.deactivate())
  ipcMain.handle('wb:new-agent', () => store.newAgent())
  ipcMain.handle('wb:worktree-list', () => store.refreshWorktrees())
  ipcMain.handle('wb:worktree-new', (_e, label: unknown) =>
    store.startIsolated(label == null || String(label) === '' ? undefined : String(label))
  )
  ipcMain.handle('wb:worktree-open', (_e, path: unknown) => store.openWorktree(String(path ?? '')))
  ipcMain.handle('wb:worktree-housekeep', (_e, payload: unknown) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    const extra = Array.isArray(body.extra) ? body.extra.map(String) : []
    return store.housekeepWorktree({
      action: String(body.action ?? ''),
      ids,
      extra,
      confirm: body.confirm === true
    })
  })
  ipcMain.handle('wb:fork', (_e, payload: unknown) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const id = body.id == null || String(body.id) === '' ? undefined : String(body.id)
    return store.forkSession({
      id,
      isolate: body.isolate === true || body.worktree === true
    })
  })
  ipcMain.handle('wb:open-session', (_e, id: unknown) => store.openSession(String(id ?? '')))
  ipcMain.handle('wb:resume-cli', (_e, id: unknown) => store.resumeCli(String(id ?? '')))
  ipcMain.handle('wb:cancel', (_e, id: unknown) =>
    store.cancel(id == null || String(id) === '' ? undefined : String(id))
  )
  ipcMain.handle('wb:allow', (_e, id: unknown) =>
    store.allow(id == null || String(id) === '' ? undefined : String(id))
  )
  ipcMain.handle('wb:deny', (_e, id: unknown) =>
    store.deny(id == null || String(id) === '' ? undefined : String(id))
  )
  ipcMain.handle('wb:request-code', (_e, payload: unknown) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    return store.requestCode({
      email: String(body.email ?? ''),
      firstName: body.firstName == null ? undefined : String(body.firstName),
      lastName: body.lastName == null ? undefined : String(body.lastName)
    })
  })
  ipcMain.handle('wb:verify-code', (_e, code: unknown) => store.verifyCode(String(code ?? '')))
  ipcMain.handle('wb:routine-add', (_e, payload: unknown) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    return store.addRoutine({
      name: String(body.name ?? ''),
      instruction: String(body.instruction ?? ''),
      cron: String(body.cron ?? '')
    })
  })
  ipcMain.handle('wb:routine-toggle', (_e, id: unknown, enabled: unknown) =>
    store.toggleRoutine(String(id ?? ''), enabled === true)
  )
  ipcMain.handle('wb:routine-remove', (_e, id: unknown) => store.removeRoutine(String(id ?? '')))
  ipcMain.handle('wb:routine-run', (_e, id: unknown) => store.runRoutine(String(id ?? '')))
  ipcMain.handle('wb:set-agent-mode', (_e, next: unknown) => {
    const value = String(next ?? '')
    if (!isAgentPermMode(value)) throw new Error('权限档只能是 ask / auto / always-approve')
    return store.setAgentMode(value)
  })
  ipcMain.handle('wb:set-agent-plan', (_e, next: unknown) => {
    return store.setAgentPlan(next === true || next === 'on' || next === 'true' || next === 1)
  })
  ipcMain.handle('wb:follow-cli-mode', () => store.followCliMode())
  ipcMain.handle('wb:set-agent-model', (_e, next: unknown) => store.setAgentModel(String(next ?? '')))
  ipcMain.handle('wb:follow-cli-model', () => store.followCliModel())
  ipcMain.handle('wb:refresh-models', () => store.refreshModels())
  ipcMain.handle('wb:set-agent-effort', (_e, next: unknown) => store.setAgentEffort(String(next ?? '')))
  ipcMain.handle('wb:set-agent-sandbox', (_e, next: unknown) => store.setAgentSandbox(String(next ?? '')))
  ipcMain.handle('wb:set-workspace', (_e, path: unknown) => {
    if (path == null || path === '') return store.setWorkspace(null)
    return store.setWorkspace(String(path))
  })
  ipcMain.handle('wb:open-workspace', async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: '打开文件夹',
      properties: ['openDirectory']
    })
    if (picked.canceled || !picked.filePaths[0]) return store.get()
    return store.setWorkspace(picked.filePaths[0])
  })

  async function shot(pageId?: string): Promise<string> {
    if (pageId) {
      if (!isPageId(pageId)) throw new Error(`unknown page: ${pageId}`)
      store.goto(pageId)
    }
    await waitPaint(win)
    const png = await capturePng(win)
    const dest = shotPath(store.get().page)
    mkdirSync('/tmp/perigee-workbench', { recursive: true })
    writeFileSync(dest, png)
    return dest
  }

  await startControlServer({ store, shot })

  win.webContents.on('did-finish-load', () => {
    store.setReady(true)
    push()
  })

  app.on('before-quit', () => {
    markWorkbenchQuitting()
    try {
      unlinkSync(CONTROL_FILE)
    } catch {
      /* 控制面文件可能已不在 */
    }
  })

  app.on('window-all-closed', () => {
    // 控制面还要应答，不退出
  })

  app.on('activate', () => {
    revealWorkbenchWindow(win)
  })
}
