import type { FileDiff } from '../../lib/perigee-api'

/**
 * 产物条出现条件（T023 拍板）：**该轮有文件变更才出现**。
 * 纯聊天轮次（无 filesChanged 且无该轮 diff）不渲染任何收尾条——正文结束即留白。
 * 计量（耗时 / 工具数 / token in-out）不参与判定，也不再展示。
 */
export function hasTurnArtifacts(filesChanged: string[], turnDiffs: FileDiff[]): boolean {
  return filesChanged.length > 0 || turnDiffs.length > 0
}

/** 该轮 diff 子集（turnId 过滤，供组件与测试共用） */
export function diffsOfTurn(diffs: FileDiff[], turnId: string): FileDiff[] {
  return diffs.filter((d) => d.turnId === turnId)
}
