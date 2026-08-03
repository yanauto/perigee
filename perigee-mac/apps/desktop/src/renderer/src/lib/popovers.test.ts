import { beforeEach, describe, expect, it } from 'vitest'
import {
  closeAllPops,
  closePop,
  isPopOpen,
  openPop,
  popStack,
  togglePop
} from './popovers'

/** T013 弹层统一机制：栈行为的纯逻辑面（DOM 监听归真机验证） */
describe('popovers store', () => {
  beforeEach(() => closeAllPops())

  it('open/close/toggle 基本语义', () => {
    expect(isPopOpen('perm')).toBe(false)
    openPop('perm')
    expect(isPopOpen('perm')).toBe(true)
    openPop('perm') // 幂等
    expect(popStack()).toEqual(['perm'])
    togglePop('perm')
    expect(isPopOpen('perm')).toBe(false)
    togglePop('perm')
    expect(isPopOpen('perm')).toBe(true)
  })

  it('多弹层入栈有序，closePop 只摘指定层', () => {
    openPop('plus')
    openPop('model')
    expect(popStack()).toEqual(['plus', 'model'])
    closePop('plus')
    expect(popStack()).toEqual(['model'])
    expect(isPopOpen('model')).toBe(true)
  })

  it('closeAllPops 清空且空栈调用安全', () => {
    openPop('ws')
    openPop('avatar')
    closeAllPops()
    expect(popStack()).toEqual([])
    closeAllPops()
    expect(popStack()).toEqual([])
  })

  it('关闭不存在层不扰动栈', () => {
    openPop('perm')
    closePop('nope')
    expect(popStack()).toEqual(['perm'])
  })
})
