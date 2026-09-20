import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { PRODUCT_NAME } from '../shared/constants'

/** Cmd-Q / 菜单「退出」时放行关窗；红灯只藏不毁。 */
let allowClose = false

export function markWorkbenchQuitting(): void {
  allowClose = true
}

export function shouldShowWindow(): boolean {
  if (process.env.WORKBENCH_SHOW === '1') return true
  if (process.env.WORKBENCH_SHOW === '0') return false
  // 打包后的桌面 App 默认亮窗；开发态 `workbench up` 仍默认隐藏
  return app.isPackaged
}

export function revealWorkbenchWindow(win: BrowserWindow): boolean {
  // hidden 开发控制面：activate / 二次启动都不抢前台
  if (!shouldShowWindow() || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
}

function hidePreservingWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => {
      if (!win.isDestroyed()) win.hide()
    })
    win.setFullScreen(false)
    return
  }
  win.hide()
}

export function createWorkbenchWindow(): BrowserWindow {
  const show = shouldShowWindow()
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: '#f4f4f4',
    autoHideMenuBar: true,
    skipTaskbar: !show,
    focusable: show,
    paintWhenInitiallyHidden: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // 红灯 = 藏窗保进程；菜单退出才真正关掉
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    hidePreservingWindow(win)
  })

  // hidden 开发控制面：任何 show 立刻藏回去，避免 doctor/send 抢前台
  win.on('show', () => {
    if (!show) win.hide()
  })

  if (show) {
    win.once('ready-to-show', () => {
      win.show()
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export async function waitPaint(win: BrowserWindow): Promise<void> {
  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', () => resolve())
    })
  }
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(resolve, 80))
      })
    })
  `)
}

export async function capturePng(win: BrowserWindow): Promise<Buffer> {
  await waitPaint(win)
  const image = await win.webContents.capturePage()
  return image.toPNG()
}
