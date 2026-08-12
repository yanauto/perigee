import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import type { BridgeFeatures } from '../../state/features'
import { mixEntries, orderSessions, type SidebarEntry } from '../../state/session-order'
import {
  EMPTY_GROUPS,
  assignSession,
  createGroup,
  deleteGroup,
  loadGroups,
  renameGroup,
  saveGroups,
  toggleCollapsed,
  toggleUngroupedCollapsed,
  type SidebarGroupsState
} from '../../state/sidebar-groups'
import type { ExternalCliSession, RoutineView, SessionRecord } from '../../lib/perigee-api'
import { routineDotState } from '../../lib/routines'
import { dedupeCliSessions, findResumedSession } from '../../state/session-dedupe'
import { cliArchiveKey, isArchived } from '../../state/archived-sessions'
import { useT } from '../../i18n'
import { Button, EmptyState, Icon } from '../ui'
import { SessionRow } from './SessionRow'
import { CliRow } from './CliRow'
import { GroupHeader } from './GroupHeader'
import { sessionRowLooksActive } from './session-row-active'
import { sessionCanCancel } from '../../state/composer-actions'

/** 用户名：从工作区绝对路径 /Users/<name>/ 推导（无用户名 API，这是唯一真实来源；取不到回退 null） */
function usernameOf(workspace: string | null): string | null {
  const m = workspace?.match(/^\/Users\/([^/]+)/)
  return m ? m[1]! : null
}

/**
 * 侧栏（T016 重设计，对齐 claude-design 原型 §5）：**导航不是仪表盘**。
 * 结构：46px 红绿灯拖拽区 → 顶部导航（+ 新建 / Routines / MCP / Skills，计数接真值）→
 * 搜索钮（唤起 ⌘K 命令面板）→ 分组区（可建/可折叠/拖拽归组，空组虚线占位）→ 未分组 →
 * 底部头像+用户名整块点开设置。
 * 会话行只剩状态点 + 名字（副行 / ⌘1-9 角标 / CLI 徽标全删，hover 管理动作保留，见 T016 回执）。
 */
