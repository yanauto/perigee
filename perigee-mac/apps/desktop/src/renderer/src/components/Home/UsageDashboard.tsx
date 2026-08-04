import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { UsageStats } from '../../lib/perigee-api'
import { displayModel, formatTokens } from '../../lib/format'
import { getCachedUsage, setCachedUsage } from '../../lib/usage-stats-cache'
import { useI18n, useT } from '../../i18n'
import { ModelsChart } from './ModelsChart'

/**
 * 主页用量卡（T014，对齐 claude-design 原型）：
 * 500px 宽列内左对齐；双 tab（总览/模型）+ 范围段控（All/30d/7d）。
 * 总览 = 8 tile（4×2）+ 热力图（固定「近 26 周」不随范围变化，卡下角注明）；
 * 模型 = 堆叠柱状图（ModelsChart，随范围换粒度）。
 * 桥未就绪（features.stats=false）整卡降级一行「桥接中」（纲领 §5）；
 * 样本不足的铁律：null/无数据的维度隐藏整个 tile，不显示 0/null。
 */

type Range = 'all' | '30d' | '7d'
type Tab = 'overview' | 'models'

const RANGES: { id: Range; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '30d', label: '30d' },
  { id: '7d', label: '7d' }
]

/** 热力格固定近 26 周（长期节律，不随范围变化） */
const HEAT_WEEKS = 26

/** 总览还没量到时模型 tab 的兜底高（约等于 8 tile + 热力图的自然高） */
const DASH_BODY_FALLBACK_H = 240

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 本地日期 key（与 stats.daily 的 date 对齐） */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 轻幽默用量类比：随 range 总量分档，一句收住 */
function easterOf(stats: UsageStats): string {
  const t = stats.totalTokens
  if (t < 100_000) return '这些 token 连起来，还绕不了本仓库一圈。'
  if (t < 1_000_000) return '这些 token 连起来，可绕本仓库三圈。'
  if (t < 10_000_000) return '这些 token，够 Grok 把本仓库从头到尾读几百遍。'
  return '这些 token 的电费，大概够一杯冰美式。'
}

