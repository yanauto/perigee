import { describe, expect, it } from 'vitest'
import { EN } from './en'

/** T013 i18n：英文表完整性（机制 = 查表命中，缺串回退中文由 t() 保证） */
describe('i18n EN 文案表', () => {
  it('无空值；含中文的条目必须译出（无键值相同的漏译）', () => {
    for (const [k, v] of Object.entries(EN)) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
      // 纯数字/日期类条目（如 '7/30 21:30'）英文同款属正常，只看含中文的
      if (/[一-鿿]/.test(k)) expect(v).not.toBe(k)
    }
  })

  it('原型关键条目已移植', () => {
    expect(EN['询问']).toBe('Ask')
    expect(EN['放行']).toBe('Bypass')
    expect(EN['设置']).toBe('Settings')
    expect(EN['浅色']).toBe('Light')
    expect(EN['深色']).toBe('Dark')
  })

  it('产品增量条目在位（地基组件文案）', () => {
    expect(EN['跟随系统']).toBe('System')
    expect(EN['界面语言']).toBe('Interface language')
    expect(EN['连接器 MCP']).toBe('Connectors (MCP)')
  })
})
