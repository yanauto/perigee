import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * T026-返修 2 铁律回归：**侧栏任何内容超长都不得引发横向滚动**。
 *
 * 布局本身要真机才量得到，但这条铁律可以拆成几条**机器可验的 CSS/结构契约**：
 * ① 滚动容器显式写死 `overflow-x: hidden`（只写 overflow-y:auto 时，CSS 会把 overflow-x 从
 *    visible 提升为 auto，任何越界元素都会长出横向滚动条）；
 * ② 侧栏里每个可能装用户内容的文本元素都有 `overflow:hidden + text-overflow:ellipsis + nowrap`；
 * ③ 行容器不许被内容撑宽（max-width:100% / min-width:0；组头还必须 width:100%，
 *    因为它是 <button>，默认 shrink-to-fit）；
 * ④ 侧栏内的 CSS tooltip 伪元素有宽度上限，且没有把 tooltip 摆到行外右侧的 `data-tip-pos="right"`。
 */

const SRC = join(__dirname, '..')
const css = readFileSync(join(SRC, 'styles/global.css'), 'utf8')

/** 取某条规则的声明块（第一处匹配即可，重复定义在别处另有守卫） */
function block(selector: string): string {
  const i = css.indexOf(`${selector} {`)
  expect(i, `找不到规则 ${selector}`).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i))
}

describe('侧栏横向溢出铁律（T026-返修 2）', () => {
  it('滚动容器显式禁横向滚动', () => {
    expect(block('.sb-scroll')).toContain('overflow-x: hidden')
    expect(block('.sidebar')).toContain('overflow-x: hidden')
  })

  it('装用户内容的文本元素一律省略号截断', () => {
    for (const sel of [
      '.sb-item .si-title', // 会话行 / CLI 行标题
      '.sb-group-head .gh-name', // 分组名（含未分组）
      '.sb-routine-name', // Routines 行
      '.sb-username', // 底部用户名
      '.sb-search-ph', // 搜索占位
      '.sb-nav-item > span', // 导航项文字
      '.arch-title', // 设置「已归档」页同款行
      '.arch-sub'
    ]) {
      const b = block(sel)
      expect(b, `${sel} 缺 overflow:hidden`).toContain('overflow: hidden')
      expect(b, `${sel} 缺 text-overflow:ellipsis`).toContain('text-overflow: ellipsis')
      expect(b, `${sel} 缺 white-space:nowrap`).toContain('white-space: nowrap')
    }
  })

  it('可伸缩文本容器有 min-width:0（否则 flex 最小内容宽度会把行撑开）', () => {
    for (const sel of ['.sb-item .si-title', '.sb-group-head .gh-name', '.arch-main']) {
      expect(block(sel), `${sel} 缺 min-width:0`).toContain('min-width: 0')
    }
  })

  it('行容器不被内容撑宽；组头是 <button> 必须 width:100%', () => {
    for (const sel of ['.sb-item', '.sb-group-head', '.sb-nav-item']) {
      const b = block(sel)
      expect(b, `${sel} 缺 max-width:100%`).toContain('max-width: 100%')
      expect(b, `${sel} 缺 min-width:0`).toContain('min-width: 0')
    }
    expect(block('.sb-group-head')).toContain('width: 100%')
  })

  it('侧栏内 tooltip 伪元素有宽度上限（它常驻布局，opacity:0 也占位）', () => {
    const i = css.indexOf('.sidebar [data-tip]::after')
    expect(i, '缺侧栏 tooltip 封顶规则').toBeGreaterThan(-1)
    const b = css.slice(i, css.indexOf('}', i))
    expect(b).toContain('max-width')
    expect(b).toContain('white-space: normal')
  })

  it('侧栏组件不再使用 data-tip-pos="right"（整块摆到行外右侧 = 必然溢出）', () => {
    for (const f of ['Sidebar.tsx', 'SessionRow.tsx', 'CliRow.tsx', 'GroupHeader.tsx']) {
      const src = readFileSync(join(SRC, 'components/Sidebar', f), 'utf8')
      expect(src, `${f} 仍有 data-tip-pos="right"`).not.toContain('data-tip-pos="right"')
    }
  })
})
