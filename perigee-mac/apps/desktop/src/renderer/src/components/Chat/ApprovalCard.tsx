import { useState } from 'react'
import type { ChatBlock } from '../../lib/types'
import { useI18n, useT } from '../../i18n'
import { Icon } from '../ui'
import { waitingSeconds } from './approval-flow'

type ApprovalBlock = Extract<ChatBlock, { kind: 'approval' }>

const RISK_LABEL = { low: '低风险', medium: '中风险', high: '高风险' } as const

/** 超过此长度默认折叠，点「展开」看全文 */
const DETAIL_COLLAPSE_AT = 160

/**
 * 审批卡（T015：全页唯一琥珀色元素）：
 * --bg-1 底 + 左边框 3px --warn；标题 = 警示图标 + 动作 + 风险徽标（warn-soft）+ 右侧等待时长；
 * 请求行等宽；允许（墨色，kbd A）/ 拒绝（hover 染 danger，kbd D）/ 先看 diff。
 * A/D 键盘流在 ChatStream（approval-flow.isApprovalKey，输入框聚焦时除外）。
 * 处理完折叠成一行结果条（绿/红点 + 文案 + 等宽摘要）。
 */
export function ApprovalCard({
  block,
  onResolve,
  onOpenDiff
}: {
  block: ApprovalBlock
  onResolve: (requestId: string, approved: boolean) => void
  onOpenDiff?: () => void
}) {
  const t = useT()
  const { lang } = useI18n()
  const [detailOpen, setDetailOpen] = useState(false)

  if (block.status !== 'pending') {
    const approved = block.status === 'approved'
    const metaDetail =
      block.detail && block.detail.length > 80 ? `${block.detail.slice(0, 80)}…` : block.detail
    return (
      <div className="ac-resolved">
        <span className={`dot ${approved ? 'dot-ok' : 'dot-danger'}`} />
        <span>{approved ? t('已允许 · Grok 继续执行') : t('已拒绝 · Grok 换了个做法')}</span>
        <span className="ac-resolved-meta" title={block.detail || undefined}>
          {t(block.action) || block.action}
          {metaDetail ? ` · ${metaDetail}` : ''}
        </span>
      </div>
    )
  }

  const secs = waitingSeconds(block.ts)
  const waiting =
    lang === 'en'
      ? secs >= 60
        ? `waiting ${Math.floor(secs / 60)} min`
        : `waiting ${secs}s`
      : secs >= 60
        ? `等待 ${Math.floor(secs / 60)} 分钟`
        : `等待 ${secs} 秒`

  const detail = block.detail || ''
  const collapsible = detail.length > DETAIL_COLLAPSE_AT || detail.includes('\n')
  const showFull = !collapsible || detailOpen

  return (
    <div className="approval-card">
      <div className="ac-head">
        <Icon name="alert" size={14} className="ac-warn-icon" />
        <span className="ac-title">{t(block.action) || block.action || t('操作审批')}</span>
        <span className="ac-risk">{t(RISK_LABEL[block.risk] ?? block.risk)}</span>
        <span className="ac-waiting">{waiting}</span>
      </div>
      {detail ? (
        <div className="ac-detail-wrap">
          <div className={`ac-detail${showFull ? '' : ' is-collapsed'}`}>
            {showFull ? detail : `${detail.slice(0, DETAIL_COLLAPSE_AT)}…`}
          </div>
          {collapsible ? (
            <button
              type="button"
              className="ac-detail-toggle"
              onClick={() => setDetailOpen((v) => !v)}
            >
              {showFull ? t('收起') : t('展开')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="ac-actions">
        <button type="button" className="ac-allow" onClick={() => onResolve(block.requestId, true)}>
          {t('允许')}
          <kbd>A</kbd>
        </button>
        <button type="button" className="ac-deny" onClick={() => onResolve(block.requestId, false)}>
          {t('拒绝')}
          <kbd>D</kbd>
        </button>
        {onOpenDiff ? (
          <button type="button" className="ac-diff" onClick={onOpenDiff}>
            {t('先看 diff')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
