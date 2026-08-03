/**
 * 会话行 ⋮ 菜单的定位算术（T025-返修：侧栏最下面的行点开菜单被底部裁掉）。
 *
 * 两件事：
 * 1) 菜单改用 fixed 定位（`.sb-scroll` 有 overflow-y:auto，absolute 子元素会被裁），
 *    DOM 节点仍留在原处 —— data-pop 统一弹层机制靠 `closest('[data-pop]')` 判定，不受定位方式影响。
 * 2) 下方空间不够就**向上翻转**，翻转态菜单**底缘对齐按钮上缘**。
 *
 * 本函数是纯计算：输入锚点矩形 + 视口尺寸 + 菜单自然高（scrollHeight，与 maxHeight 无关），
 * 输出 fixed 坐标与 maxHeight —— 输入不含自己产生的量，不存在测量-写回反馈环（T023 教训）。
 */

/** 菜单与按钮之间的缝 */
export const MENU_GAP = 4
/** 与视口边缘的安全距离 */
export const VIEWPORT_MARGIN = 8
/** 两侧都逼仄时也要留出的可读高度（内部自己滚动） */
export const MIN_MENU_H = 120

export type AnchorRect = { top: number; bottom: number; right: number }

export type MenuPlacement = {
  /** 展开方向：down = 按钮下方；up = 翻转到按钮上方 */
  dir: 'down' | 'up'
  /** fixed top（px） */
  top: number
  /** fixed right（距视口右缘，px） */
  right: number
  /** 最大高度，超出由菜单自身滚动 */
  maxHeight: number
}

/**
 * @param anchor 触发按钮的视口坐标（getBoundingClientRect）
 * @param viewportW/viewportH 视口尺寸
 * @param menuH 菜单自然高（内容高，不是被 maxHeight 夹过的高）
 */
export function placeRowMenu(
  anchor: AnchorRect,
  viewportW: number,
  viewportH: number,
  menuH: number
): MenuPlacement {
  const right = Math.max(VIEWPORT_MARGIN, viewportW - anchor.right)
  const spaceBelow = viewportH - anchor.bottom - MENU_GAP - VIEWPORT_MARGIN
  const spaceAbove = anchor.top - MENU_GAP - VIEWPORT_MARGIN
  const wanted = Math.max(0, menuH)

  /* 下方放得下：默认向下 */
  if (wanted <= spaceBelow) {
    return { dir: 'down', top: anchor.bottom + MENU_GAP, right, maxHeight: spaceBelow }
  }
  /* 下方不够、上方够：翻转，底缘贴按钮上缘 */
  if (wanted <= spaceAbove) {
    return { dir: 'up', top: anchor.top - MENU_GAP - wanted, right, maxHeight: spaceAbove }
  }
  /* 两边都不够：取更宽敞的一侧，高度夹到该侧可用空间（菜单内部滚动） */
  if (spaceBelow >= spaceAbove) {
    const maxHeight = Math.max(MIN_MENU_H, spaceBelow)
    return { dir: 'down', top: anchor.bottom + MENU_GAP, right, maxHeight }
  }
  const maxHeight = Math.max(MIN_MENU_H, spaceAbove)
  const top = Math.max(VIEWPORT_MARGIN, anchor.top - MENU_GAP - maxHeight)
  return { dir: 'up', top, right, maxHeight }
}
