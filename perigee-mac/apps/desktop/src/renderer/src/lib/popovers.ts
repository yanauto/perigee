import { useSyncExternalStore } from 'react'

/**
 * 弹层统一关闭机制（T013；规则移植自 claude-design 原型 §7）：
 * - 文档级捕获监听 + `data-pop` / `data-pop-trigger` 标记，新增弹层只加属性即接入。
 * - 行为钉死：
 *   ① 点弹层外任意处关闭；
 *   ② 点另一触发器 = 关当前 + 开新的（一次点击：捕获相位先关旧的，触发器自身 onClick 开新的）；
 *   ③ Esc 关最上层（吃掉事件，不穿透给全局 keymap 的逐层关闭）；
 *   ④ 遮罩模态点遮罩关（模态沿用各自 overlay onClick，不入栈）。
 * - 弹层开关状态由本 store 持有（usePopover），各组件不再各自为政写关闭逻辑。
 */

let stack: string[] = []
const listeners = new Set<() => void>()

const emit = (): void => {
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function isPopOpen(name: string): boolean {
  return stack.includes(name)
}

export function openPop(name: string): void {
  if (stack.includes(name)) return
  stack = [...stack, name]
  emit()
}

export function closePop(name: string): void {
  if (!stack.includes(name)) return
  stack = stack.filter((n) => n !== name)
  emit()
}

export function togglePop(name: string): void {
  if (isPopOpen(name)) closePop(name)
  else openPop(name)
}

export function closeAllPops(): void {
  if (!stack.length) return
  stack = []
  emit()
}

/** 测试/调试用：当前栈快照（栈底 → 栈顶）。 */
export function popStack(): readonly string[] {
  return stack
}

export interface PopoverHandle {
  open: boolean
  show: () => void
  close: () => void
  toggle: () => void
}

/** 组件接入：const pop = usePopover('perm')，触发器加 data-pop-trigger="perm"，弹层加 data-pop="perm"。 */
export function usePopover(name: string): PopoverHandle {
  const open = useSyncExternalStore(subscribe, () => isPopOpen(name))
  return {
    open,
    show: () => openPop(name),
    close: () => closePop(name),
    toggle: () => togglePop(name)
  }
}

let installed = false

/** 挂载早期调用一次（main.tsx）。 */
export function initPopovers(): void {
  if (installed || typeof document === 'undefined') return
  installed = true

  /* 点外关闭 / 一次点击换弹层（捕获相位，先于各触发器 onClick） */
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!stack.length) return
      const t = e.target as Element | null
      if (t && typeof t.closest === 'function') {
        if (t.closest('[data-pop]')) return
        const trg = t.closest('[data-pop-trigger]')
        if (trg) {
          const name = trg.getAttribute('data-pop-trigger')
          // 点另一触发器：关掉其它（其 onClick 随后开新的）；点当前弹层触发器：交给其 toggle
          const rest = stack.filter((n) => n === name)
          if (rest.length !== stack.length) {
            stack = rest
            emit()
          }
          return
        }
      }
      closeAllPops()
    },
    true
  )

  /* Esc 关最上层；吃掉事件避免穿透触发 App 层叠关闭 */
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !stack.length) return
      e.stopPropagation()
      closePop(stack[stack.length - 1]!)
    },
    true
  )
}
