import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { initTheme } from './lib/theme'
import { initPopovers } from './lib/popovers'
import { initUiPrefs } from './lib/ui-prefs'
import './styles/global.css'

/* T013 基建：主题（跟随系统/强制档恢复）与弹层统一关闭机制，在首帧前装好 */
initTheme()
initPopovers()
/* T017：强调色换肤 + 主页用量卡开关（uiState 真相源，localStorage 首屏镜像） */
initUiPrefs()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
)
