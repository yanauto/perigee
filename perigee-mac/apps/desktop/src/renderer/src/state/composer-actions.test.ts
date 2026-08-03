import { describe, expect, it } from 'vitest'
import { canSubmit, composerAction } from './composer-actions'

describe('发送/停止互斥（T026-返修 3）', () => {
  it('空闲显示发送键，流式显示停止键——同一位置只有一个', () => {
    expect(composerAction(false)).toBe('send')
    expect(composerAction(true)).toBe('stop')
  })

  it('两态互斥：busy 的两个取值各自映射到不同按钮，不存在同时出现的第三种状态', () => {
    const actions = [true, false].map(composerAction)
    expect(new Set(actions).size).toBe(2) // 一一对应，绝不并排
    actions.forEach((a) => expect(['send', 'stop']).toContain(a))
  })

  it('跟引擎状态走：轮次结束（busy=false）自动回到发送键，无需手动点停止', () => {
    let busy = false
    expect(composerAction(busy)).toBe('send')
    busy = true // 发出去了
    expect(composerAction(busy)).toBe('stop')
    busy = false // turn.end
    expect(composerAction(busy)).toBe('send')
  })
})

describe('canSubmit：按钮与 Enter 的同一个判据（堵死回车后门）', () => {
  const base = { busy: false, disabled: false, draft: '干活', attachmentCount: 0 }

  it('空闲 + 有草稿 → 可发', () => {
    expect(canSubmit(base)).toBe(true)
  })

  it('流式中一律不可发（Enter 与按钮同时失效）', () => {
    expect(canSubmit({ ...base, busy: true })).toBe(false)
    expect(canSubmit({ ...base, busy: true, attachmentCount: 3 })).toBe(false)
  })

  it('硬性不可用（无工作区/无会话）不可发', () => {
    expect(canSubmit({ ...base, disabled: true })).toBe(false)
  })

  it('空草稿不可发；只有附件也算可发', () => {
    expect(canSubmit({ ...base, draft: '' })).toBe(false)
    expect(canSubmit({ ...base, draft: '   ' })).toBe(false)
    expect(canSubmit({ ...base, draft: '', attachmentCount: 1 })).toBe(true)
  })

  it('流式中允许留着草稿（判据只管能不能发，不清空内容）', () => {
    const gate = { ...base, busy: true, draft: '我在流式中打的字' }
    expect(canSubmit(gate)).toBe(false)
    expect(gate.draft).toBe('我在流式中打的字')
    // 轮次结束后同一份草稿立刻可发
    expect(canSubmit({ ...gate, busy: false })).toBe(true)
  })
})
