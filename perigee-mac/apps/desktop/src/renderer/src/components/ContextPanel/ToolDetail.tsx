import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'
import { EmptyState, StatusDot } from '../ui'

/** 工具调用详情：名称 / 状态 / 参数 / 结果（数据来自该会话的 blocks） */
export function ToolDetail({
  wb,
  sessionId,
  callId
}: {
  wb: Workbench
  sessionId: string
  callId: string
}): JSX.Element {
  const t = useT()
  const tool = wb.blocksFor(sessionId).find((b) => b.kind === 'tool' && b.callId === callId)
  if (!tool || tool.kind !== 'tool') {
    return (
      <EmptyState
        icon="wrench"
        title={t('工具记录不存在')}
        sub={t('该调用可能来自其他会话或已被清理。')}
      />
    )
  }
  const statusText =
    tool.status === 'running' ? t('执行中') : tool.status === 'done' ? t('完成') : t('失败')
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}
    >
      <div className="tool-detail" style={{ margin: 0 }}>
        <div className="td-label">{t('工具')}</div>
        <pre>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status={tool.status} />
            <span style={{ color: 'var(--tx-1)', fontWeight: 600 }}>{tool.name}</span>
            <span>{statusText}</span>
          </span>
        </pre>
      </div>
      {tool.args != null ? (
        <div className="tool-detail" style={{ margin: 0 }}>
          <div className="td-label">{t('参数')}</div>
          <pre>
            {typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>
      ) : null}
      {tool.result ? (
        <div className="tool-detail" style={{ margin: 0 }}>
          <div className="td-label">{t('结果')}</div>
          <pre>{tool.result}</pre>
        </div>
      ) : null}
    </div>
  )
}
