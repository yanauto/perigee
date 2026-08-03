import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write.js'

export interface PersistedSession {
  id: string
  title: string
  workspacePath: string
  primaryWorkspacePath?: string
  worktreePath?: string
  worktreeBranch?: string
  kind?: 'main' | 'side'
  parentSessionId?: string
  engineId: string
  engineSessionId?: string
  createdAt: string
  updatedAt: string
  status: string
  /** T008：用户上次已读（ms epoch）；null/缺省 = 从未 markRead */
  lastReadAt?: number | null
  /** T008：最后活动（ms epoch） */
  lastActivityAt?: number
}

export interface SessionStoreData {
  sessions: PersistedSession[]
  version: 1
}

/** UI 会话元数据持久化（transcript 仍在 TranscriptStore） */
export class SessionStore {
  /**
   * T029 墓碑：本进程内已删除的会话 id。
   * 根因见回执——`session:send` 处理器在**轮次结束后**才执行 `persistSession(sess)`，
   * 而 sess 是进入处理器时捕获的旧引用；若用户在轮次跑完前删了该会话，
   * 这条迟到的 upsert 会把记录**写回盘**，于是「当下消失、重开复现」。
   * 墓碑让 store 层直接免疫：删过的 id 一律拒绝再次写入（id 由时间戳+随机生成，不会复用）。
   */
  private tombstones = new Set<string>()

  constructor(private filePath: string) {}

  static defaultPath(userData: string): string {
    return join(userData, 'sessions-meta.json')
  }

  load(): SessionStoreData {
    try {
      if (!existsSync(this.filePath)) return { version: 1, sessions: [] }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as SessionStoreData
      return {
        version: 1,
        sessions: Array.isArray(raw.sessions) ? raw.sessions : []
      }
    } catch {
      return { version: 1, sessions: [] }
    }
  }

  save(data: SessionStoreData): void {
    // 原子写：tmp + rename，防崩溃半截 JSON（审计 Z1-06）
    writeJsonAtomic(this.filePath, data)
  }

  upsert(session: PersistedSession): void {
    /* T029：已删除的会话拒绝迟到写回（否则删完重启会「复活」） */
    if (this.tombstones.has(session.id)) return
    const data = this.load()
    const i = data.sessions.findIndex((s) => s.id === session.id)
    if (i >= 0) data.sessions[i] = session
    else data.sessions.unshift(session)
    // 每工作区最多保留 50（注释与实现对齐）
    const ws = session.primaryWorkspacePath || session.workspacePath
    const inWs: PersistedSession[] = []
    const other: PersistedSession[] = []
    for (const s of data.sessions) {
      const k = s.primaryWorkspacePath || s.workspacePath
      if (k === ws) inWs.push(s)
      else other.push(s)
    }
    data.sessions = [...inWs.slice(0, 50), ...other]
    this.save(data)
  }

  remove(id: string): void {
    this.tombstones.add(id)
    const data = this.load()
    data.sessions = data.sessions.filter((s) => s.id !== id)
    this.save(data)
  }

  /** 该 id 是否已被本进程删除（拒绝迟到的写回） */
  isRemoved(id: string): boolean {
    return this.tombstones.has(id)
  }

  listForWorkspace(workspacePath: string | null): PersistedSession[] {
    const all = this.load().sessions
    if (!workspacePath) return all
    return all.filter((s) => s.workspacePath === workspacePath)
  }
}
