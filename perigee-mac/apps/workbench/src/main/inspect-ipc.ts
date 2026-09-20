import { ipcMain } from 'electron'
import { runGrokInspect } from './grok-inspect'

/** 按需跑 inspect，不写进 store。 */
export function registerInspectIpc(getCwd: () => string | null): void {
  ipcMain.handle('wb:inspect', (_e, extra: unknown) => {
    const force =
      extra != null && typeof extra === 'object' && (extra as { force?: unknown }).force === true
    return runGrokInspect({ cwd: getCwd(), force })
  })
  void runGrokInspect({ cwd: getCwd() })
}
