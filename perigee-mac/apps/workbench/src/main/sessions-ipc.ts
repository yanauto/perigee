import { ipcMain } from 'electron'
import {
  deleteGrokSession,
  listGrokSessions,
  recentGrokSession,
  searchGrokSessions
} from './grok-sessions'

export type SessionLedgerActions = {
  continueRecent?: () => Promise<unknown>
  renameLocal?: (id: string, title: string) => unknown
  dropCli?: (id: string) => unknown
}

function asRecord(extra: unknown): Record<string, unknown> {
  return extra != null && typeof extra === 'object' ? (extra as Record<string, unknown>) : {}
}

function asLimit(extra: Record<string, unknown>): number | undefined {
  return typeof extra.limit === 'number' ? extra.limit : undefined
}

/** 按需拉 CLI 会话账本。删除走官方命令；改名只动本机窗标题。 */
export function registerSessionListIpc(
  getCwd: () => string | null,
  actions?: SessionLedgerActions
): void {
  ipcMain.handle('wb:list-grok-sessions', (_e, extra: unknown) => {
    const body = asRecord(extra)
    const query = typeof body.query === 'string' ? body.query : ''
    return listGrokSessions({ cwd: getCwd(), limit: asLimit(body), query })
  })

  ipcMain.handle('wb:search-grok-sessions', (_e, extra: unknown) => {
    const body = asRecord(extra)
    const query = String(body.query ?? body.q ?? '')
    return searchGrokSessions({ cwd: getCwd(), query, limit: asLimit(body) })
  })

  ipcMain.handle('wb:delete-grok-session', async (_e, extra: unknown) => {
    const body = asRecord(extra)
    const id = String(body.id ?? '')
    const result = await deleteGrokSession(id, {
      cwd: getCwd(),
      confirm: body.confirm === true
    })
    if (result.ok) {
      try {
        actions?.dropCli?.(result.id)
      } catch {
        /* 官方已删，本机窗清不掉单独报 */
      }
    }
    return result
  })

  ipcMain.handle('wb:continue-grok-session', () => {
    if (!actions?.continueRecent) throw new Error('续聊还没接上')
    return actions.continueRecent()
  })

  ipcMain.handle('wb:recent-grok-session', () => recentGrokSession(getCwd()))

  ipcMain.handle('wb:rename-grok-session', (_e, extra: unknown) => {
    const body = asRecord(extra)
    const id = String(body.id ?? '')
    const title = String(body.title ?? '')
    if (!actions?.renameLocal) throw new Error('改名还没接上')
    const state = actions.renameLocal(id, title)
    return {
      ok: true,
      id,
      title,
      official: false,
      note: '官方 CLI 没有 sessions rename。只改了本机窗标题。',
      state
    }
  })
}
