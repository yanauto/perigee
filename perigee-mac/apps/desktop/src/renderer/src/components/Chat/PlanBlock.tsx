import type { ChatBlock, PlanEntry } from '../../lib/types'

type PlanBlock = Extract<ChatBlock, { kind: 'plan' }>

/** entries 状态 → 标记与样式：完成 ✓（删除线暗色）/ 当前 ›（accent）/ 未做 · */
function glyph(status: string | undefined): { char: string; cls: string } {
  const s = (status ?? '').toLowerCase()
  if (['completed', 'done', 'complete', 'ok'].includes(s)) return { char: '✓', cls: 'is-done' }
  if (['in_progress', 'in-progress', 'running', 'active', 'doing'].includes(s))
    return { char: '›', cls: 'is-active' }
  return { char: '·', cls: '' }
}

/** 计划块（T015 工作轨道）：PLAN N/M 微标签 + checklist（plan 事件，整单更新） */
export function PlanBlock({ block }: { block: PlanBlock }) {
  if (!block.entries.length) return null
  const done = block.entries.filter((e) => glyph(e.status).cls === 'is-done').length
  return (
    <div className="plan-block">
      <div className="plan-head">
        <span className="plan-label">PLAN</span>
        <span className="plan-count">
          {done}/{block.entries.length}
        </span>
      </div>
      {block.entries.map((e: PlanEntry, i: number) => {
        const g = glyph(e.status)
        return (
          <div key={i} className={`plan-entry ${g.cls}`.trim()}>
            <span className="pe-mark">{g.char}</span>
            <span>{e.text}</span>
          </div>
        )
      })}
    </div>
  )
}
