import { useSyncExternalStore } from 'react'

/**
 * 主题机制（T013）：
 * - 偏好三档：'light' / 'dark' / 'system'（默认跟随系统 prefers-color-scheme）。
 * - 持久化走 uiState('theme.pref')（维护者拍板 2026-08-02）；localStorage 同名 key 仅作
 *   首屏无闪烁镜像（index.html 内联脚本与 initTheme 都读它），真相源是 uiState。
 * - 应用方式：documentElement.dataset.theme = 生效档（'light' | 'dark'），
 *   CSS 侧 :root = 浅色、 [data-theme='dark'] = 深色（与 claude-design 原型同构）。
 * - 旧 settings.theme 不再驱动界面（字段保留在后端契约里，renderer 不读）。
 */

export type ThemePref = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

export const THEME_LS_KEY = 'grok.theme.pref'
export const THEME_UISTATE_KEY = 'theme.pref'

let pref: ThemePref = 'system'
let systemDark =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
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

const isPref = (v: unknown): v is ThemePref => v === 'light' || v === 'dark' || v === 'system'

export function getThemePref(): ThemePref {
  return pref
}

export function getEffectiveTheme(): EffectiveTheme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

function applyToDom(): void {
  document.documentElement.dataset.theme = getEffectiveTheme()
}

/** 挂载早期调用一次：恢复偏好、挂系统外观监听、以 uiState 为准覆盖镜像。 */
export function initTheme(): void {
  try {
    const cached = localStorage.getItem(THEME_LS_KEY)
    if (isPref(cached)) pref = cached
  } catch {
    /* 隐私模式等：只用默认值 */
  }
  applyToDom()

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark = mq.matches
  mq.addEventListener('change', (e) => {
    systemDark = e.matches
    applyToDom()
    emit()
  })

  window.perigee?.uiState
    ?.get(THEME_UISTATE_KEY)
    .then((v) => {
      if (isPref(v) && v !== pref) {
        pref = v
        try {
          localStorage.setItem(THEME_LS_KEY, v)
        } catch {
          /* 静默 */
        }
        applyToDom()
        emit()
      }
    })
    .catch(() => {})
}

export function setThemePref(next: ThemePref): void {
  pref = next
  try {
    localStorage.setItem(THEME_LS_KEY, next)
  } catch {
    /* 静默 */
  }
  applyToDom()
  emit()
  void window.perigee?.uiState?.set(THEME_UISTATE_KEY, next).catch(() => {})
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getThemePref)
}

export function useEffectiveTheme(): EffectiveTheme {
  return useSyncExternalStore(subscribe, getEffectiveTheme)
}

/**
 * accent 换肤机制（T013 落机制，选色 UI 归 T017；移植自原型 applyTheme()）。
 * 设 --accent 后用 color-mix 派生 soft/line/heat-1..4/m1；传 undefined 还原 token 表默认。
 */
export function applyAccent(accent?: string): void {
  const root = document.documentElement
  const KEYS = [
    '--accent',
    '--accent-soft',
    '--accent-line',
    '--heat-4',
    '--heat-3',
    '--heat-2',
    '--heat-1',
    '--m1'
  ]
  if (!accent) {
    KEYS.forEach((k) => root.style.removeProperty(k))
    return
  }
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 13%, transparent)`)
  root.style.setProperty('--accent-line', `color-mix(in srgb, ${accent} 38%, transparent)`)
  root.style.setProperty('--heat-4', accent)
  root.style.setProperty('--heat-3', `color-mix(in srgb, ${accent} 72%, var(--bg-0))`)
  root.style.setProperty('--heat-2', `color-mix(in srgb, ${accent} 46%, var(--bg-0))`)
  root.style.setProperty('--heat-1', `color-mix(in srgb, ${accent} 22%, var(--bg-0))`)
  root.style.setProperty('--m1', accent)
}
