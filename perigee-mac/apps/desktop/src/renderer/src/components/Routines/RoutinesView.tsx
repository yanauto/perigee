import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { RoutineCreateInput, RoutineView } from '../../lib/perigee-api'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'
import { EmptyState } from '../ui'
import { RoutineCards } from './RoutineCards'
import { RoutineDetail } from './RoutineDetail'
import { RoutineEditModal } from './RoutineEditModal'

/**
 * Routines 主区容器（T019）：总览 ↔ 详情由 selectedId 决定，编辑模态在本层拥有。
 * 所有写操作直调 T018 契约（toggle / create / update / remove / runNow），
 * 列表刷新靠 routines.onChanged 全量推送，不在前端猜状态。
 */
export function RoutinesView({
  wb,
  routines,
  ready,
  selectedId,
  onSelect,
  onOpenSession
}: {
  wb: Workbench
  routines: RoutineView[]
  ready: boolean
  /** null = 总览 */
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenSession: (sessionId: string) => void
}): JSX.Element {
  const t = useT()
  const [editing, setEditing] = useState<{ open: boolean; routine: RoutineView | null }>({
    open: false,
    routine: null
  })
  const [mcpNames, setMcpNames] = useState<string[]>([])

  /* 可选连接器：已启用的 MCP（与设置页同源） */
  useEffect(() => {
    let alive = true
    void window.perigee.integrations
      .status()
      .then((s) => {
        if (alive) setMcpNames(s.mcp.filter((m) => m.enabled).map((m) => m.name))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const selected = selectedId ? (routines.find((r) => r.id === selectedId) ?? null) : null

  const fail = (e: unknown, what: string) =>
    wb.setError(`${what}：${e instanceof Error ? e.message : String(e)}`)

  const toggle = (id: string, enabled: boolean) => {
    void window.perigee.routines.toggle(id, enabled).catch((e) => fail(e, t('启停失败')))
  }

  const runNow = (id: string) => {
    void window.perigee.routines
      .runNow(id)
      .then((res) => {
        if (res?.sessionId) onOpenSession(res.sessionId)
      })
      .catch((e) => fail(e, t('立即运行失败')))
  }

  const remove = (r: RoutineView) => {
    if (!window.confirm(`${t('删除 Routine')}「${r.name}」？`)) return
    void window.perigee.routines
      .remove(r.id)
      .then(() => onSelect(null))
      .catch((e) => fail(e, t('删除失败')))
  }

  const save = (input: RoutineCreateInput) => {
    const target = editing.routine
    const p = target
      ? window.perigee.routines.update(target.id, input)
      : window.perigee.routines.create(input)
    void p
      .then((saved) => {
        setEditing({ open: false, routine: null })
        if (!target && saved?.id) onSelect(saved.id)
      })
      .catch((e) => fail(e, t('保存失败')))
  }

  /* 选中的 routine 被删/不存在：回总览，不显示空详情 */
  if (selectedId && ready && !selected) {
    return (
      <div className="ro-scroll">
        <EmptyState icon="clock" title={t('这个 Routine 不在了')} sub={t('可能已被删除。')} />
      </div>
    )
  }

  return (
    <>
      {selected ? (
        <RoutineDetail
          routine={selected}
          onBack={() => onSelect(null)}
          onEdit={() => setEditing({ open: true, routine: selected })}
          onDelete={() => remove(selected)}
          onRunNow={() => runNow(selected.id)}
          onToggle={(v) => toggle(selected.id, v)}
          onOpenSession={onOpenSession}
        />
      ) : (
        <RoutineCards
          routines={routines}
          ready={ready}
          onOpen={onSelect}
          onNew={() => setEditing({ open: true, routine: null })}
          onToggle={toggle}
        />
      )}
      <RoutineEditModal
        open={editing.open}
        routine={editing.routine}
        defaultWorkspace={wb.currentWorkspace ?? ''}
        defaultModel={wb.settings?.model ?? ''}
        mcpNames={mcpNames}
        onClose={() => setEditing({ open: false, routine: null })}
        onSave={save}
      />
    </>
  )
}
