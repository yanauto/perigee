/**
 * 窗上导出 / 压上下文。导出复用 grok-cmd 已有的 grok export 转发。
 * compact 没有官方 CLI，也不改 grok-engine：走 store.submit('/compact') → ACP session/prompt。
 */
import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppState } from '../shared/types'
import {
  safeExportName,
  type CompactCurrentResult,
  type ExportCurrentResult,
  type ExportDest
} from '../shared/slash-palette'
import { executeGrokCmd } from './grok-cmd'

export type SlashIpcApp = {
  getState: () => AppState
  submit: (text: string) => Promise<AppState>
  getCwd: () => string | null
}

function activeSession(state: AppState) {
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? state.sessions[0] ?? null
}

function failExport(error: string, extra: Partial<ExportCurrentResult> = {}): ExportCurrentResult {
  return { ok: false, error, ...extra }
}

async function exportByCli(
  cliSessionId: string,
  dest: ExportDest,
  cwd: string | null,
  filePath?: string
): Promise<ExportCurrentResult> {
  if (dest === 'clipboard') {
    const clip = await executeGrokCmd(['export', cliSessionId, '--clipboard'], cwd)
    if (clip.ok) {
      const text = clipboard.readText().trim()
      if (!text) {
        return failExport('grok --clipboard 跑完了，剪贴板却是空的。', { dest: 'clipboard' })
      }
      return { ok: true, dest: 'clipboard', detail: `已复制（${text.length} 字）` }
    }
    const out = await executeGrokCmd(['export', cliSessionId], cwd)
    const md = (out.stdout || '').trim()
    if (out.ok && md) {
      clipboard.writeText(out.stdout.endsWith('\n') ? out.stdout : `${out.stdout}\n`)
      return {
        ok: true,
        dest: 'clipboard',
        detail: `已复制（${md.length} 字）。--clipboard 没成功，改用了 stdout。`
      }
    }
    return failExport(clip.error || out.error || '导出到剪贴板失败', { dest: 'clipboard' })
  }

  const path = (filePath || '').trim()
  if (!path) return failExport('没有保存路径')
  const ran = await executeGrokCmd(['export', cliSessionId, path], cwd)
  if (!ran.ok) {
    return failExport(ran.error || `grok export 失败（退出码 ${ran.code}）`, { dest: 'file', path })
  }
  if (!existsSync(path) || statSync(path).size <= 0) {
    return failExport(`grok 说成功了，但文件没写出：${path}`, { dest: 'file', path })
  }
  return {
    ok: true,
    dest: 'file',
    path,
    detail: `已写出 ${path}（${statSync(path).size} 字节）`
  }
}

export function registerSlashIpc(app: SlashIpcApp): void {
  ipcMain.handle('wb:export-current', async (event, extra: unknown) => {
    const body = extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : {}
    const dest: ExportDest = body.dest === 'clipboard' ? 'clipboard' : 'file'
    const givenPath = typeof body.path === 'string' ? body.path.trim() : ''
    const state = app.getState()
    const session = activeSession(state)
    const cliId = session?.cliSessionId?.trim() ?? ''
    if (!cliId) {
      return failExport('这条还没有官方会话 id。先发一句，或从侧栏续上 CLI 会话后再导出。')
    }

    if (dest === 'file' && !givenPath) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts = {
        title: '导出当前对话',
        defaultPath: join(homedir(), 'Downloads', safeExportName(session?.title ?? '对话', cliId)),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (picked.canceled || !picked.filePath) {
        return failExport('取消了')
      }
      return exportByCli(cliId, 'file', app.getCwd(), picked.filePath)
    }

    return exportByCli(cliId, dest, app.getCwd(), givenPath || undefined)
  })

  ipcMain.handle('wb:compact-current', async (): Promise<CompactCurrentResult> => {
    try {
      await app.submit('/compact')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
