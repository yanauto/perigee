/* T013：首屏无闪烁——在 CSS 生效前按 localStorage 镜像 + 系统外观预置 data-theme。
   真相源为 uiState('theme.pref')，启动后由 src/lib/theme.ts 的 initTheme() 校准。
   key 与 theme.ts 的 THEME_LS_KEY 保持一致。 */
;(function () {
  try {
    var p = localStorage.getItem('grok.theme.pref')
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme =
      p === 'light' || p === 'dark' ? p : dark ? 'dark' : 'light'
  } catch (e) {
    /* 静默：回落 CSS 默认（浅色） */
  }
})()