export function Sidebar({
  wb,
  features,
  onGoHome,
  onSelectSession,
  routines,
  activeRoutineId,
  routinesActive,
  onOpenRoutines
}: {
  wb: Workbench
  features: BridgeFeatures
  onGoHome: () => void
  onSelectSession: (id: string) => void
  /** T019：Routines 真实列表（桥未就绪时为空数组，整块入口隐藏） */
  routines: RoutineView[]
  activeRoutineId: string | null
  routinesActive: boolean
  onOpenRoutines: (id?: string | null) => void
}): JSX.Element {
  const t = useT()
  const [routineGroupOpen, setRoutineGroupOpen] = useState(true)
  /* T026：归档表由 wb 总线持有（设置「已归档」子页同源消费） */
  const archived = wb.archived
  const [groupsState, setGroupsState] = useState<SidebarGroupsState>(EMPTY_GROUPS)
  const [namingGroup, setNamingGroup] = useState(false)
  const [cliItems, setCliItems] = useState<ExternalCliSession[]>([])
  /** 恢复成功后 bump：立刻重拉 CLI 列表，被恢复的那条当场消失 */
  const [cliTick, setCliTick] = useState(0)
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [mcpCount, setMcpCount] = useState<number | null>(null)
  const [skillCount, setSkillCount] = useState<number | null>(null)

  /* 分组：挂载时载入（uiState 桶 / localStorage 降级，坏数据回退空态） */
  useEffect(() => {
    let alive = true
    void loadGroups(features.uiState).then((st) => {
      if (alive) setGroupsState(st)
    })
    return () => {
      alive = false
    }
  }, [features.uiState])

  /* 每次变更即持久化（updater 在 StrictMode 下可能双跑，save 幂等无害） */
  const mutateGroups = (fn: (prev: SidebarGroupsState) => SidebarGroupsState) => {
    setGroupsState((prev) => {
      const next = fn(prev)
      void saveGroups(next, features.uiState)
      return next
    })
  }

  /* CLI 历史会话枚举（桥未就绪/无工作区 → 不渲染，无占位） */
  useEffect(() => {
    if (!features.cliSessions || !wb.currentWorkspace) {
      setCliItems([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const list = await window.perigee.session.listExternal({ limit: 12 })
        if (alive && Array.isArray(list)) setCliItems(list)
      } catch {
        /* 桥半就绪：列表留空，不炸 UI */
      }
    })()
    return () => {
      alive = false
    }
  }, [features.cliSessions, wb.currentWorkspace, cliTick, wb.cliRosterEpoch])

  /* 导航计数真值：MCP = 已启用连接器数；Skills = skills 数组长度（缺省 → 整项隐藏，不摆假数字） */
  useEffect(() => {
    let alive = true
    void window.perigee.integrations
      .status()
      .then((s) => {
        if (!alive) return
        setMcpCount(s.mcp.filter((m) => m.enabled).length)
        setSkillCount(Array.isArray(s.skills) ? s.skills.length : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [wb.integrationsEpoch])

  const engineMode = wb.settings?.engineMode ?? 'acp'
  const resumable = features.resumeExternal && engineMode === 'acp'

  /* 恢复 CLI 会话：成功 → 刷新列表并选中（沿用 T005 语义）。
     T025-返修：先看这条 CLI 会话是不是已经恢复进来过——是就直接切过去，
     不再新建一条指向同一 engineSessionId 的重复 Desktop 记录（真机上同一条被恢复了 4 次）。 */
  const resume = async (it: ExternalCliSession) => {
    if (!resumable || resumingId) return
    const already = findResumedSession(wb.sessions, it.id)
    if (already) {
      onSelectSession(already.id)
      setCliTick((v) => v + 1)
      return
    }
    setResumingId(it.id)
    try {
      const res = await window.perigee.session.resumeExternal(it.id)
      if (res.ok && res.session) {
        await wb.refreshSessions()
        setCliTick((v) => v + 1) // CLI 列表重拉：这条已被 Desktop 会话代表，随即从外部列表消失
        onSelectSession(res.session.id)
      } else {
        wb.setError(
          `恢复 CLI 会话失败：${res.reason ?? res.detail ?? '未知原因'}${res.detail && res.reason ? `（${res.detail}）` : ''}`
        )
      }
    } catch (e) {
      wb.setError(`恢复 CLI 会话失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setResumingId(null)
    }
  }

  /* 统一扁平序（recency 倒序，side 会话不进列表） */
  const orderedAll = useMemo(() => orderSessions(wb.sessions), [wb.sessions])

  /* T025：归档的会话从主列表里撤走，只在底部「已归档」区出现 */
  const ordered = useMemo(
    () => orderedAll.filter((s) => !isArchived(archived, s.id)),
    [orderedAll, archived]
  )

  /* 组 → 组内会话（保持 recency 序；指向已删会话的 assign 自然落空） */
  const groupItems = useMemo(() => {
    const m = new Map<string, SessionRecord[]>()
    for (const g of groupsState.groups) m.set(g.id, [])
    for (const s of ordered) {
      const gid = groupsState.assign[s.id]
      if (gid && m.has(gid)) m.get(gid)?.push(s)
    }
    return m
  }, [ordered, groupsState])

  /* T025-返修 2：已被恢复成 Desktop 的 CLI 不重复列；用户已删的 cliId 墓碑防回魂 */
  const dedupedCli = useMemo(
    () => dedupeCliSessions(cliItems, wb.sessions, wb.forgottenCliIds),
    [cliItems, wb.sessions, wb.forgottenCliIds]
  )
  /* T025-返修 3：CLI 也能归档 —— 主列表只留未归档的 */
  const visibleCliItems = useMemo(
    () => dedupedCli.filter((c) => !isArchived(archived, cliArchiveKey(c.id))),
    [dedupedCli, archived]
  )

  /* 未分组混排：Desktop 未归组 + CLI，统一「最近活动降序」口径（state/session-order） */
  const ungroupedRows = useMemo<SidebarEntry[]>(
    () =>
      mixEntries(
        ordered.filter((s) => !groupsState.assign[s.id]),
        visibleCliItems
      ),
    [ordered, visibleCliItems, groupsState.assign]
  )

  const hasAny = orderedAll.length > 0 || visibleCliItems.length > 0

  /* workbench.exportSession 只导出活动会话：行内导出 = 先切再导（沿用旧行为） */
  const exportOne = (id: string) => {
    wb.setActiveSession(id)
    void wb.exportSession()
  }

  const commitNewGroup = (raw: string) => {
    const v = raw.trim()
    if (v) mutateGroups((prev) => createGroup(prev, v).next)
    setNamingGroup(false)
  }

  const renderCliRow = (c: ExternalCliSession) => (
    <CliRow
      key={`c:${c.id}`}
      item={c}
      resumable={resumable}
      resuming={resumingId === c.id}
      anyResuming={resumingId !== null}
      onResume={(it) => void resume(it)}
      archived={isArchived(archived, cliArchiveKey(c.id))}
      onArchive={() => wb.archiveItem(cliArchiveKey(c.id))}
      onUnarchive={() => wb.unarchiveItem(cliArchiveKey(c.id))}
      onDelete={() => removeCli(c.id)}
    />
  )

  /* T030：物理删除 CLI —— 眼下立刻消失（墓碑 + 本地滤掉），IPC 失败也不插回 */
  const removeCli = (cliId: string) => {
    wb.forgetCliId(cliId)
    setCliItems((prev) => prev.filter((c) => c.id !== cliId))
    wb.unarchiveItem(cliArchiveKey(cliId))
    void window.perigee.session
      .removeExternal(cliId)
      .then((r) => {
        if (!r.ok) {
          wb.setError(`${t('删除失败')}：${'detail' in r ? (r.detail ?? r.reason) : r.reason}`)
          // 仍保持墓碑隐藏；可选重拉
          setCliTick((v) => v + 1)
          return
        }
        setCliTick((v) => v + 1)
      })
      .catch((e: unknown) => {
        wb.setError(`${t('删除失败')}：${e instanceof Error ? e.message : String(e)}`)
      })
  }

  /* T025：⋮ 菜单要的能力全从这里注入（分组 / 归档 / 已读 / 删除 / 导出 / worktree） */
  const markRead = (id: string) => {
    if (!features.readTracking) return
    void window.perigee.session
      .markRead(id)
      .then(() => wb.refreshSessions())
      .catch(() => {})
  }

  const renderSessionRow = (s: SessionRecord) => (
    <SessionRow
      key={`s:${s.id}`}
      session={s}
      /* Routines 总览打开时主栏不是对话：勿再高亮会话行，避免「侧栏会话已选 + 主栏 Routines」双焦点 */
      active={sessionRowLooksActive(s.id, wb.activeSessionId, routinesActive)}
      onSelect={onSelectSession}
      onRename={wb.renameSession}
      onExport={exportOne}
      onRemove={(id) => void wb.removeSession(id)}
      onRefresh={() => void wb.refreshSessions()}
      groups={groupsState.groups}
      groupId={groupsState.assign[s.id] ?? null}
      onAssignGroup={(gid) => mutateGroups((prev) => assignSession(prev, s.id, gid))}
      archived={isArchived(archived, s.id)}
      onArchive={() => wb.archiveItem(s.id)}
      onUnarchive={() => wb.unarchiveItem(s.id)}
      canMarkRead={features.readTracking}
      onMarkRead={() => markRead(s.id)}
      preview={wb.lastActivity.get(s.id)}
      canCancel={sessionCanCancel(s.status)}
      onCancel={() => void wb.cancel(s.id)}
    />
  )

  const username = usernameOf(wb.currentWorkspace)

  /* Routines 状态点的「运行中」判定：拿真实会话状态说话，不猜 */
  const isSessionRunning = (sessionId: string): boolean => {
    const s = wb.sessions.find((x) => x.id === sessionId)
    if (!s) return false
    return s.attention === 'working' || s.status === 'streaming' || s.status === 'tool_running'
  }

  const modKey = wb.appInfo?.platform === 'win32' || wb.appInfo?.platform === 'linux' ? 'Ctrl+' : '⌘'

  return (
    <aside className="sidebar">
      {/*
        T024：侧栏顶 46px 分段拖拽，与壳层 .sb-toggle（left:76）零重叠。
        整条 .sb-drag.drag 会在原生层盖住开关；收起 width:0 时布局盒仍可能贡献 drag 矩形。
      */}
      <div className="sb-drag">
        <div className="sb-drag-lights drag" aria-hidden />
        <div className="sb-drag-safe" aria-hidden />
        <div className="sb-drag-rest drag" aria-hidden />
      </div>

      {/* 顶部导航：+ 新建 / MCP / Skills（Routines 藏 T019 flag 后）；计数接真值 */}
      <nav className="sb-nav">
        <button type="button" className="sb-nav-item" onClick={onGoHome}>
          <Icon name="plus" size={14} className="sb-nav-icon" />
          <span>{t('新建')}</span>
          <kbd className="sb-kbd">{modKey}N</kbd>
        </button>
        {features.routines ? (
          <button
            type="button"
            className={`sb-nav-item${routinesActive ? ' is-active' : ''}`}
            onClick={() => onOpenRoutines(null)}
          >
            <Icon name="zap" size={14} className="sb-nav-icon" />
            <span>Routines</span>
            <span className="sb-count">{routines.length}</span>
          </button>
        ) : null}
        {/* T025 导航直达：MCP / Skills 深链到设置对应页，不再落默认「通用」 */}
        {mcpCount != null ? (
          <button type="button" className="sb-nav-item" onClick={() => wb.openSettingsAt('mcp')}>
            <Icon name="plug" size={14} className="sb-nav-icon" />
            <span>MCP</span>
            <span className="sb-count">{mcpCount}</span>
          </button>
        ) : null}
        {skillCount != null ? (
          <button
            type="button"
            className="sb-nav-item"
            onClick={() => wb.openSettingsAt('skills')}
          >
            <Icon name="spark" size={14} className="sb-nav-icon" />
            <span>Skills</span>
            <span className="sb-count">{skillCount}</span>
          </button>
        ) : null}
      </nav>

      {/* 搜索钮：唤起 ⌘K 命令面板（统一入口，侧栏不再自带过滤框） */}
      <div className="sb-search">
        <button
          type="button"
          className="sb-search-btn"
          onClick={() => wb.setPaletteOpen(true)}
          /* 窄侧栏放不下完整能力句；短占位 + tip 说清是命令/会话/文件全搜（C2 曾误写「仅会话」） */
          data-tip={`${t('搜索命令、会话、文件…')} · ${modKey}K`}
          aria-label={t('搜索命令、会话、文件…')}
        >
          <Icon name="search" size={13} />
          <span className="sb-search-ph">{t('搜索…')}</span>
          <kbd className="sb-kbd">{modKey}K</kbd>
        </button>
      </div>

      <div className="sb-scroll">
        {/* Routines 组置顶：名字 + 状态点（运行中灰闪 / 最近一次失败红 / 正常暗灰） */}
        {features.routines && routines.length > 0 ? (
          <>
            <button
              type="button"
              className={`sb-group-head${routineGroupOpen ? '' : ' is-collapsed'}`}
              aria-expanded={routineGroupOpen}
              onClick={() => setRoutineGroupOpen((v) => !v)}
            >
              <span className="gh-name">Routines</span>
              <Icon name="chevron" size={11} className="gh-chevron" />
              <span className="gh-count">{routines.length}</span>
            </button>
            {routineGroupOpen
              ? routines.map((r) => {
                  const state = routineDotState(r, isSessionRunning)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`sb-routine-row${activeRoutineId === r.id ? ' is-active' : ''}`}
                      title={r.name}
                      onClick={() => onOpenRoutines(r.id)}
                    >
                      <span className={`sb-routine-dot is-${state}`} />
                      <span className="sb-routine-name">{r.name}</span>
                    </button>
                  )
                })
              : null}
          </>
        ) : null}
        {!wb.currentWorkspace ? (
          <EmptyState
            icon="folder"
            title={t('打开一个工作区')}
            sub={t('会话归属于工作区。打开文件夹后即可创建会话，可并行多个。')}
          >
            <Button variant="primary" icon="folder" onClick={() => void wb.openFolder()}>
              {t('打开文件夹…')}
            </Button>
          </EmptyState>
        ) : !hasAny ? (
          <EmptyState
            icon="message"
            title={t('还没有会话')}
            sub={t(
              modKey === '⌘'
                ? '点「新建」或按 ⌘N 开始第一个会话。'
                : '点「新建」或按 Ctrl+N 开始第一个会话。'
            )}
          />
        ) : (
          <>
            {/* T026：分组区不再有表头与横线，右上角只留一个安静的 +（新建分组） */}
            <div className="sb-groups-bar">
              <button
                type="button"
                className="sb-sec-plus"
                data-tip={t('新建分组')}
                aria-label={t('新建分组')}
                onClick={() => setNamingGroup(true)}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>
            {/* 新建分组：点击行内命名（Enter 建组 / Esc 取消） */}
            {namingGroup ? (
              <div className="sb-naming">
                <input
                  className="input"
                  autoFocus
                  placeholder={t('分组名称，↵ 创建')}
                  aria-label={t('分组名称，↵ 创建')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      commitNewGroup(e.currentTarget.value)
                    } else if (e.key === 'Escape') {
                      e.stopPropagation()
                      setNamingGroup(false)
                    }
                  }}
                  onBlur={(e) => commitNewGroup(e.currentTarget.value)}
                />
              </div>
            ) : null}

            {/* 自定义分组（可折叠/拖拽归组；空组虚线占位「把会话拖到这里」） */}
            {groupsState.groups.map((g) => {
              const items = groupItems.get(g.id) ?? []
              return (
                <div key={g.id}>
                  <GroupHeader
                    name={g.name}
                    count={items.length}
                    collapsed={g.collapsed}
                    manageable
                    onToggle={() => mutateGroups((prev) => toggleCollapsed(prev, g.id))}
                    onRename={(name) => mutateGroups((prev) => renameGroup(prev, g.id, name))}
                    onDelete={() => mutateGroups((prev) => deleteGroup(prev, g.id))}
                    onDropSession={(sid) => mutateGroups((prev) => assignSession(prev, sid, g.id))}
                  />
                  {!g.collapsed ? (
                    <>
                      {items.map(renderSessionRow)}
                      {items.length === 0 ? (
                        <div
                          className="sb-empty-group"
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const id = e.dataTransfer.getData('text/session-id')
                            if (id) mutateGroups((prev) => assignSession(prev, id, g.id))
                          }}
                        >
                          {t('把会话拖到这里')}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}

            {/* T026：「未分组」= 不可删除的默认分组——与自定义组完全同构，固定排在最后 */}
            <GroupHeader
              name={t('未分组')}
              count={ungroupedRows.length}
              collapsed={groupsState.ungroupedCollapsed === true}
              manageable={false}
              onToggle={() => mutateGroups(toggleUngroupedCollapsed)}
              onDropSession={(sid) => mutateGroups((prev) => assignSession(prev, sid, null))}
            />
            {groupsState.ungroupedCollapsed !== true
              ? ungroupedRows.map((row) =>
                  row.kind === 's' ? renderSessionRow(row.session) : renderCliRow(row.cli)
                )
              : null}
          </>
        )}

      </div>

      {/* 底部：头像 + 用户名，整块可点打开设置 */}
      <div className="sb-foot">
        <button
          type="button"
          className="sb-user"
          data-tip={t('账户与设置')}
          onClick={() => wb.setSettingsOpen(true)}
        >
          <span className="sb-avatar">{username ? username[0]!.toUpperCase() : 'G'}</span>
          <span className="sb-username">{username ?? t('设置')}</span>
        </button>
      </div>
    </aside>
  )
}
