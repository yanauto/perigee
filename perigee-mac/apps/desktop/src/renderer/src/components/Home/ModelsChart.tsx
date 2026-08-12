import { useMemo } from 'react'
import type { JSX } from 'react'
import type { UsageStats } from '../../lib/perigee-api'
import { displayModel, formatTokens } from '../../lib/format'
import { useT } from '../../i18n'
import { XLABEL_H, chartPlotHeight, modelChartBuckets } from './chart-metrics'

/**
 * 模型 tab 堆叠柱状图（T014，对齐 claude-design 原型）：
 * - 随范围换粒度而不是省略：7d = 7 根胖柱、30d = 30 根、All = 聚合 26 根周柱（与热力图同节奏）。
 * - 模型配色规则：同一支蓝的深浅（--m1/m2/m3 梯子），最老代际最深堆底部、最新最浅在顶部；
 *   无法解析代际的（如 unknown）与 6 名之外归「其他」灰，垫最底。图例 = 从深到浅的梯子。
 * - Y 轴取整数档（1/2/2.5/5×10ⁿ，≤4 间隔）；X 轴 ≤8 根全标、否则 6 个均布；范围切换动效 420ms。
 * - T012 未就绪：降级 daily 总量单色柱（feature-detect，不做假数据）；空数据照画坐标轴。
 */

type Range = 'all' | '30d' | '7d'

/** 模型 id → 代际版本（无法解析 → null，归「其他」） */
function generationOf(model: string): number[] | null {
  const m = model.match(/(\d+(?:\.\d+)+)/)
  if (!m) return null
  return m[1]!.split('.').map(Number)
}
const cmpGen = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** 代际色梯：rank 0（最老）→ --m1（最深），rank G-1（最新）→ --m3（最浅），中间 color-mix 插值 */
function ladderColor(rank: number, total: number): string {
  if (total <= 1) return 'var(--m1)'
  const t = rank / (total - 1)
  if (t <= 0.5) {
    const f = t * 2
    return `color-mix(in srgb, var(--m1) ${Math.round((1 - f) * 100)}%, var(--m2))`
  }
  const f = (t - 0.5) * 2
  return `color-mix(in srgb, var(--m2) ${Math.round((1 - f) * 100)}%, var(--m3))`
}

const OTHER_COLOR = 'var(--tx-3)'
const MONO_COLOR = 'var(--m2)' // T012 未就绪降级单色

/** y 轴整数档：步进从细到粗（1/2/2.5/5×10ⁿ），取首个使 最大值/步进 ≤ 4 的（原型同款） */
function yStep(max: number): { step: number; nTick: number } {
  if (max <= 0) return { step: 1, nTick: 1 }
  for (let exp = 0; exp < 12; exp++) {
    const base = 10 ** exp
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * base
      if (max / step <= 4) return { step, nTick: Math.max(1, Math.ceil(max / step)) }
    }
  }
  return { step: 10 ** 12, nTick: 1 }
}

const W = 478 // 卡内宽（500 - 11×2 内边距）
const ML = 36 // y 轴标签区
const MT = 4

/**
 * T023-返修：图表高度**不再自己量容器**（旧实现的 ResizeObserver 会与被撑高的容器自激，
 * 见 chart-metrics.ts 顶部注释）。现在由卡片把固定高 `boxHeight` 传进来，
 * 图表用纯函数 chartPlotHeight 算绘图区高 —— 单向数据流，无反馈环。
 */
