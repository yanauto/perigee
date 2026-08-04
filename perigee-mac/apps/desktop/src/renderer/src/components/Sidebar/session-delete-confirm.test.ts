import { describe, expect, it } from 'vitest'
import {
  resolveSessionDeleteClick,
  SESSION_DELETE_CONFIRM_MS
} from './session-delete-confirm'

describe('resolveSessionDeleteClick（会话删除两步确认）', () => {
  it('未武装：第一次点击只武装，不提交', () => {
    expect(resolveSessionDeleteClick(false)).toEqual({ arm: true, commit: false })
  })

  it('已武装：第二次点击提交删除并解除武装', () => {
    expect(resolveSessionDeleteClick(true)).toEqual({ arm: false, commit: true })
  })

  it('确认窗不少于 6s（防回落过快被当成「点了没反应」）', () => {
    expect(SESSION_DELETE_CONFIRM_MS).toBeGreaterThanOrEqual(6000)
  })
})