export function UsageDashboard({ enabled }: { enabled: boolean }): JSX.Element {
  const t = useT()
  const { lang } = useI18n()
  const [range, setRange] = useState<Range>('all')
  const [tab, setTab] = useState<Tab>('overview')
  /* 有进程内缓存则立刻出数，避免 Home remount 空白闪 */
  const [stats, setStats] = useState<UsageStats | null>(() => getCachedUsage('all'))
  const [allStats, setAllStats] = useState<UsageStats | null>(() => getCachedUsage('all'))
  const [failed, setFailed] = useState(false)
  /* 双 tab 等高：以「总览内容的自然高」为准动态测量（T022 钉死的 353px 在 tile 改造后偏高，
     总览底部多一条留白）。总览渲染时量一次，模型 tab 直接**固定**成这个高度。
     T023-返修：模型 tab 用的是 height 而不是 minHeight —— 固定高才夹得住图表，
     配合 ModelsChart 不再自量容器（chart-metrics.ts），测量-写回环被彻底断开。 */
  const bodyRef = useRef<HTMLDivElement>(null)
  const [overviewH, setOverviewH] = useState<number | null>(null)

  /* 选中范围数据（tile / 模型图）：切 range 用缓存打底，后台静默刷新 */
  useEffect(() => {
    if (!enabled) return
    const cached = getCachedUsage(range)
    if (cached) {
      setStats(cached)
      setFailed(false)
    }
    let alive = true
    window.perigee.stats
      .usage(range)
      .then((s) => {
        if (!alive) return
        setCachedUsage(range, s)
        setStats(s)
        setFailed(false)
      })
      .catch(() => {
        if (alive && !getCachedUsage(range)) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [enabled, range])

  /* 热力图专用：固定拉一次 all（近 26 周长期节律，不随范围变化） */
  useEffect(() => {
    if (!enabled) return
    const cached = getCachedUsage('all')
    if (cached) setAllStats(cached)
    let alive = true
    window.perigee.stats
      .usage('all')
      .then((s) => {
        if (!alive) return
        setCachedUsage('all', s)
        setAllStats(s)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])

  /* 热力格：列起点对齐周日，逐日填到今天（近 26 周）；无活动数据 → null（整区隐藏）。
     着色分两层：仅消息活跃（CLI 无 lifetime tokens，不编造）= 1 档；有 token 按量 2-4 档。 */
  const heat = useMemo(() => {
    const src = allStats
    if (!src || !src.daily.some((d) => d.tokens > 0 || d.messages > 0)) return null
    const byDate = new Map(src.daily.map((d) => [d.date, d]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - (HEAT_WEEKS * 7 - 1))
    start.setDate(start.getDate() - start.getDay())
    const cells: { date: string; tokens: number; messages: number }[] = []
    for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d)
      const day = byDate.get(key)
      cells.push({ date: key, tokens: day?.tokens ?? 0, messages: day?.messages ?? 0 })
    }
    // T022 bugfix：对齐周日会多算 1–6 天（grid-auto-flow 溢出隐含第 27 列），只留最后 26×7 格
    const trimmed = cells.slice(-HEAT_WEEKS * 7)
    const max = Math.max(...trimmed.map((c) => c.tokens))
    return { cells: trimmed, max }
  }, [allStats])

  /* 总览内容自然高：随内容（tile 数 / 热力图有无 / 语言）变化即重测。
     只在总览 tab 观察 —— 总览里没有任何「消费高度又产生高度」的元素（tile 网格 + 固定 26 周热力图），
     所以这条测量链是单向的；模型 tab 期间 RO 直接不挂，天然不可能自激。 */
  useLayoutEffect(() => {
    if (tab !== 'overview') return
    const el = bodyRef.current
    if (!el) return
    const measure = () => {
      const h = el.offsetHeight
      /* 0 高（隐藏/首帧）不记，避免把兜底值冲成 0 */
      if (h > 0) setOverviewH((prev) => (prev === h ? prev : h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab, stats, allStats, lang])

  /** 模型 tab 的固定内容高：总览实测值，未量到前用兜底常量（不读图表自身高度） */
  const bodyH = overviewH ?? DASH_BODY_FALLBACK_H

  /** 连续天数值：zh「N 天」/ en「Nd」 */
  const days = (n: number): string => (lang === 'en' ? `${n}d` : `${n} 天`)

  if (!enabled) {
    return (
      <section className="dash">
        <div className="dash-bridging">{t('用量统计桥接中（T008）')}</div>
      </section>
    )
  }

  /* 样本不足：该 range 无数据 → 数值 tile 整批隐藏（peakHour/favoriteModel 为 null 单独隐藏） */
  const noData = !!stats && stats.sessions === 0 && stats.messages === 0

  const tiles: { label: string; value: string; show: boolean }[] = stats
    ? [
        { label: 'Token', value: formatTokens(stats.totalTokens), show: !noData },
        { label: t('消息'), value: String(stats.messages), show: !noData },
        { label: t('会话'), value: String(stats.sessions), show: !noData },
        { label: t('活跃天数'), value: String(stats.activeDays), show: !noData },
        { label: t('当前连续'), value: days(stats.currentStreak), show: !noData },
        { label: t('最长连续'), value: days(stats.longestStreak), show: !noData },
        {
          label: t('高峰时段'),
          value: stats.peakHour != null ? `${pad2(stats.peakHour)}:00` : '',
          show: stats.peakHour != null
        },
        {
          label: t('最爱模型'),
          /* T026：显示层去 -build 后缀（账本真实值不动） */
          value: displayModel(stats.favoriteModel),
          show: !!stats.favoriteModel
        }
      ]
    : []

  return (
    <section className="dash">
      <div className="dash-head">
        <div className="dash-tabs" role="group" aria-label={t('用量')}>
          <button
            type="button"
            className={tab === 'overview' ? 'is-active' : ''}
            onClick={() => setTab('overview')}
          >
            {t('总览')}
          </button>
          <button
            type="button"
            className={tab === 'models' ? 'is-active' : ''}
            onClick={() => setTab('models')}
          >
            {t('模型')}
          </button>
        </div>
        <div className="dash-range" role="group" aria-label={t('统计范围')}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={range === r.id ? 'is-active' : ''}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="dash-body"
        ref={bodyRef}
        style={tab === 'overview' ? undefined : { height: bodyH }}
      >
        {!stats ? (
          <div className="dash-bridging">{failed ? t('用量数据加载失败') : t('加载中…')}</div>
        ) : tab === 'overview' ? (
          <>
            {noData ? (
              <div className="dash-bridging">{t('这个范围还没有用量，先派个活试试。')}</div>
            ) : (
              <div className="dash-tiles">
                {tiles
                  .filter((tile) => tile.show)
                  .map((tile) => (
                    <div key={tile.label} className="dash-tile">
                      <div className="dt-label">{tile.label}</div>
                      <div className="dt-value" title={tile.value}>
                        {tile.value}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {heat ? (
              <div className="heat">
                <div className="heat-grid">
                  {heat.cells.map((c) => {
                    const level =
                      c.tokens > 0
                        ? 2 + Math.min(2, Math.floor((c.tokens / heat.max) * 2.999))
                        : c.messages > 0
                          ? 1
                          : 0
                    return (
                      <span
                        key={c.date}
                        className={`hm-cell l${level}`}
                        title={`${c.date} · ${formatTokens(c.tokens)} tokens · ${c.messages} ${t('消息')}`}
                      />
                    )
                  })}
                </div>
                <div className="heat-foot">
                  <span>{t('少')}</span>
                  <span className="hm-key l0" />
                  <span className="hm-key l1" />
                  <span className="hm-key l2" />
                  <span className="hm-key l3" />
                  <span className="hm-key l4" />
                  <span>{t('多')}</span>
                  <span className="heat-note">{t('近 26 周 · 不随范围变化')}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <ModelsChart stats={stats} range={range} boxHeight={bodyH} />
        )}
      </div>

      {stats && !noData ? <div className="dash-easter">{t(easterOf(stats))}</div> : null}
    </section>
  )
}
