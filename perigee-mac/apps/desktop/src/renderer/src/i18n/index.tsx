import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { EN } from './en'
import { isLang, resolveLangPref, type Lang } from './lang-pref'

/**
 * i18n 基建（T013）：轻量方案 = Context + 文案表（不引重型库）。
 * - 默认英文（多数用户）；t(中文源串) 英文档查 EN 表，缺串回退中文源串。
 * - 持久化走 uiState('lang.pref')；localStorage 仅作首屏镜像。切换即时生效：纯 state，
 *   不刷新、不丢会话状态。各页面文案随 T014–T016 接入，T017 扫尾。
 * - HMR / 重挂：本 renderer 的 localStorage 压过陈旧 uiState，避免界面被打回中文。
 */

export type { Lang }

export const LANG_LS_KEY = 'grok.lang.pref'
export const LANG_UISTATE_KEY = 'lang.pref'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (zh: string) => string
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: (s) => s
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const v = localStorage.getItem(LANG_LS_KEY)
      return isLang(v) ? v : 'en'
    } catch {
      return 'en'
    }
  })

  /* uiState 为跨进程真相；HMR 重挂时 localStorage 镜像优先，避免陈旧 ui 把界面打回中文 */
  useEffect(() => {
    window.perigee?.uiState
      ?.get(LANG_UISTATE_KEY)
      .then((v) => {
        let ls: string | null = null
        try {
          ls = localStorage.getItem(LANG_LS_KEY)
        } catch {
          /* 静默 */
        }
        const r = resolveLangPref(ls, v)
        setLangState(r.lang)
        if (r.writeLs) {
          try {
            localStorage.setItem(LANG_LS_KEY, r.writeLs)
          } catch {
            /* 静默 */
          }
        }
        if (r.writeUi) {
          void window.perigee?.uiState?.set(LANG_UISTATE_KEY, r.writeUi).catch(() => {})
        }
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
