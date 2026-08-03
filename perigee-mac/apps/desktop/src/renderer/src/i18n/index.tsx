import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { EN } from './en'

/**
 * i18n 基建（T013）：轻量方案 = Context + 文案表（不引重型库）。
 * - 默认中文；t(中文源串) 英文档查 EN 表，缺串回退中文。
 * - 持久化走 uiState('lang.pref')；localStorage 仅作首屏镜像。切换即时生效：纯 state，
 *   不刷新、不丢会话状态。各页面文案随 T014–T016 接入，T017 扫尾。
 */

export type Lang = 'zh' | 'en'

export const LANG_LS_KEY = 'grok.lang.pref'
export const LANG_UISTATE_KEY = 'lang.pref'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (zh: string) => string
}

const I18nContext = createContext<I18nValue>({
  lang: 'zh',
  setLang: () => {},
  t: (s) => s
})

const isLang = (v: unknown): v is Lang => v === 'zh' || v === 'en'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const v = localStorage.getItem(LANG_LS_KEY)
      return isLang(v) ? v : 'zh'
    } catch {
      return 'zh'
    }
  })

  /* uiState 为真相源，就绪后覆盖镜像 */
  useEffect(() => {
    window.perigee?.uiState
      ?.get(LANG_UISTATE_KEY)
      .then((v) => {
        if (isLang(v)) setLangState(v)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_LS_KEY, l)
    } catch {
      /* 静默 */
    }
    void window.perigee?.uiState?.set(LANG_UISTATE_KEY, l).catch(() => {})
  }, [])

  const t = useCallback((zh: string): string => (lang === 'en' ? (EN[zh] ?? zh) : zh), [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}

export function useT(): (zh: string) => string {
  return useContext(I18nContext).t
}
