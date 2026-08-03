import type { ExternalCliSession, SessionRecord } from '../lib/perigee-api'

/**
 * 侧栏跨源去重（T025-返修：同一个对话在侧栏出现两条）。
 *
 * 侧栏的会话来自两个互不知情的数据源：
 * - `session.list()` → Desktop 正式会话（渲染 SessionRow，**带 ⋮ 菜单**）
 * - `session.listExternal()` → 扫 `~/.grok/sessions/<cwd>/<uuid>/summary.json` 得到的
 *   本机 CLI transcript（渲染 CliRow，**没有 ⋮**）
 *
 * 一个 CLI 会话被 `resumeExternal` 恢复后，host 会新建一条 Desktop 记录并把 CLI transcript 的 id
 * 写进 `engineSessionId`（`resumeCli`），但**磁盘上的 transcript 原封不动**，于是 listExternal
 * 还会把它再列一遍 —— 这就是「一行有菜单、一行没有」的同名重复。
 *
 * 关联键就是 `SessionRecord.engineSessionId === ExternalCliSession.id`
 * （host 侧的用量统计 T020 早就用同一把键去重，侧栏一直没跟上）。
 */

/** 已经被恢复进 Desktop 的 CLI 会话 id 集合 */
export function resumedCliIds(sessions: readonly SessionRecord[]): Set<string> {
  const out = new Set<string>()
  for (const s of sessions) {
    if (s.engineSessionId) out.add(s.engineSessionId)
  }
  return out
}

/**
 * 过滤掉「已经有 Desktop 正式会话代表它」的外部 CLI 条目。
 * 没被恢复过的纯 CLI 会话**照常保留**（侧栏仍能看到并恢复它们）。
 */
export function dedupeCliSessions(
  cli: readonly ExternalCliSession[],
  sessions: readonly SessionRecord[]
): ExternalCliSession[] {
  const resumed = resumedCliIds(sessions)
  if (resumed.size === 0) return cli as ExternalCliSession[]
  return cli.filter((c) => !resumed.has(c.id))
}

/**
 * 该 CLI 会话是否已经恢复过；有就返回那条 Desktop 会话（取最近活动的一条）。
 * 用于「点恢复前先看看是不是已经在列表里」——直接切过去，不再新建一条重复记录。
 */
export function findResumedSession(
  sessions: readonly SessionRecord[],
  cliSessionId: string
): SessionRecord | null {
  if (!cliSessionId) return null
  const hits = sessions.filter((s) => s.engineSessionId === cliSessionId)
  if (hits.length === 0) return null
  return hits.reduce((best, s) => (activityTs(s) >= activityTs(best) ? s : best))
}

function activityTs(s: SessionRecord): number {
  if (typeof s.lastActivityAt === 'number') return s.lastActivityAt
  const t = Date.parse(String(s.updatedAt))
  return Number.isNaN(t) ? 0 : t
}
