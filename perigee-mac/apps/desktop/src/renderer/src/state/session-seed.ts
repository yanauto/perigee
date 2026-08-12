/**
 * 多会话冷启动：侧栏 lastActivity / 未读预览依赖 blocksMap。
 * 只 seed 当前焦点会导致后台会话「没点进去就像死的」。
 * 超过 limit 时优先最近活动的会话（后台正在跑的比列表头上的旧会话更需要预览）。
 */
export function sessionIdsNeedingSeed(
  sessions: Array<{ id: string; kind?: string; lastActivityAt?: number }>,
  seeded: ReadonlySet<string>,
  limit = 12
): string[] {
  const ranked = sessions
    .filter((s) => s.id && s.kind !== 'side' && !seeded.has(s.id))
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
  return ranked.slice(0, limit).map((s) => s.id)
}
