/**
 * 首页用量卡进程内缓存：避免对话页 ↔ 首页 remount 每次「加载中…」闪一下。
 * 有缓存先出数，后台再静默刷新。
 */
import type { UsageStats } from './perigee-api'

type Range = 'all' | '30d' | '7d'

const byRange = new Map<Range, UsageStats>()

export function getCachedUsage(range: Range): UsageStats | null {
  return byRange.get(range) ?? null
}

export function setCachedUsage(range: Range, stats: UsageStats): void {
  byRange.set(range, stats)
}

/** 测试用 */
export function clearUsageStatsCache(): void {
  byRange.clear()
}
