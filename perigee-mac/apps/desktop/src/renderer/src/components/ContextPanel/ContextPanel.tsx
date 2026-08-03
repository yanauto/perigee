import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'
import { IconButton } from '../ui'
import { FilesView } from './FilesView'
import { DiffView } from './DiffView'
import { ToolDetail } from './ToolDetail'
import { PreviewView } from './PreviewView'

/**
 * 右栏上下文面板（单实例，纲领 §2）：
 * 文件树 / Diff / 编辑器是同一面板的互斥视图，任何路径打开文件都复用同一文件视图。
 * - tab 高亮：turnDiff → Diff；tool/preview → 不高亮（内容覆盖显示）；其余 → 文件
 * - Diff tab：有最近 turnId 则 openTurnDiff（本轮变更），否则本地切全量 Diff 视图
 */
export function ContextPanel({ wb }: { wb: Workbench }): JSX.Element {
  const t = useT()
  const ins = wb.inspector
  /** 无最近 turnId 时点击 Diff tab 的本地覆盖（不改 inspector） */
  const [tabOverride, setTabOverride] = useState<'diff' | null>(null)

  /* inspector 一变，路由即回归 inspector（本地覆盖只服务当次点击） */
  useEffect(() => {
    setTabOverride(null)
  }, [ins])

  /** 当前会话最近一个带 turnId 的 diff（Diff tab 优先开「本轮变更」） */
  const recentTurn = useMemo(() => {
    for (let i = wb.diffs.length - 1; i >= 0; i--) {
      const d = wb.diffs[i]
      if (d.turnId && d.sessionId === wb.activeSessionId) {
        return { sessionId: d.sessionId, turnId: d.turnId }
      }
    }
    return null
  }, [wb.diffs, wb.activeSessionId])

  const activeTab: 'files' | 'diff' | null =
    ins.kind === 'turnDiff'
      ? 'diff'
      : ins.kind === 'tool' || ins.kind === 'preview'
        ? null
        : tabOverride === 'diff'
          ? 'diff'
          : 'files'

  const clickFiles = () => {
    setTabOverride(null)
    wb.closeInspector()
    wb.persistLayout({ panes: { file: true } })
  }
  const clickDiff = () => {
    if (recentTurn) {
      setTabOverride(null)
      wb.openTurnDiff(recentTurn.sessionId, recentTurn.turnId)
    } else {
      setTabOverride('diff')
    }
  }
  const closePanel = () => {
    wb.closeInspector()
    wb.persistLayout({ panes: { file: false } })
  }

  /* 路由：file/md/terminal/closed 统一归文件页（终端已移居底部抽屉） */
  let body: JSX.Element
  if (ins.kind === 'tool') {
    body = <ToolDetail wb={wb} sessionId={ins.sessionId} callId={ins.callId} />
  } else if (ins.kind === 'turnDiff') {
    body = <DiffView wb={wb} sessionId={ins.sessionId} turnId={ins.turnId} />
  } else if (ins.kind === 'preview') {
    body = <PreviewView />
  } else if (tabOverride === 'diff') {
    body = <DiffView wb={wb} />
  } else {
    body = <FilesView wb={wb} />
  }

  return (
    <aside className="context-panel">
      {/* chrome（ccd-10/11）：标题行 = 当前 tab 名（分段控件承担）+ 右侧操作小图标；
          选中文件时的路径条由 FilesView 的 .editor-bar 并入本 chrome 语义（返回/路径/dirty/保存） */}
      <div className="cp-head">
        <div className="cp-tabs">
          <button
            type="button"
            className={`cp-tab${activeTab === 'files' ? ' is-active' : ''}`}
            onClick={clickFiles}
          >
            {t('文件')}
          </button>
          <button
            type="button"
            className={`cp-tab${activeTab === 'diff' ? ' is-active' : ''}`}
            onClick={clickDiff}
          >
            {t('变更')}
          </button>
        </div>
        {activeTab === null ? (
          <span className="cp-title">{ins.kind === 'tool' ? t('工具详情') : t('预览')}</span>
        ) : null}
        <div className="cp-actions">
          <IconButton tip={t('关闭  Esc')} icon="x" onClick={closePanel} />
        </div>
      </div>
      <div className="cp-body">{body}</div>
    </aside>
  )
}
