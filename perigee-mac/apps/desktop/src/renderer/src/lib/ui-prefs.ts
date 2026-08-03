import { useSyncExternalStore } from 'react'
import { applyAccent } from './theme'

/**
 * 界面小偏好（T017）：强调色换肤 + 主页用量卡开关。
 * 与主题同一套路数：uiState 为真相源，localStorage 只作首屏镜像（无桥也能记住）。
 * 强调色的实际换肤由 lib/theme.applyAccent 执行（T013 机制），本模块只管「选了哪个 + 记住」。
 */

/** 原型给的 4 个预设色（Perigee.dc.html 的 props.accent.options） */
export const ACCENT_PRESETS = ['#2f6bf0', '#0f9d8f', '#7a5af5', '#d8613c'] as const

/** 未选时的展示态 = 第一个预设（与 token 表浅色 --accent 同值） */
export const DEFAULT_ACCENT = ACCENT_PRESETS[0]

export const ACCENT_LS_KEY = 'grok.accent.pref'
export const ACCENT_UISTATE_KEY = 'accent.pref'
export const USAGE_LS_KEY = 'grok.home.showUsage'
export const USAGE_UISTATE_KEY = 'home.showUsage'

/** 合法强调色：#rrggbb（只认十六进制，防脏数据写进 CSS 变量） */
export function isAccent(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

/** 布尔偏好解析：真值 true/'true'，其余（含缺省）走默认 */
export function coerceBool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return fallback
}

let accent: string | null = null
let showUsage = true
const listeners = new Set<() => void>()

const emit = (): void => {
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const readLs = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const writeLs = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式：只在本次会话生效 */
  }
}

/** 挂载早期调用一次：先用镜像同步生效，再以 uiState 覆盖 */
export function initUiPrefs(): void {
  const cachedAccent = readLs(ACCENT_LS_KEY)
  if (isAccent(cachedAccent)) {
    accent = cachedAccent
    applyAccent(cachedAccent)
  }
  showUsage = coerceBool(readLs(USAGE_LS_KEY), true)

  const ui = window.perigee?.uiState
  if (!ui) return
  void ui
    .get(ACCENT_UISTATE_KEY)
    .then((v) => {
      const next = isAccent(v) ? v : null
      if (next === accent) return
      accent = next
      applyAccent(next ?? undefined)
      emit()
    })
    .catch(() => {})
  void ui
    .get(USAGE_UISTATE_KEY)
    .then((v) => {
      const next = coerceBool(v, showUsage)
      if (next === showUsage) return
      showUsage = next
      emit()
    })
    .catch(() => {})
}

export function setAccent(next: string | null): void {
  accent = isAccent(next) ? next : null
  applyAccent(accent ?? undefined)
  writeLs(ACCENT_LS_KEY, accent ?? '')
  emit()
  void window.perigee?.uiState?.set(ACCENT_UISTATE_KEY, accent).catch(() => {})
}

export function setShowUsageCard(next: boolean): void {
  showUsage = next
  writeLs(USAGE_LS_KEY, String(next))
  emit()
  void window.perigee?.uiState?.set(USAGE_UISTATE_KEY, next).catch(() => {})
}

export function useAccent(): string {
  return useSyncExternalStore(subscribe, () => accent ?? DEFAULT_ACCENT)
}

export function useShowUsageCard(): boolean {
  return useSyncExternalStore(subscribe, () => showUsage)
}
