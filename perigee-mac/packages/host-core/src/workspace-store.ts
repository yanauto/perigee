import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write.js'

export interface WorkspaceEntry {
  path: string
  name: string
  lastOpenedAt: string
}

export interface AppState {
  recentWorkspaces: WorkspaceEntry[]
  lastWorkspacePath: string | null
}

const DEFAULT_STATE: AppState = {
  recentWorkspaces: [],
  lastWorkspacePath: null
}

const MAX_RECENT = 12

/**
 * 工作区最近列表持久化。
 * 路径由宿主注入（Electron userData），便于单测用临时目录。
 */
export class WorkspaceStore {
  constructor(private stateFilePath: string) {}

  load(): AppState {
    try {
      if (!existsSync(this.stateFilePath)) return { ...DEFAULT_STATE, recentWorkspaces: [] }
      const raw = readFileSync(this.stateFilePath, 'utf8')
      const parsed = JSON.parse(raw) as AppState
      return {
        recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
          ? parsed.recentWorkspaces
          : [],
        lastWorkspacePath: parsed.lastWorkspacePath ?? null
      }
    } catch {
      return { ...DEFAULT_STATE, recentWorkspaces: [] }
    }
  }

  save(state: AppState): void {
    writeJsonAtomic(this.stateFilePath, state)
  }

  recordOpen(workspacePath: string): AppState {
    const state = this.load()
    const name = workspacePath.split(/[/\\]/).filter(Boolean).pop() ?? workspacePath
    const now = new Date().toISOString()
    const rest = state.recentWorkspaces.filter((w) => w.path !== workspacePath)
    const next: AppState = {
      lastWorkspacePath: workspacePath,
      recentWorkspaces: [{ path: workspacePath, name, lastOpenedAt: now }, ...rest].slice(
        0,
        MAX_RECENT
      )
    }
    this.save(next)
    return next
  }

  clearLast(): AppState {
    const state = this.load()
    const next = { ...state, lastWorkspacePath: null }
    this.save(next)
    return next
  }
}

export function defaultStatePath(userDataDir: string): string {
  return join(userDataDir, 'app-state.json')
}
