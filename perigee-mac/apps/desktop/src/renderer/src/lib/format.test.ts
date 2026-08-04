import { describe, expect, it } from 'vitest'
import {
  baseName,
  dirName,
  displayModel,
  formatTokens,
  homeTilde,
  resolveModelLabel
} from './format'

describe('displayModel（T026 模型名去后缀，只动显示层）', () => {
  it('剥掉尾部 -build', () => {
    expect(displayModel('grok-4.5-build')).toBe('grok-4.5')
    expect(displayModel('grok-4-build')).toBe('grok-4')
    expect(displayModel('grok-code-fast-1-build')).toBe('grok-code-fast-1')
  })

  it('大小写不敏感（尾部才算）', () => {
    expect(displayModel('grok-4.5-BUILD')).toBe('grok-4.5')
  })

  it('不在尾部的 build 不动', () => {
    expect(displayModel('grok-build-4.5')).toBe('grok-build-4.5')
    expect(displayModel('build')).toBe('build')
  })

  it('没有后缀的原样返回', () => {
    expect(displayModel('grok-4.5')).toBe('grok-4.5')
    expect(displayModel('gpt-5')).toBe('gpt-5')
  })

  it('空 / null / undefined → 空串（调用处自行兜底文案）', () => {
    expect(displayModel('')).toBe('')
    expect(displayModel('   ')).toBe('')
    expect(displayModel(null)).toBe('')
    expect(displayModel(undefined)).toBe('')
  })

  it('去首尾空白后再判定', () => {
    expect(displayModel('  grok-4.5-build  ')).toBe('grok-4.5')
  })

  it('幂等：显示值再过一次不变', () => {
    expect(displayModel(displayModel('grok-4.5-build'))).toBe('grok-4.5')
  })
})

describe('resolveModelLabel（chip：settings 优先，空则 CLI 默认）', () => {
  it('有 settings.model 时用它（并去 -build）', () => {
    expect(resolveModelLabel('grok-4.5-build', 'other')).toBe('grok-4.5')
    expect(resolveModelLabel('grok-code-fast-1', 'grok-4.5')).toBe('grok-code-fast-1')
  })

  it('settings 空时回退 cliDefault', () => {
    expect(resolveModelLabel('', 'grok-4.5')).toBe('grok-4.5')
    expect(resolveModelLabel(null, 'grok-4.5-build')).toBe('grok-4.5')
    expect(resolveModelLabel(undefined, '  grok-4.5  ')).toBe('grok-4.5')
  })

  it('皆空 → 空串（调用处兜底「默认模型」）', () => {
    expect(resolveModelLabel('', null)).toBe('')
    expect(resolveModelLabel('', undefined)).toBe('')
    expect(resolveModelLabel(null, null)).toBe('')
  })
})

/** 既有格式化函数的回归（本轮改了同一文件，顺手钉住） */
describe('format 既有行为', () => {
  it('formatTokens', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(undefined)).toBe('–')
  })
  it('baseName / dirName / homeTilde', () => {
    expect(baseName('/a/b/c.ts')).toBe('c.ts')
    expect(dirName('/a/b/c.ts')).toBe('a/b')
    expect(homeTilde('~/workspace/x')).toBe('~/workspace/x')
    expect(homeTilde('/opt/x')).toBe('/opt/x')
  })
})
