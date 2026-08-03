import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import type { NativeTaskEntry } from '../../lib/tasks-from-events'
import { EmptyState, IconButton, StatusDot } from '../ui'

/**
 * 任务 / Subagent 面板：wb.tasks（原生 ACP 事件优先，tool 派生兜底）。
 * 状态点 + 耗时 + 工具数；空态 EmptyState。
 */

const STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  done: '完成',
  error: '失败',
  cancelled: '取消'
}

const KIND_LABEL: Record<string, string> = {
  subagent: '子代理',
  bg_task: '后台',
  monitor: 'Monitor'
}

export function TasksPanel({
  wb,
  open,
  onClose
}: {
  wb: Workbench
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  if (!open) return null
  const tasks = wb.tasks
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>任务 / Subagent</span>
          {tasks.length > 0 ? (
            <span className="chip">
              <span>{tasks.length} 项</span>
            </span>
          ) : null}
          <IconButton tip="关闭" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          {tasks.length === 0 ? (
            <EmptyState
              icon="bot"
              title="当前会话尚无子代理 / 后台任务"
              sub="引擎发出 subagent_spawned 等 ACP 扩展事件，或模型调用 task 工具后，将在此列表显示。主对话时间线仍展示工具卡与轮次摘要。"
            />
          ) : (
            tasks.map((t) => {
              const progress = (t as NativeTaskEntry).progress
              const pct = progress?.contextUsagePct
              const meta = [
                STATUS_LABEL[t.status] ?? t.status,
                t.kind ? (KIND_LABEL[t.kind] ?? t.kind) : null,
                t.subagentType ?? null,
                t.source === 'native' ? '原生' : t.source === 'tool' ? '工具' : t.name,
                progress
                  ? `${progress.turnCount} 轮 · ${progress.toolCallCount} 工具 · ${Math.round(progress.durationMs / 1000)}s`
                  : null,
                pct != null ? `上下文 ${pct}%` : null
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <div className="set-row" key={t.id} title={t.resultPreview ?? t.title}>
                  <StatusDot status={t.status} />
                  <div className="sr-label">
                    <div className="sr-name">{t.title}</div>
                    <div className="sr-desc">{meta}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
