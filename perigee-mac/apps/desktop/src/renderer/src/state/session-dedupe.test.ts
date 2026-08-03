import { describe, expect, it } from 'vitest'
import type { ExternalCliSession, SessionRecord } from '../lib/perigee-api'
import { dedupeCliSessions, findResumedSession, resumedCliIds } from './session-dedupe'

const desk = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'ses_1',
  title: '会话',
  workspacePath: '/repo',
  status: 'idle',
  createdAt: '2026-08-02T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
  engineId: 'grok-acp',
  ...over
})

const cli = (id: string, title = 'CLI 会话'): ExternalCliSession => ({
  id,
  title,
  cwd: '/repo',
  createdAt: '2026-08-02T09:00:00.000Z',
  updatedAt: '2026-08-02T09:30:00.000Z',
  summaryPath: `/home/.grok/sessions/x/${id}/summary.json`
})

/** 真机实测的那条：Desktop 记录的 engineSessionId 就是 CLI transcript 的 id */
const CLI_ID = '019fc0cd-dbe8-7512-a76c-036f38372718'
const TITLE = 'Docs 代码地图 文档体系优缺分析'

describe('侧栏跨源去重（T025-返修：同一对话出现两条）', () => {
  it('被恢复过的 CLI 会话不再重复列出（有菜单的 Desktop 行留下，无菜单的 CLI 行撤掉）', () => {
    const sessions = [desk({ id: 'ses_a', title: TITLE, engineSessionId: CLI_ID })]
    const external = [cli(CLI_ID, TITLE), cli('other-uuid', '别的 CLI 会话')]
    const out = dedupeCliSessions(external, sessions)
    expect(out.map((c) => c.id)).toEqual(['other-uuid'])
  })

  it('没被恢复过的纯 CLI 会话必须原样保留（别把整列表滤没了）', () => {
    const external = [cli('a'), cli('b'), cli('c')]
    expect(dedupeCliSessions(external, [desk()])).toHaveLength(3)
    expect(dedupeCliSessions(external, [])).toHaveLength(3)
  })

  it('同一个 CLI 会话被恢复多次（真机就有 4 条）也只滤掉那一条外部条目', () => {
    const sessions = [
      desk({ id: 'ses_a', engineSessionId: CLI_ID }),
      desk({ id: 'ses_b', engineSessionId: CLI_ID }),
      desk({ id: 'ses_c', engineSessionId: CLI_ID })
    ]
    expect(dedupeCliSessions([cli(CLI_ID), cli('keep')], sessions).map((c) => c.id)).toEqual([
      'keep'
    ])
  })

  it('resumedCliIds 只收集有 engineSessionId 的会话', () => {
    const ids = resumedCliIds([desk({ id: 's1' }), desk({ id: 's2', engineSessionId: CLI_ID })])
    expect([...ids]).toEqual([CLI_ID])
  })

  it('findResumedSession：已恢复过就给出那条会话（多条取最近活动的）', () => {
    const older = desk({ id: 'ses_old', engineSessionId: CLI_ID, lastActivityAt: 1 })
    const newer = desk({ id: 'ses_new', engineSessionId: CLI_ID, lastActivityAt: 999 })
    expect(findResumedSession([older, newer], CLI_ID)?.id).toBe('ses_new')
    expect(findResumedSession([older, newer], 'nope')).toBeNull()
    expect(findResumedSession([], CLI_ID)).toBeNull()
    expect(findResumedSession([older], '')).toBeNull()
  })

  it('无 lastActivityAt 时回落 updatedAt 比较，不炸', () => {
    const a = desk({ id: 'a', engineSessionId: CLI_ID, updatedAt: '2026-08-01T00:00:00.000Z' })
    const b = desk({ id: 'b', engineSessionId: CLI_ID, updatedAt: '2026-08-03T00:00:00.000Z' })
    expect(findResumedSession([a, b], CLI_ID)?.id).toBe('b')
  })
})
