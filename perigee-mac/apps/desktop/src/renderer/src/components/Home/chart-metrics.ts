/**
 * 模型图的高度算术（T023-返修：断掉「测量 → 写回 → 再测量」的反馈环）。
 *
 * 回归背景：ModelsChart 原本用 ResizeObserver 量自己的容器 `.mc-wrap` 得到 plotBoxH，
 * 而 plotBoxH 又写进 SVG 的 viewBox 高度；`.mc-plot` 只有 width:100% 没有固定 height，
 * 于是渲染高 = 容器宽 × H/W —— 图撑高容器、容器再喂给下一次测量，正反馈。
 * T022 时代 `.dash` 钉死 353px 把环夹住了；T023 把卡高改成「内容自然高」后夹子没了，
 * 切范围（useLayoutEffect deps=[range] 重挂 RO）就会一路长下去。
 *
 * 现在的机制：绘图高度**只由卡片给定的固定高 + 图例行数**算出，
 * 两个输入都不受图表自身高度影响 ⇒ 不可能自激。函数是纯的，可直接单测收敛性。
 */

export type ModelChartRange = 'all' | '30d' | '7d'

/** 范围 → 柱数（all 聚合 26 根周柱） */
export const MODEL_CHART_BARS: Record<ModelChartRange, number> = {
  all: 26,
  '30d': 30,
  '7d': 7
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const dayLabel = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`

/** 模型图柱桶：7d/30d 逐日，all = 近 182 天按周聚合 26 桶。纯函数，锁死柱数。 */
export function modelChartBuckets(
  range: ModelChartRange,
  now: Date = new Date()
): { key: string; label: string; days: string[] }[] {
  const n = MODEL_CHART_BARS[range]
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const dayCount = range === 'all' ? 26 * 7 : n
  const keys: string[] = []
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    keys.push(dayKey(d))
  }
  const out: { key: string; label: string; days: string[] }[] = []
  const step = range === 'all' ? 7 : 1
  for (let i = 0; i < keys.length; i += step) {
    const days = keys.slice(i, i + step)
    out.push({ key: days[0]!, label: dayLabel(days[days.length - 1]!), days })
  }
  return out
}

/** 图例一行的行高（.mc-legend-row min-height） */
export const LEGEND_ROW_H = 16
/** 图例行间距（.mc-legend gap） */
export const LEGEND_GAP = 5
/** 图例与图之间的留白（.mc-legend margin-top） */
export const LEGEND_MARGIN = 6
/** x 轴标签带高（viewBox 内） */
export const XLABEL_H = 14
/** 绘图区不再压缩的下限（宁可图例滚动，也不把柱子压没） */
export const MIN_PLOT_H = 80
/** 图例最多吃掉卡片高度的比例，超出部分交给图例自身滚动 */
export const LEGEND_MAX_RATIO = 0.45

/** 图例内容高（行数 → px；0 行 = 不占位） */
export function legendHeight(legendRows: number): number {
  const rows = Math.max(0, Math.floor(legendRows))
  if (rows === 0) return 0
  return rows * LEGEND_ROW_H + (rows - 1) * LEGEND_GAP + LEGEND_MARGIN
}

/**
 * 绘图区高度（不含 x 轴标签带）。
 * 不变量：`chartPlotHeight(box, rows) + XLABEL_H <= box`（box 足够大时），
 * 即**图表永远不会要求比卡片更高的空间**，因此不可能反向把容器撑高。
 */
export function chartPlotHeight(boxHeight: number, legendRows: number): number {
  const box = Number.isFinite(boxHeight) ? Math.max(0, boxHeight) : 0
  const wanted = legendHeight(legendRows)
  const legend = Math.min(wanted, box * LEGEND_MAX_RATIO)
  return Math.max(MIN_PLOT_H, Math.floor(box - legend - XLABEL_H))
}
