import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkbench } from './state/useWorkbench'
import { detectFeatures } from './state/features'
import { useGlobalKeymap } from './state/keymap'
import { orderSessions } from './state/session-order'
import { usePopover } from './lib/popovers'
import { useEffectiveTheme, setThemePref } from './lib/theme'
import { useI18n } from './i18n'
import { IconButton } from './components/ui'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatStream } from './components/Chat/ChatStream'
import { Composer } from './components/Composer/Composer'
import { ContextPanel } from './components/ContextPanel/ContextPanel'
import { TerminalDrawer } from './components/TerminalDrawer/TerminalDrawer'
import { Palette } from './components/Palette/Palette'
import { SettingsModal } from './components/Modals/SettingsModal'
import { ShortcutsModal } from './components/Modals/ShortcutsModal'
import { TasksPanel } from './components/Modals/TasksPanel'
import { SideChatModal } from './components/Modals/SideChatModal'
import { ModelPicker } from './components/Modals/ModelPicker'
import { OpenFallbackDialog } from './components/Modals/OpenFallbackDialog'
import { Home } from './components/Home/Home'
import { RoutinesView } from './components/Routines/RoutinesView'
import { useRoutines } from './state/useRoutines'

/**
 * v3 壳（T009）：启动第一屏 = 首页；会话视图 = 中栏对话主舞台。
 * 左栏会话 / 右栏单实例上下文面板 / 底部终端抽屉；键盘流走 state/keymap。
 * ⌘N = 去首页聚焦输入框（会话在首页发送时才创建）；⌘1-9 = 直达会话。
 */
