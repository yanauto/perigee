/**
 * 侧栏自定义分组（T009）：schema 归前端管，持久化走 T008 uiState 桶；
 * 桥未就绪降级 localStorage（同 key 同 schema，桥就绪后自然迁移）。
 * 纯函数便于单测。
 */

export type SidebarGroup = { id: string; name: string; collapsed: boolean }

export type SidebarGroupsState = {
  groups: SidebarGroup[]
  /** sessionId → groupId；未出现的 id 归「未分组」 */
  assign: Record<string, string>
  /** T026：「未分组」= 不可删除的默认分组，它的折叠态也要持久化（缺省展开） */
  ungroupedCollapsed?: boolean
}

export const GROUPS_KEY = 'sidebar.groups.v1'

export const EMPTY_GROUPS: SidebarGroupsState = {
  groups: [],
  assign: {},
  ungroupedCollapsed: false
}

let seq = 0
export function createGroup(
  st: SidebarGroupsState,
  name: string
): { next: SidebarGroupsState; id: string } {
  const id = `g${Date.now().toString(36)}${(seq++).toString(36)}`
  return { next: { ...st, groups: [...st.groups, { id, name, collapsed: false }] }, id }
}

export function renameGroup(
  st: SidebarGroupsState,
  id: string,
  name: string
): SidebarGroupsState {
  return { ...st, groups: st.groups.map((g) => (g.id === id ? { ...g, name } : g)) }
}

/** 删组：组内会话回未分组 */
export function deleteGroup(st: SidebarGroupsState, id: string): SidebarGroupsState {
  const assign = Object.fromEntries(
    Object.entries(st.assign).filter(([, gid]) => gid !== id)
  )
  return { groups: st.groups.filter((g) => g.id !== id), assign }
}

export function toggleCollapsed(st: SidebarGroupsState, id: string): SidebarGroupsState {
  return {
    ...st,
    groups: st.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g))
  }
}

/** T026：默认分组「未分组」的折叠态（无 id，单独存一个布尔） */
export function toggleUngroupedCollapsed(st: SidebarGroupsState): SidebarGroupsState {
  return { ...st, ungroupedCollapsed: !st.ungroupedCollapsed }
}

/** 拖拽归组；groupId 为 null 表示拖回未分组 */
export function assignSession(
  st: SidebarGroupsState,
  sessionId: string,
  groupId: string | null
): SidebarGroupsState {
  const assign = { ...st.assign }
  if (groupId && st.groups.some((g) => g.id === groupId)) assign[sessionId] = groupId
  else delete assign[sessionId]
  return { ...st, assign }
}

/** 反序列化（坏数据安全回退空态） */
export function parseGroups(raw: unknown): SidebarGroupsState {
  if (!raw || typeof raw !== 'object') return EMPTY_GROUPS
  const r = raw as Record<string, unknown>
  const groups = Array.isArray(r.groups)
    ? r.groups
        .filter(
          (g): g is SidebarGroup =>
            !!g &&
            typeof g === 'object' &&
            typeof (g as SidebarGroup).id === 'string' &&
            typeof (g as SidebarGroup).name === 'string'
        )
        .map((g) => ({ id: g.id, name: g.name, collapsed: g.collapsed === true }))
    : []
  const ids = new Set(groups.map((g) => g.id))
  const assign: Record<string, string> = {}
  if (r.assign && typeof r.assign === 'object') {
    for (const [sid, gid] of Object.entries(r.assign as Record<string, unknown>)) {
      if (typeof gid === 'string' && ids.has(gid)) assign[sid] = gid
    }
  }
  return { groups, assign, ungroupedCollapsed: r.ungroupedCollapsed === true }
}

/* ---------- 持久化 ---------- */

export async function loadGroups(uiStateReady: boolean): Promise<SidebarGroupsState> {
  try {
    if (uiStateReady) return parseGroups(await window.perigee.uiState.get(GROUPS_KEY))
    const raw = localStorage.getItem(GROUPS_KEY)
    return parseGroups(raw ? JSON.parse(raw) : null)
  } catch {
    return EMPTY_GROUPS
  }
}

export async function saveGroups(st: SidebarGroupsState, uiStateReady: boolean): Promise<void> {
  try {
    if (uiStateReady) {
      await window.perigee.uiState.set(GROUPS_KEY, st)
      return
    }
    localStorage.setItem(GROUPS_KEY, JSON.stringify(st))
  } catch {
    /* 配额/序列化异常静默 */
  }
}
