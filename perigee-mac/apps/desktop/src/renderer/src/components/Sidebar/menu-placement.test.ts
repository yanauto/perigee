import { describe, expect, it } from 'vitest'
import {
  MENU_GAP,
  MIN_MENU_H,
  VIEWPORT_MARGIN,
  placeRowMenu,
  type AnchorRect
} from './menu-placement'

/** 视口 1440×900；侧栏行的 ⋮ 大约 20px 高、右缘距视口左侧 250 */
const VW = 1440
const VH = 900
const anchorAt = (top: number): AnchorRect => ({ top, bottom: top + 20, right: 250 })

describe('placeRowMenu（T025-返修：菜单底部裁剪 → 锚点翻转）', () => {
  it('列表顶部：下方空间充足 → 向下展开，贴在按钮下缘', () => {
    const p = placeRowMenu(anchorAt(120), VW, VH, 260)
    expect(p.dir).toBe('down')
    expect(p.top).toBe(140 + MENU_GAP)
  })

  it('侧栏最下面一行：下方不够 → 翻转向上，**菜单底缘对齐按钮上缘**', () => {
    const anchor = anchorAt(830) // bottom=850，离视口底只剩 50
    const menuH = 260
    const p = placeRowMenu(anchor, VW, VH, menuH)
    expect(p.dir).toBe('up')
    expect(p.top + menuH).toBe(anchor.top - MENU_GAP) // 底缘 = 按钮上缘 − 缝
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
  })

  it('翻转后菜单完全在视口内（含「移动到分组」这种更高的子页）', () => {
    for (const menuH of [140, 220, 300, 420]) {
      const anchor = anchorAt(VH - 60)
      const p = placeRowMenu(anchor, VW, VH, menuH)
      const used = Math.min(menuH, p.maxHeight)
      expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
      expect(p.top + used).toBeLessThanOrEqual(VH - VIEWPORT_MARGIN + 1)
    }
  })

  it('上下都放不下：取更宽敞的一侧并夹高度，交给菜单自己滚', () => {
    const middle = placeRowMenu(anchorAt(430), VW, VH, 2000) // 视口中间，两侧都不够
    expect(middle.maxHeight).toBeGreaterThanOrEqual(MIN_MENU_H)
    expect(['up', 'down']).toContain(middle.dir)

    const nearTop = placeRowMenu(anchorAt(60), VW, VH, 2000)
    expect(nearTop.dir).toBe('down') // 上方几乎没空间 → 往下

    const nearBottom = placeRowMenu(anchorAt(VH - 40), VW, VH, 2000)
    expect(nearBottom.dir).toBe('up') // 下方几乎没空间 → 往上
  })

  it('right 按视口右缘算，且不小于安全边距', () => {
    expect(placeRowMenu(anchorAt(200), VW, VH, 200).right).toBe(VW - 250)
    expect(placeRowMenu({ top: 200, bottom: 220, right: VW }, VW, VH, 200).right).toBe(
      VIEWPORT_MARGIN
    )
  })

  it('纯函数：同输入同输出，且输入里没有自己产生的量（无测量-写回环）', () => {
    const a = anchorAt(700)
    const first = placeRowMenu(a, VW, VH, 300)
    expect(placeRowMenu(a, VW, VH, 300)).toEqual(first)
    // 把上一轮的 maxHeight 当作「自然高」再算一次，也不会越界
    const again = placeRowMenu(a, VW, VH, first.maxHeight)
    expect(again.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
  })
})