export function App() {
  const wb = useWorkbench()
  const features = useMemo(() => detectFeatures(), [])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [sideChatOpen, setSideChatOpen] = useState(false)
  /* T013：模型弹层开关入全站 data-pop 栈（Esc 关最上层/点外关由统一机制执行） */
  const modelPop = usePopover('model')
  /* T015：顶栏语言/主题入口 */
  const effectiveTheme = useEffectiveTheme()
  const { lang, setLang, t } = useI18n()
  /** 首页/会话视图切换（启动默认首页） */
  const [homeMode, setHomeMode] = useState(true)
  /* T019：Routines 主区路由（null = 不在 Routines；'' 之外的字符串 = 详情 id） */
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [routineId, setRoutineId] = useState<string | null>(null)
  const routinesStore = useRoutines(features.routines)
  /** 递增信号：Home 据此聚焦大输入框 */
  const [homeFocus, setHomeFocus] = useState(0)
  /** r04：侧栏收起/展开（uiState 持久化）与悬停浮窗 */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarFloat, setSidebarFloat] = useState(false)
  const floatTimer = useRef<number | null>(null)

  /* 侧栏收起状态：挂载恢复（uiState 桶，无桥降级 localStorage） */
  useEffect(() => {
    void (async () => {
      try {
        const v = features.uiState
          ? await window.perigee.uiState.get('sidebar.collapsed')
          : localStorage.getItem('sidebar.collapsed')
        if (v === true || v === 'true') setSidebarCollapsed(true)
      } catch {
        /* 缺省展开 */
      }
    })()
  }, [features.uiState])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v
      try {
        if (features.uiState) void window.perigee.uiState.set('sidebar.collapsed', next)
        else localStorage.setItem('sidebar.collapsed', String(next))
      } catch {
        /* 静默 */
      }
      return next
    })
    setSidebarFloat(false)
  }, [features.uiState])

  /* 悬停浮窗：移入即开；移出图标与浮窗区域 160ms 后关（T016 原型规格） */
  const openFloat = useCallback(() => {
    if (floatTimer.current != null) window.clearTimeout(floatTimer.current)
    floatTimer.current = null
    setSidebarFloat(true)
  }, [])
  const scheduleCloseFloat = useCallback(() => {
    if (floatTimer.current != null) window.clearTimeout(floatTimer.current)
    floatTimer.current = window.setTimeout(() => setSidebarFloat(false), 160)
  }, [])

  const goHome = useCallback(() => {
    setRoutinesOpen(false)
    setRoutineId(null)
    setHomeMode(true)
    setHomeFocus((v) => v + 1)
  }, [])

  /* Routines 导航：总览 / 详情（选中会话时自动退出，见 selectSession） */
  const goRoutines = useCallback((id: string | null = null) => {
    setRoutinesOpen(true)
    setRoutineId(id)
  }, [])

  const selectSession = useCallback(
    (id: string) => {
      wb.setActiveSession(id)
      setRoutinesOpen(false)
      setRoutineId(null)
      setHomeMode(false)
      // T008：查看即已读（桥未就绪则跳过）
      if (features.readTracking) {
        void window.perigee.session.markRead(id).catch(() => {})
      }
    },
    [wb, features.readTracking]
  )

  /* 原生菜单 ⌘N 的统一入口（useWorkbench 派发的自定义事件） */
  useEffect(() => {
    const h = () => goHome()
    const hs = () => setShortcutsOpen(true)
    window.addEventListener('grok:new-session', h)
    window.addEventListener('grok:open-shortcuts', hs)
    return () => {
      window.removeEventListener('grok:new-session', h)
      window.removeEventListener('grok:open-shortcuts', hs)
    }
  }, [goHome])

  /* 字号（主题已交 T013 lib/theme：跟随系统 + uiState 强制档，见 main.tsx initTheme） */
  useEffect(() => {
    const fs = wb.settings?.fontSize
    if (fs) document.documentElement.style.setProperty('--fs-body', `${fs}px`)
  }, [wb.settings?.fontSize])

  /* 错误 toast：6 秒自动消失（可手动提前关） */
  useEffect(() => {
    if (!wb.error) return
    const t = window.setTimeout(() => wb.setError(null), 6000)
    return () => window.clearTimeout(t)
  }, [wb])

  const panes = wb.settings?.layout.panes
  const contextOpen = wb.inspector.kind !== 'closed' || (panes?.file ?? false)
  const terminalOpen = panes?.terminal ?? false

  const closeContext = () => {
    wb.closeInspector()
    if (panes?.file) wb.persistLayout({ panes: { file: false } })
  }
  const toggleContext = () => {
    if (contextOpen) closeContext()
    else wb.persistLayout({ panes: { file: true } })
  }

  /* 键盘流（纲领 §3 逐条；⌘N 语义 T009 改为首页聚焦） */
  const keymap = useMemo(
    () => ({
      onPalette: () => wb.setPaletteOpen((v: boolean) => !v),
      onNewSession: () => goHome(),
      onSwitchSession: (index: number) => {
        const target = orderSessions(wb.sessions)[index]
        if (target) selectSession(target.id)
      },
      onModelSwitcher: () => {
        if (wb.activeSessionId || homeMode) modelPop.show()
      },
      onToggleTerminal: () => wb.toggleTerminalPane(),
      onToggleSidebar: () => toggleSidebar(),
      /* 右栏是对话上下文：Routines 视图下不渲染，键位与按钮一并停用（避免亮着开关却没面板） */
      onToggleContext: () => {
        if (!routinesOpen) toggleContext()
      },
      /* ⌘U：Composer 自己接这条事件打开附件选择器（壳层不碰它的内部状态） */
      onAddFiles: () => window.dispatchEvent(new CustomEvent('grok:add-files')),
      onEscape: () => {
        // 逐层关闭：菜单(Composer 内部自处理) → 面板/弹窗 → 取消流式（带确认）
        // T013：data-pop 栈里的弹层（模型/权限/plus 等）由统一机制在捕获相位先关，到不了这里
        if (wb.openFallback) return wb.dismissOpenFallback()
        if (wb.paletteOpen) return wb.setPaletteOpen(false)
        if (shortcutsOpen) return setShortcutsOpen(false)
        if (tasksOpen) return setTasksOpen(false)
        if (sideChatOpen) return setSideChatOpen(false)
        if (wb.settingsOpen) return wb.setSettingsOpen(false)
        if (contextOpen && !routinesOpen) return closeContext()
        if (terminalOpen) return wb.toggleTerminalPane()
        if (!homeMode && wb.busy && window.confirm(t('取消当前流式输出？'))) void wb.cancel()
      }
    }),
    [
      wb,
      goHome,
      selectSession,
      toggleSidebar,
      homeMode,
      modelPop,
      shortcutsOpen,
      tasksOpen,
      sideChatOpen,
      contextOpen,
      terminalOpen,
      routinesOpen,
      t
    ]
  )
  useGlobalKeymap(keymap)

  if (!wb.bridgeOk) {
    return (
      <div className="fatal">
        <h2>预加载桥加载失败</h2>
        <p>
          未检测到 <code>window.perigee</code>。请确认 preload 以 CJS 打包（index.cjs），
          ESM 输出在 sandbox 下会导致黑屏。
        </p>
      </div>
    )
  }

  /* T025 乐观导航：pendingSend 期间即便还没有 activeSessionId 也留在对话页（展示乐观消息 +
     等待态）；建会话失败时 clearPendingSend 会让这里自动退回首页。 */
  const showHome = (homeMode || !wb.activeSessionId) && !wb.pendingSend

  return (
    <div className="app-shell">
      {wb.error ? (
        <div className="banner banner-error" role="alert">
          <span>{wb.error}</span>
          <IconButton tip={t('关闭')} icon="x" onClick={() => wb.setError(null)} />
        </div>
      ) : null}

      <div className="app-body">
        <div className={`sidebar-shell${sidebarCollapsed ? ' is-collapsed' : ''}`}>
          <Sidebar
            wb={wb}
            features={features}
            onGoHome={goHome}
            onSelectSession={selectSession}
            routines={routinesStore.routines}
            activeRoutineId={routinesOpen ? routineId : null}
            routinesActive={routinesOpen}
            onOpenRoutines={goRoutines}
          />
        </div>

        {/* r04：侧栏开关（红绿灯右侧安全区；收起后位置不变） */}
        <IconButton
          tip={t('收起 / 展开侧栏  ⌘B')}
          tipPos="right"
          icon="panel-left"
          className="sb-toggle"
          onClick={toggleSidebar}
          onMouseEnter={() => {
            if (sidebarCollapsed) openFloat()
          }}
          onMouseLeave={() => {
            if (sidebarCollapsed) scheduleCloseFloat()
          }}
        />

        {/* r04：悬停浮窗态——完整侧栏悬浮于主区之上，点选会话后自动收起 */}
        {sidebarCollapsed && sidebarFloat ? (
          <div
            className="sidebar-float"
            onMouseEnter={openFloat}
            onMouseLeave={scheduleCloseFloat}
          >
            <Sidebar
              wb={wb}
              features={features}
              onGoHome={() => {
                goHome()
                setSidebarFloat(false)
              }}
              onSelectSession={(id) => {
                selectSession(id)
                setSidebarFloat(false)
              }}
              routines={routinesStore.routines}
              activeRoutineId={routinesOpen ? routineId : null}
              routinesActive={routinesOpen}
              onOpenRoutines={(id) => {
                goRoutines(id)
                setSidebarFloat(false)
              }}
            />
          </div>
        ) : null}

        <div className="main-col">
          {/*
            T024：顶栏拖拽与侧栏开关零重叠。
            禁止整条 .chat-header.drag——收起后 main-col 从 x=0 铺满，整栏 drag 会在原生层盖住
            absolute 的 .sb-toggle；兄弟节点 no-drag 挖不穿（CDP 合成事件测不出）。
            结构：左安全带（仅收起态变宽）+ 可拖填充 + 右侧按钮。
          */}
          <div className="chat-header">
            <div className="ch-left-drag drag" aria-hidden />
            <div className="ch-toggle-safe" aria-hidden />
            <div className="ch-drag-fill drag" aria-hidden />
            <div className="ch-actions">
              <IconButton
                tip={t('任务面板')}
                icon="bot"
                onClick={() => setTasksOpen(true)}
                disabled={!wb.activeSessionId}
              />
              <IconButton
                tip={t('侧问')}
                icon="message"
                onClick={() => setSideChatOpen(true)}
                disabled={!wb.activeSessionId}
              />
              <IconButton
                tip={t('终端  ⌘`')}
                icon="terminal"
                on={terminalOpen}
                onClick={() => wb.toggleTerminalPane()}
              />
              <IconButton
                tip={t('上下文面板  ⌘I')}
                icon="panel-right"
                on={contextOpen && !routinesOpen}
                disabled={routinesOpen}
                onClick={toggleContext}
              />
              <IconButton
                tip={t('快捷键')}
                icon="keyboard"
                onClick={() => setShortcutsOpen(true)}
              />
              <IconButton
                tip={t('切换语言')}
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              >
                <span className="ch-lang">{lang === 'zh' ? '中' : 'EN'}</span>
              </IconButton>
              <IconButton
                tip={t('切换主题')}
                icon={effectiveTheme === 'dark' ? 'sun' : 'moon'}
                onClick={() => setThemePref(effectiveTheme === 'dark' ? 'light' : 'dark')}
              />
              <IconButton tip={t('设置  ⌘,')} icon="settings" onClick={() => wb.setSettingsOpen(true)} />
            </div>
          </div>

          {routinesOpen ? (
            <RoutinesView
              wb={wb}
              routines={routinesStore.routines}
              ready={routinesStore.ready}
              selectedId={routineId}
              onSelect={setRoutineId}
              onOpenSession={selectSession}
            />
          ) : showHome ? (
            <Home
              wb={wb}
              features={features}
              focusSignal={homeFocus}
              onSelectSession={selectSession}
              onOpenModelPicker={modelPop.show}
            />
          ) : (
            <>
              <ChatStream wb={wb} />
              <Composer
                wb={wb}
                features={features}
                onOpenModelPicker={modelPop.show}
              />
            </>
          )}
        </div>

        {contextOpen && !showHome && !routinesOpen ? <ContextPanel wb={wb} /> : null}
      </div>

      <TerminalDrawer wb={wb} open={terminalOpen} />

      <Palette
        wb={wb}
        features={features}
        open={wb.paletteOpen}
        onClose={() => wb.setPaletteOpen(false)}
        onOpenSettings={() => wb.setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenTasks={() => setTasksOpen(true)}
        onGoHome={goHome}
      />
      <SettingsModal
        wb={wb}
        open={wb.settingsOpen}
        initialPage={wb.settingsPage}
        onClose={() => {
          wb.setSettingsOpen(false)
          wb.openSettingsAt(null, false) // 仅清深链，不重新打开
        }}
      />
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        platform={wb.appInfo?.platform}
      />
      <TasksPanel wb={wb} open={tasksOpen} onClose={() => setTasksOpen(false)} />
      <SideChatModal wb={wb} open={sideChatOpen} onClose={() => setSideChatOpen(false)} />
      <ModelPicker wb={wb} open={modelPop.open} onClose={modelPop.close} />
      {/* T027：应用内打不开时的系统兜底（系统默认应用 / Finder 显示） */}
      <OpenFallbackDialog wb={wb} />
    </div>
  )
}
