import { useState, type KeyboardEvent } from 'react'
import type { ChatBlock } from '../../lib/types'
import { looksLikePath } from '../../lib/paths'
import { useT } from '../../i18n'
import { Icon } from '../ui'
import { TOOL_GRID } from './approval-flow'

type ToolBlock = Extract<ChatBlock, { kind: 'tool' }>

/** 图标按工具名映射：read→eye write/edit→file-text bash→terminal search→search 默认 wrench */
function iconFor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('read')) return 'eye'
  if (n.includes('write') || n.includes('edit')) return 'file-text'
  if (n.includes('bash') || n.includes('shell')) return 'terminal'
  if (n.includes('search') || n.includes('grep') || n.includes('glob')) return 'search'
  return 'wrench'
}

/** 从工具参数里挑一个人类可读的目标摘要（命令/路径/模式…），沿旧 ToolCard */
function summarize(args: unknown): string {
  if (args == null) return ''
  if (typeof args === 'string') return args
  if (typeof args !== 'object') return String(args)
  const o = args as Record<string, unknown>
  const keys = [
    'command', 'cmd', 'path', 'file_path', 'target_file', 'file', 'filename',
    'pattern', 'query', 'url', 'prompt', 'old_path', 'new_path'
  ]
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  try {
    const s = JSON.stringify(args)
    return s.length > 120 ? `${s.slice(0, 120)}…` : s
  } catch {
    return ''
  }
}

function prettyArgs(args: unknown): string {
  if (args == null) return '（无参数）'
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args, null, 2) ?? String(args)
  } catch {
    return String(args)
  }
}

/** 计量列内容：当前事件数据可诚实支持的只有结果行数（+/− 与耗时需 schema 扩展，见 T015 回执缺口） */
function meterOf(block: ToolBlock): string {
  if (block.status === 'running') return '…'
  if (!block.result) return ''
  const lines = block.result.split('\n').length
  return `${lines} 行`
}

/**
 * 工具行（T015 工作轨道）：等宽四列固定列宽（图标 · 动作 · 目标 · 计量 · 状态，
 * 列宽钉死见 approval-flow.TOOL_COLS），行高 22；计量右对齐不跟内容跳。
 * 默认单行摘要，点击展开参数与结果。
 */
export function ToolRow({
  block,
  onOpenPanel,
  onOpenPath
}: {
  block: ToolBlock
  onOpenPanel: () => void
  /** T027：目标是路径时一键打开（应用内可读走右栏，否则弹系统兜底） */
  onOpenPath: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const summary = summarize(block.args)
  const meter = meterOf(block)

  const toggle = () => setOpen((v) => !v)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div className="tool-unit">
      <div
        className={`tool-row${open ? ' is-open' : ''}`}
        style={{ gridTemplateColumns: TOOL_GRID }}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <Icon name={iconFor(block.name)} size={12} className="tr-icon" />
        <span className="tr-name">{block.name}</span>
        {looksLikePath(summary) ? (
          <button
            type="button"
            className="tr-target is-link"
            title={summary}
            onClick={(e) => {
              e.stopPropagation()
              onOpenPath(summary)
            }}
          >
            {summary}
          </button>
        ) : (
          <span className="tr-target" title={summary}>
            {summary}
          </span>
        )}
        <span className="tr-meter">{meter}</span>
        <span className="tr-state">
          <span className={`tr-dot${block.status === 'running' ? ' is-running' : block.status === 'error' ? ' is-err' : ''}`} />
        </span>
      </div>
      {open ? (
        <div className="tool-detail">
          <div className="td-label">{t('参数')}</div>
          <pre>{prettyArgs(block.args)}</pre>
          <div className="td-label">{t('输出')}</div>
          <pre>{block.result ?? (block.status === 'running' ? t('执行中…') : t('（无输出）'))}</pre>
          <button type="button" className="td-panel" onClick={onOpenPanel}>
            {t('在面板中查看')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
