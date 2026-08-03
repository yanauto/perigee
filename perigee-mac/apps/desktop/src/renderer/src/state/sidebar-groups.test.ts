import { describe, expect, it } from 'vitest'
import {
  assignSession,
  createGroup,
  deleteGroup,
  EMPTY_GROUPS,
  parseGroups,
  renameGroup,
  toggleCollapsed,
  toggleUngroupedCollapsed,
  type SidebarGroupsState
} from './sidebar-groups'

const base = EMPTY_GROUPS

describe('分组 CRUD', () => {
  it('建组：追加且默认展开', () => {
    const { next, id } = createGroup(base, '项目 A')
    expect(next.groups).toEqual([{ id, name: '项目 A', collapsed: false }])
  })
  it('重命名只影响目标组', () => {
    const { next, id } = createGroup(base, 'A')
    const { next: next2, id: id2 } = createGroup(next, 'B')
    const renamed = renameGroup(next2, id, 'A2')
    expect(renamed.groups.find((g) => g.id === id)?.name).toBe('A2')
    expect(renamed.groups.find((g) => g.id === id2)?.name).toBe('B')
  })
  it('删组：组消失且会话回未分组', () => {
    const { next, id } = createGroup(base, 'A')
    const assigned = assignSession(next, 's1', id)
    const deleted = deleteGroup(assigned, id)
    expect(deleted.groups).toHaveLength(0)
    expect(deleted.assign.s1).toBeUndefined()
  })
  it('折叠往返', () => {
    const { next, id } = createGroup(base, 'A')
    expect(toggleCollapsed(next, id).groups[0].collapsed).toBe(true)
    expect(toggleCollapsed(toggleCollapsed(next, id), id).groups[0].collapsed).toBe(false)
  })
})

describe('assignSession', () => {
  it('归组 / 拖回未分组', () => {
    const { next, id } = createGroup(base, 'A')
    let st: SidebarGroupsState = assignSession(next, 's1', id)
    expect(st.assign.s1).toBe(id)
    st = assignSession(st, 's1', null)
    expect(st.assign.s1).toBeUndefined()
  })
  it('不存在的组视为未分组', () => {
    const st = assignSession(base, 's1', 'ghost')
    expect(st.assign.s1).toBeUndefined()
  })
})

describe('parseGroups', () => {
  it('正常往返', () => {
    const { next, id } = createGroup(base, 'A')
    const st = assignSession(next, 's1', id)
    expect(parseGroups(JSON.parse(JSON.stringify(st)))).toEqual(st)
  })
  it('坏数据回退空态', () => {
    expect(parseGroups(null)).toEqual(EMPTY_GROUPS)
    expect(parseGroups('junk')).toEqual(EMPTY_GROUPS)
    expect(parseGroups({ groups: 'x' })).toEqual(EMPTY_GROUPS)
  })
  it('悬空 assign（组已删）被清理', () => {
    const parsed = parseGroups({ groups: [], assign: { s1: 'gone' } })
    expect(parsed.assign).toEqual({})
  })
  it('collapsed 非 true 一律 false', () => {
    const parsed = parseGroups({ groups: [{ id: 'g1', name: 'A', collapsed: 1 }], assign: {} })
    expect(parsed.groups[0].collapsed).toBe(false)
  })
})

describe('未分组折叠态（T026：未分组 = 不可删除的默认分组）', () => {
  it('缺省展开，可切换，且与自定义分组互不影响', () => {
    expect(EMPTY_GROUPS.ungroupedCollapsed).toBe(false)
    const a = toggleUngroupedCollapsed(EMPTY_GROUPS)
    expect(a.ungroupedCollapsed).toBe(true)
    expect(toggleUngroupedCollapsed(a).ungroupedCollapsed).toBe(false)
    const withGroup = createGroup(a, '实验').next
    expect(withGroup.ungroupedCollapsed).toBe(true)
    expect(withGroup.groups[0]!.collapsed).toBe(false)
  })

  it('反序列化：旧数据（没有该字段）视为展开', () => {
    expect(parseGroups({ groups: [], assign: {} }).ungroupedCollapsed).toBe(false)
    expect(parseGroups({ groups: [], assign: {}, ungroupedCollapsed: true }).ungroupedCollapsed).toBe(
      true
    )
  })
})