export function ModelsChart({
  stats,
  range,
  boxHeight
}: {
  stats: UsageStats
  range: Range
  /** 卡片 tab 内容区的固定高（来自总览自然高实测；见 UsageDashboard） */
  boxHeight: number
}): JSX.Element {
  const t = useT()
  const hasMatrix = Array.isArray(stats.dailyByModel) && stats.dailyByModel.length > 0

  /* 柱桶：7d/30d = 逐日；all = 近 182 天按 7 天聚合 26 桶（与热力图同节奏） */
  const buckets = useMemo(() => modelChartBuckets(range), [range])

  /* 模型排序：「其他」（无代际）垫最底；代际越老越深、堆底部 */
  const { models, stacks } = useMemo(() => {
    const dayInBucket = new Map<string, number>()
    buckets.forEach((b, bi) => b.days.forEach((d) => dayInBucket.set(d, bi)))
    if (hasMatrix) {
      const totals = new Map<string, number>()
      for (const r of stats.dailyByModel!) {
        totals.set(r.model, (totals.get(r.model) ?? 0) + r.tokens)
      }
      const withGen: { model: string; gen: number[]; total: number }[] = []
      let otherTotal = 0
      for (const [model, total] of totals) {
        const gen = generationOf(model)
        if (gen) withGen.push({ model, gen, total })
        else otherTotal += total
      }
      withGen.sort((a, b) => cmpGen(a.gen, b.gen))
      // 代际榜最多 6 支，其余并进「其他」
      const shown = withGen.slice(-6)
      const shownSet = new Set(shown.map((x) => x.model))
      const overflow = withGen.slice(0, -6).reduce((a, x) => a + x.total, 0)
      otherTotal += overflow
      const modelList = [
        ...(otherTotal > 0 ? [t('其他')] : []),
        ...shown.map((x) => x.model)
      ]
      const genCount = shown.length
      const colorOf = (m: string): string => {
        if (m === t('其他')) return OTHER_COLOR
        const rank = shown.findIndex((x) => x.model === m)
        return ladderColor(rank, genCount)
      }
      const acc = new Map<number, Map<string, number>>()
      for (const r of stats.dailyByModel!) {
        const bi = dayInBucket.get(r.date)
        if (bi == null) continue
        const key = shownSet.has(r.model) ? r.model : t('其他')
        const bucket = acc.get(bi) ?? new Map<string, number>()
        bucket.set(key, (bucket.get(key) ?? 0) + r.tokens)
        acc.set(bi, bucket)
      }
      return {
        models: modelList.map((m) => ({ name: m, color: colorOf(m) })),
        stacks: buckets.map((_, bi) => modelList.map((m) => acc.get(bi)?.get(m) ?? 0))
      }
    }
    // 降级：daily 总量单色
    const byDate = new Map(stats.daily.map((d) => [d.date, d.tokens]))
    return {
      models: [{ name: 'tokens', color: MONO_COLOR }],
      stacks: buckets.map((b) => [b.days.reduce((a, d) => a + (byDate.get(d) ?? 0), 0)])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMatrix, stats, buckets, t])

  /* 绘图区高：卡片给的固定高 − 图例（按行数算，不量 DOM）− x 轴标签带 */
  const legendRows = hasMatrix ? models.length : 0
  const CHART_H = chartPlotHeight(boxHeight, legendRows)
  const H = CHART_H + XLABEL_H

  const yMax = Math.max(0, ...stacks.map((s) => s.reduce((a, b) => a + b, 0)))
  const { step, nTick } = yStep(yMax)
  const top = step * nTick
  const plotW = W - ML
  const plotH = CHART_H - MT
  const slot = plotW / buckets.length
  const gap = buckets.length <= 8 ? 12 : buckets.length <= 30 ? 4 : 3
  const barW = Math.max(1.5, slot - gap)
  const yOf = (v: number) => MT + plotH - (v / top) * plotH

  /* x 轴刻度：≤8 根全标，否则 6 个均布 */
  const xTicks = useMemo(() => {
    const n = buckets.length
    if (n <= 8) return buckets.map((b, i) => ({ label: b.label, i }))
    const idx = Array.from({ length: 6 }, (_, k) => Math.round((k / 5) * (n - 1)))
    return idx.map((i) => ({ label: buckets[i]!.label, i }))
  }, [buckets])

  const hasAnyData = stacks.some((s) => s.some((v) => v > 0))

  /* 图例：与堆叠同序（深→浅梯子），byModel 给 in/out 与占比 */
  const legend = useMemo(() => {
    const total = Math.max(
      1,
      stats.byModel.reduce((a, b) => a + b.tokens, 0)
    )
    const valueOf = (name: string): { value: string; pct: string } => {
      if (name === t('其他')) {
        // 「其他」= 无代际模型 + 6 名之外的代际（与堆叠口径一致）
        const shown = stats.byModel.filter((m) => models.some((x) => x.name === m.model))
        const other =
          stats.byModel.reduce((a, b) => a + b.tokens, 0) - shown.reduce((a, b) => a + b.tokens, 0)
        return { value: formatTokens(Math.max(0, other)), pct: `${((Math.max(0, other) / total) * 100).toFixed(1)}%` }
      }
      const m = stats.byModel.find((x) => x.model === name)
      if (!m) return { value: '0', pct: '0.0%' }
      return {
        value:
          m.inputTokens != null && m.outputTokens != null
            ? `${formatTokens(m.inputTokens)} in · ${formatTokens(m.outputTokens)} out`
            : formatTokens(m.tokens),
        pct: `${((m.tokens / total) * 100).toFixed(1)}%`
      }
    }
    return models.map((m) => ({ ...m, ...valueOf(m.name) }))
  }, [stats.byModel, models, t])

  return (
    <div className="mc-wrap" key={range} data-buckets={buckets.length}>
      <svg
        className="mc-plot"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('按日用量柱状图')}
      >
        {/* y 轴整数档刻度（ccd-07：无网格线，只留 0 基线） */}
        {Array.from({ length: nTick + 1 }, (_, i) => {
          const y = MT + plotH - (i / nTick) * plotH
          return (
            <text key={i} className="mc-axis-text" x={ML - 4} y={y + 3} textAnchor="end">
              {i === 0 ? '0' : formatTokens(step * i)}
            </text>
          )
        })}
        {/* 0 基线（稍实） */}
        <line x1={ML} y1={MT + plotH} x2={W} y2={MT + plotH} stroke="var(--border-strong)" />

        {/* 堆叠柱：底部 = 最老代际（最深），顶部 = 最新（最浅） */}
        {stacks.map((bucket, bi) => {
          let acc = 0
          const x = ML + bi * slot + (slot - barW) / 2
          return bucket.map((v, mi) => {
            if (v <= 0) return null
            const y0 = yOf(acc)
            const y1 = yOf(acc + v)
            acc += v
            return (
              <rect
                key={`${range}-${bi}-${mi}`}
                className="mc-bar"
                x={x}
                y={y1}
                width={barW}
                height={Math.max(0.5, y0 - y1)}
                fill={models[mi]!.color}
                fillOpacity={models[mi]!.name === t('其他') ? 0.45 : 1}
              >
                <title>
                  {buckets[bi]!.label} · {displayModel(models[mi]!.name)} · {formatTokens(v)}
                </title>
              </rect>
            )
          })
        })}

        {/* x 刻度 */}
        {xTicks.map(({ label, i }) => (
          <text
            key={`${range}-${i}`}
            className="mc-axis-text"
            x={ML + i * slot + slot / 2}
            y={H - 3}
            textAnchor="middle"
          >
            {label}
          </text>
        ))}

        {/* 空数据提示（坐标轴照画，禁止空白） */}
        {!hasAnyData ? (
          <text className="mc-empty" x={ML + plotW / 2} y={MT + plotH / 2} textAnchor="middle">
            {t('暂无用量数据')}
          </text>
        ) : null}
      </svg>

      {/* 图例：色块 + 模型名 + in/out + 占比（深→浅梯子） */}
      {hasMatrix && legend.length > 0 ? (
        <div className="mc-legend">
          {legend.map((l) => (
            <div key={l.name} className="mc-legend-row">
              <span
                className="mc-legend-dot"
                style={{ background: l.color, opacity: l.name === t('其他') ? 0.45 : 1 }}
              />
              <span className="mc-legend-name" title={displayModel(l.name)}>
                {displayModel(l.name)}
              </span>
              <span className="mc-legend-val">{l.value}</span>
              <span className="mc-legend-pct">{l.pct}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
