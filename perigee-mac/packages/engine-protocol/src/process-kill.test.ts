import { describe, expect, it, vi } from 'vitest'
import { killProcessTree } from './process-kill.js'

describe('killProcessTree', () => {
  it('pid 缺失时 no-op', () => {
    expect(() => killProcessTree({})).not.toThrow()
    expect(() => killProcessTree({ pid: 0 })).not.toThrow()
  })

  it('非 win 走 process.kill 负 pid 或 fallback kill', () => {
    if (process.platform === 'win32') return
    const kill = vi.fn()
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('no group')
    })
    killProcessTree({ pid: 424242, kill }, 'SIGTERM')
    expect(kill).toHaveBeenCalled()
    spy.mockRestore()
  })
})
