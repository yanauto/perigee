import type { JSX, ReactNode } from 'react'
import type { FileDiff } from '../../lib/perigee-api'
import type { ChatBlock } from '../../lib/types'
import { aggregateDiffStats } from '../../lib/diff-stats'
import { baseName } from '../../lib/format'
import { describeToolSegment, dedupeFilePaths, tallyToolBlocks } from '../../lib/turn-aggregate'
import { diffsOfTurn } from './turn-artifacts'
import { useI18n } from '../../i18n'
import { Icon } from '../ui'

type TurnBlock = Extract<ChatBlock, { kind: 'turn' }>

/** 行内展示的文件名上限；多了收成「N 个文件」 */
const INLINE_FILES = 2

/**
 * 工具段聚合行（T028）：一轮内连续的工具调用收敛成**一行自然语言摘要**，
 * 「搜索 12 次 · 执行 3 个命令 · 改 2 个文件 +434 −55 ›」——默认只有这一行（淡灰小字、无容器），
 * 点 `›` 展开才是 T015/T023 的逐条工作轨道明细。流式中数字实时累加 + 活动指示，不逐条刷屏。
 *
 * 产物条已融进本行行尾（T028：独立产物条取消）：`+N −M` · 文件名（accent 内联可点）·
 * 「查看变更」「打回」。纯聊天轮次（无工具、无文件变更）本行整个不渲染。
 */
export function ToolSegment({
  blocks,
  live,
  turn,
  diffs,
  workspaceRoot,
  open,
  onToggle,
  onOpenPath,
  onOpenTurnDiff,
  onRevert,
  children
}: {
  /** 段内的连续 thought/tool/plan 块（明细渲染由 children 提供） */
  blocks: ChatBlock[]
  /** 段内有正在跑的工具/流式思考 */
  live: boolean
  /** 融进本行的轮次（可能没有：段还没结束，或纯工具段） */
  turn: TurnBlock | null
  diffs: FileDiff[]
  workspaceRoot: string | null
  open: boolean
  onToggle: () => void
  onOpenPath: (path: string) => void
  onOpenTurnDiff: (turnId: string) => void
  onRevert: (turnId: string) => void
  /** 展开后的逐条明细（工作轨道） */
  children: ReactNode
}): JSX.Element | null {
  const { lang, t } = useI18n()

  const stats = tallyToolBlocks(blocks)
  const summary = describeToolSegment(stats, lang)

  const turnDiffs = turn ? diffsOfTurn(diffs, turn.turnId) : []
  const diffStats = aggregateDiffStats(turnDiffs)
  const pendingCount = turnDiffs.filter((d) => d.status === 'pending').length
  const reverted = turnDiffs.length > 0 && turnDiffs.every((d) => d.status === 'rejected')
  /* T028：同轮同路径去重（host 的 filesChanged 可能绝对/相对混排，导致同名 chip 重复） */
  const files = turn ? dedupeFilePaths(turn.filesChanged, workspaceRoot) : []
  const hasChange = files.length > 0 || diffStats.add > 0 || diffStats.del > 0

  /* 既没有工具调用也没有文件变更 → 什么都不渲染（T023 纯聊天轮次留白，不变） */
  if (stats.total === 0 && !hasChange) return null

  const confirmRevert = (turnId: string) => {
    if (window.confirm(t('打回此轮：还原该轮所有未放行变更'))) onRevert(turnId)
  }

  return (
    <div className={`agg${open ? ' is-open' : ''}${live ? ' is-live' : ''}`}>
      <div className="agg-row">
        <button
          type="button"
          className="agg-main"
          aria-expanded={open}
          onClick={onToggle}
          disabled={stats.total === 0}
        >
          <Icon name="chevron" size={10} className={`agg-chevron${open ? ' is-open' : ''}`} />
          <span className="agg-text">
            {summary || t('本轮变更')}
            {stats.failed > 0 ? ` · ${stats.failed} ${t('个失败')}` : ''}
          </span>
          {live ? <span className="dot dot-accent dot-pulse" /> : null}
        </button>

        {/* 文件：一两个直接写名字（accent 内联可点），多了写「N 个文件」点开明细 */}
        {files.length > 0 ? (
          <span className="agg-files">
            {files.length <= INLINE_FILES ? (
              files.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="file-link"
                  title={f}
                  onClick={() => onOpenPath(f)}
                >
                  {baseName(f)}
                </button>
              ))
            ) : (
              <button type="button" className="file-link" onClick={onToggle}>
                {files.length} {t('个文件')}
              </button>
            )}
          </span>
        ) : null}

        {diffStats.add > 0 || diffStats.del > 0 ? (
          <span className="agg-stat">
            <span className="ts-stat-add">+{diffStats.add}</span>
            <span className="ts-stat-del">−{diffStats.del}</span>
          </span>
        ) : null}

        {reverted ? <span className="agg-note">{t('已打回')}</span> : null}
        {turn?.testSignal === 'fail' ? (
          <span className="agg-note">
            <span className="dot dot-danger" />
            {t('测试失败')}
          </span>
        ) : null}
        {turn?.risk === 'elevated' ? (
          <span className="agg-note">
            <span className="dot dot-warn" />
            {t('风险')}
          </span>
        ) : null}

        {turn && hasChange ? (
          <span className="agg-actions">
            <button type="button" className="ts-view" onClick={() => onOpenTurnDiff(turn.turnId)}>
              {t('查看变更')}
            </button>
            {pendingCount > 0 && !reverted ? (
              <button
                type="button"
                className="ts-revert"
                data-tip={t('打回此轮：还原该轮所有未放行变更')}
                onClick={() => confirmRevert(turn.turnId)}
              >
                {t('打回')}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      {open ? <div className="agg-detail">{children}</div> : null}
    </div>
  )
}
