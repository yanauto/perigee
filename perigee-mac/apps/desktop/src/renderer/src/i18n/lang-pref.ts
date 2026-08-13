export type Lang = 'zh' | 'en'

export const isLang = (v: unknown): v is Lang => v === 'zh' || v === 'en'

export type LangPrefResolution = {
  lang: Lang
  /** 用 localStorage 镜像回写 uiState（治 HMR 后陈旧 uiState 把界面打回中文） */
  writeUi?: Lang
  /** 用 uiState 填 localStorage（跨启动后首屏镜像） */
  writeLs?: Lang
}

/**
 * 语言偏好：本 renderer 生命周期以 localStorage 为准（HMR / 重挂不丢），
 * uiState 是跨进程持久化。两边冲突时 LS 胜出并回写 uiState。
 */
export function resolveLangPref(ls: unknown, ui: unknown): LangPrefResolution {
  if (isLang(ls)) {
    if (ui !== ls) return { lang: ls, writeUi: ls }
    return { lang: ls }
  }
  if (isLang(ui)) return { lang: ui, writeLs: ui }
  return { lang: 'en' }
}
