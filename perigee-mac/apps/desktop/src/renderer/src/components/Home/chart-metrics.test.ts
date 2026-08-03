import { describe, expect, it } from 'vitest'
import {
  LEGEND_MAX_RATIO,
  MIN_PLOT_H,
  XLABEL_H,
  chartPlotHeight,
  legendHeight
} from './chart-metrics'

/**
 * T023-返修回归守卫：用量卡「模型」tab 切范围后卡片无限增高。
 * 环的成因是「图表高度依赖被自己撑高的容器」，所以这里守两条：
 * ① 纯函数（同输入同输出，无隐藏状态）；
 * ② 图表要的高度永不超过卡片给的高度 —— 反馈环在算术上就不成立。
 */
describe('chartPlotHeight（断环不变量）', () => {
  const BOXES = [120, 160, 200, 240, 280, 353, 420, 600, 900, 1400]
  const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 12]

  it('图表要的总高（绘图区 + x 轴标签带）永不超过卡片给定高度', () => {
    for (const box of BOXES) {
      for (const rows of ROWS) {
        expect(chartPlotHeight(box, rows) + XLABEL_H).toBeLessThanOrEqual(box)
      }
    }
  })

  it('把输出当成下一轮输入也不发散（模拟旧的测量-写回环，必须一步收敛）', () => {
    for (const box of BOXES) {
      for (const rows of ROWS) {
        // 旧实现里「容器高」会被上一轮的图高撑大；现在容器高是外部固定值，
        // 反复计算必须得到同一个数（不动点），而不是逐轮变大。
        const first = chartPlotHeight(box, rows)
        const second = chartPlotHeight(box, rows)
        const third = chartPlotHeight(box, rows)
        expect(second).toBe(first)
        expect(third).toBe(first)
        // 即便有人错误地把「图高 + 标签带」再喂回来，也不会超过原始 box
        expect(chartPlotHeight(first + XLABEL_H, rows)).toBeLessThanOrEqual(first + XLABEL_H)
      }
    }
  })

  it('卡片越高图越高（单调不降），且不小于绘图下限', () => {
    for (const rows of ROWS) {
      let prev = 0
      for (const box of BOXES) {
        const h = chartPlotHeight(box, rows)
        expect(h).toBeGreaterThanOrEqual(MIN_PLOT_H)
        expect(h).toBeGreaterThanOrEqual(prev)
        prev = h
      }
    }
  })

  it('图例最多吃掉卡片高的 45%，再多交给图例自己滚动', () => {
    const box = 240
    const many = chartPlotHeight(box, 40)
    expect(many).toBe(Math.floor(box - box * LEGEND_MAX_RATIO - XLABEL_H))
  })

  it('脏输入不炸（NaN / 负数 / 小数行数）', () => {
    expect(chartPlotHeight(Number.NaN, 3)).toBe(MIN_PLOT_H)
    expect(chartPlotHeight(-100, 3)).toBe(MIN_PLOT_H)
    expect(chartPlotHeight(240, -2)).toBe(chartPlotHeight(240, 0))
    expect(legendHeight(2.7)).toBe(legendHeight(2))
  })

  it('legendHeight：0 行不占位，N 行 = 行高 + 行距 + 上边距', () => {
    expect(legendHeight(0)).toBe(0)
    expect(legendHeight(1)).toBe(16 + 6)
    expect(legendHeight(3)).toBe(3 * 16 + 2 * 5 + 6)
  })
})
