import type { ChatBlock } from '../../lib/types'
import { useI18n, useT } from '../../i18n'
import { Icon } from '../ui'
import { waitingSeconds } from './approval-flow'

type ApprovalBlock = Extract<ChatBlock, { kind: 'approval' }>

const RISK_LABEL = { low: '低风险', medium: '中风险', high: '高风险' } as const

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

  if (block.status !== 'pending') {
    const approved = block.status === 'approved'
    return (
      <div className="ac-resolved">
        <span className={`dot ${approved ? 'dot-ok' : 'dot-danger'}`} />
        <span>{approved ? t('已允许 · Grok 继续执行') : t('已拒绝 · Grok 换了个做法')}</span>
        <span className="ac-resolved-meta">
          {block.action}
          {block.detail ? ` · ${block.detail}` : ''}
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

  return (
    <div className="approval-card">
      <div className="ac-head">
        <Icon name="alert" size={14} className="ac-warn-icon" />
        <span className="ac-title">{block.action || t('操作审批')}</span>
        <span className="ac-risk">{t(RISK_LABEL[block.risk] ?? block.risk)}</span>
        <span className="ac-waiting">{waiting}</span>
      </div>
      {block.detail ? <div className="ac-detail">{block.detail}</div> : null}
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
