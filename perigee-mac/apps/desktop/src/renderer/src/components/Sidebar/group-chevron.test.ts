import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 组头箭头方向契约（T026-返修 3）。
 *
 * 上一轮我声称「沿用既有旋转规则」，真机却是收起朝上 `^` —— 根因是 global.css 里存在**两块**
 * `.sb-group-head` 样式（T009/T010 遗留那块在文件更后面、同特异度），把现行块整片盖掉，
 * 其中 `.is-collapsed .gh-chevron { rotate: -90deg }` 就是那个 `^`。
 *
 * 所以这里把三件事钉成机器可验的契约：
 * ① 基础图标本身朝右（从 path 的几何算出来，不靠嘴说）；
 * ② 收起 = rotate 0（→ `›`）、展开 = rotate 90（→ `ˇ`），且**全文件只有这一对规则**；
 * ③ `.sb-group-head` 规则块**只此一处**（重复块是这次翻车的真凶，不许再出现）。
 */

const SRC = join(__dirname, '..', '..')
const css = readFileSync(join(SRC, 'styles/global.css'), 'utf8')
const iconSrc = readFileSync(join(SRC, 'components/ui/Icon.tsx'), 'utf8')

describe('基础 chevron 图标的原始朝向', () => {
  it('path 几何证明它指向右（顶点在右、两臂在左）', () => {
    const m = iconSrc.match(/chevron: <path d="M([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)l-([\d.]+) ([\d.]+)"/)
    expect(m, '没找到 chevron 的 path 定义').toBeTruthy()
    const [x0, y0, vx, vy, dx] = [
      Number(m![1]),
      Number(m![2]),
      Number(m![3]),
      Number(m![4]),
      Number(m![5])
    ]
    const x1 = vx - dx // 第二臂终点 x（l 是相对位移，-dx 表示往左回）
    // 顶点 x 大于两个端点 x ⇒ 尖端朝右
    expect(vx).toBeGreaterThan(x0)
    expect(vx).toBeGreaterThan(x1)
    // 两臂在垂直方向分居顶点上下 ⇒ 是个 `›` 而不是 `^` / `ˇ`
    expect(y0).toBeLessThan(vy)
  })
})

describe('三态旋转规则（收起 › / 展开 ˇ）', () => {
  const collapsedRules = [...css.matchAll(/\.sb-group-head\.is-collapsed \.gh-chevron \{([^}]*)\}/g)]
  const expandedRules = [
    ...css.matchAll(/\.sb-group-head:not\(\.is-collapsed\) \.gh-chevron \{([^}]*)\}/g)
  ]

  it('收起态：唯一一条规则，且 rotate: 0deg（图标保持朝右 ›）', () => {
    expect(collapsedRules).toHaveLength(1)
    expect(collapsedRules[0]![1]).toContain('rotate: 0deg')
  })

  it('展开态：唯一一条规则，且 rotate: 90deg（朝右顺时针 90° = 朝下 ˇ）', () => {
    expect(expandedRules).toHaveLength(1)
    expect(expandedRules[0]![1]).toContain('rotate: 90deg')
  })

  it('全文件不再有把箭头转成朝上的 -90deg（那正是真机看到的 ^）', () => {
    const idx = css.indexOf('.gh-chevron')
    expect(idx).toBeGreaterThan(-1)
    for (const m of css.matchAll(/\.gh-chevron[^{]*\{([^}]*)\}/g)) {
      expect(m[1]).not.toContain('-90deg')
      expect(m[1]).not.toContain('180deg')
    }
  })

  it('`.sb-group-head` 规则块只此一处（重复块会同特异度覆盖，是本次翻车真凶）', () => {
    const blocks = [...css.matchAll(/^\.sb-group-head \{/gm)]
    expect(blocks).toHaveLength(1)
  })
})
