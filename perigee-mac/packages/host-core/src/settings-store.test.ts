import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_SETTINGS, SettingsStore, type AppSettings } from './settings-store.js'

describe('SettingsStore · CCD 对齐默认与权限同步', () => {
  let dir: string
  let store: SettingsStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gd-settings-'))
    store = new SettingsStore(join(dir, 'settings.json'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('默认引擎 ACP、权限 ask（对齐 Claude Code Desktop Manual）', () => {
    const s = store.load()
    expect(s.engineMode).toBe('acp')
    expect(s.permissionPolicy).toBe('ask')
    expect(s.alwaysApproveTools).toBe(false)
    // 与导出常量一致
    expect(DEFAULT_SETTINGS.permissionPolicy).toBe('ask')
    expect(DEFAULT_SETTINGS.alwaysApproveTools).toBe(false)
  })

  it('update permissionPolicy=yolo 时同步 alwaysApproveTools=true', () => {
    const next = store.update({ permissionPolicy: 'yolo' })
    expect(next.permissionPolicy).toBe('yolo')
    expect(next.alwaysApproveTools).toBe(true)
    expect(store.load().alwaysApproveTools).toBe(true)
  })

  it('accept_edits / plan 可持久化且 alwaysApprove 不为 true', () => {
    expect(store.update({ permissionPolicy: 'accept_edits' }).alwaysApproveTools).toBe(false)
    expect(store.update({ permissionPolicy: 'plan' }).permissionPolicy).toBe('plan')
  })

  it('update alwaysApproveTools=false 时反推 permissionPolicy=ask', () => {
    store.update({ permissionPolicy: 'yolo' })
    const next = store.update({ alwaysApproveTools: false })
    expect(next.permissionPolicy).toBe('ask')
    expect(next.alwaysApproveTools).toBe(false)
  })

  it('旧配置仅有 alwaysApproveTools=true 时 load 归一为 yolo', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ alwaysApproveTools: true, engineMode: 'acp' }),
      'utf8'
    )
    const s = store.load()
    expect(s.permissionPolicy).toBe('yolo')
    expect(s.alwaysApproveTools).toBe(true)
  })

  it('旧 layout 无 panes 时合并默认；contextWidth 迁移 filePaneWidth', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ layout: { railWidth: 300, contextWidth: 500, mainPane: 'chat' } }),
      'utf8'
    )
    const s = store.load()
    expect(s.layout.railWidth).toBe(300)
    expect(s.layout.filePaneWidth).toBe(500)
    expect(s.layout.panes).toEqual({ file: false, terminal: false, inspector: true })
    expect(s.layout.terminalHeight).toBe(DEFAULT_SETTINGS.layout.terminalHeight)
  })

  it('update layout.panes 浅合并不丢其它 pane 字段', () => {
    store.update({ layout: { panes: { file: true } } })
    const s = store.load()
    expect(s.layout.panes.file).toBe(true)
    expect(s.layout.panes.terminal).toBe(false)
    expect(s.layout.panes.inspector).toBe(true)

    store.update({ layout: { panes: { terminal: true } } })
    const s2 = store.load()
    expect(s2.layout.panes.file).toBe(true)
    expect(s2.layout.panes.terminal).toBe(true)
    expect(s2.layout.panes.inspector).toBe(true)
  })
})
