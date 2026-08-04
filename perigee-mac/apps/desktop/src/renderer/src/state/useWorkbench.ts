import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppInfo,
  AppSettings,
  FileDiff,
  SessionEvent,
  SessionRecord
} from '../lib/perigee-api'
import type { ChatBlock, InspectorState, RecentWorkspace } from '../lib/types'
import { finalizeStreaming, reduceEvent, seedBlocks } from '../lib/session-reducer'
import {
  applyNativeTaskEvent,
  mergeTaskEntries,
  nativeTasksList,
  type NativeTaskEntry
} from '../lib/tasks-from-events'
import { tasksFromBlocks } from '../lib/tasks-from-blocks'
import { canOpenInApp, type OpenFallbackReason } from '../lib/openable'
import {
  EMPTY_ARCHIVED,
  archive as archiveKeyIn,
  loadArchived,
  pruneArchived,
  saveArchived,
  unarchive as unarchiveKeyIn,
  type ArchivedState
} from './archived-sessions'
import {
  PENDING_TIMEOUT_MS,
  attachSession as attachPendingSession,
  isEchoed,
  startPending,
  withOptimistic,
  type PendingSend
} from './pending-send'
import { sessionBusy } from './composer-actions'

/**
 * 工作台总线：收口所有 window.perigee 订阅与状态。
 * - 每个会话的消息块独立缓存（切换不丢、非活动会话事件不丢）
 * - 右栏 = 默认收起的检查器（inspector），内容由上下文决定
 */

export function useWorkbench() {
  const bridgeOk = typeof window !== 'undefined' && !!window.perigee
  const api = window.perigee

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  /** CLI `grok models` 的默认模型 id；settings.model 空时 chip 回退用 */
  const [cliDefaultModel, setCliDefaultModel] = useState<string | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentWorkspace[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null)
  const [blocksMap, setBlocksMap] = useState<ReadonlyMap<string, ChatBlock[]>>(new Map())
  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [fileVersion, setFileVersion] = useState(0) // file.changed 信号
  /** sessionId → 原生 subagent/task 条目 */
  const [nativeTasksMap, setNativeTasksMap] = useState<
    ReadonlyMap<string, Map<string, NativeTaskEntry>>
  >(new Map())
  const [inspector, setInspector] = useState<InspectorState>({ kind: 'closed' })
  /** 独立文件列 / 主区文件当前路径 */
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** T025：设置深链目标页（null = 默认「通用」） */
  const [settingsPage, setSettingsPage] = useState<string | null>(null)
  /** T025：主页乐观发送（先切页，建会话/发送在后台跑） */
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null)
  /** T026：归档表提到总线——侧栏（隐藏已归档）与设置「已归档」子页两处消费同一份状态 */
  const [archived, setArchived] = useState<ArchivedState>(EMPTY_ARCHIVED)
  /** 本进程用户已删的 CLI transcript id：防删 Desktop 后 listExternal 回魂成「恢复到 Desktop」 */
  const [forgottenCliIds, setForgottenCliIds] = useState<ReadonlySet<string>>(() => new Set())
  /** 乐观删除的 Desktop 会话 id：挡住迟到的 session:updated 把行插回 */
  const forgottenSessionIdsRef = useRef<Set<string>>(new Set())
  /** T027：应用内打不开时的兜底弹窗（系统默认应用 / Finder 显示） */
  const [openFallback, setOpenFallback] = useState<{
    path: string
    reason: OpenFallbackReason
  } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeRef = useRef<string | null>(null)
  const seededRef = useRef<Set<string>>(new Set())

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  )
  /* 仅当前绑定会话在忙才 busy；首页 active=null 不继承后台 stream（见 sessionBusy） */
  const busy = sessionBusy(activeSession, !!pendingSend)

  const blocks = useMemo(() => {
    const real = activeSessionId ? (blocksMap.get(activeSessionId) ?? []) : []
    /* 乐观用户消息：引擎回显同文本即撤下（去重规则见 state/pending-send） */
    return withOptimistic(real, pendingSend)
  }, [blocksMap, activeSessionId, pendingSend])

  /** 每会话「最后动态」摘要：供侧栏队列显示 */
  const lastActivity = useMemo(() => {
    const m = new Map<string, string>()
    for (const [sid, blocks] of blocksMap) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i]
        if (b.kind === 'tool') {
          m.set(sid, `⚙ ${b.name}`)
          break
        }
        if (b.kind === 'assistant' && b.text.trim()) {
          const line = b.text.trim().split('\n')[0]
          m.set(sid, line.length > 40 ? `${line.slice(0, 40)}…` : line)
          break
        }
        if (b.kind === 'user') {
          const line = b.text.trim().split('\n')[0]
          m.set(sid, `你：${line.length > 36 ? `${line.slice(0, 36)}…` : line}`)
          break
        }
      }
    }
    return m
  }, [blocksMap])

  const applyEvent = useCallback((ev: SessionEvent) => {
    setBlocksMap((prev) => {
      const cur = prev.get(ev.sessionId) ?? []
      const next = reduceEvent(cur, ev)
      if (next === cur) return prev
      const m = new Map(prev)
      m.set(ev.sessionId, next)
      return m
    })
    if (
      ev.type === 'subagent.spawned' ||
      ev.type === 'subagent.progress' ||
      ev.type === 'subagent.finished' ||
      ev.type === 'task.backgrounded' ||
      ev.type === 'task.completed'
    ) {
      setNativeTasksMap((prev) => {
        const sessionMap = new Map(prev.get(ev.sessionId) ?? [])
        const updated = applyNativeTaskEvent(sessionMap, ev)
        const m = new Map(prev)
        m.set(ev.sessionId, updated)
        return m
      })
    }
    if (ev.type === 'file.changed') setFileVersion((v) => v + 1)
    // 热路径失败 → 顶栏 banner（可观测，不只 lifecycle）
    if (ev.type === 'lifecycle') {
      const fail =
        ev.name === 'permission.set_mode.fail' ||
        ev.name === 'model.set.fail' ||
        ev.name === 'mcp.update.fail'
      if (fail) {
        const d = ev.detail as { error?: string } | undefined
        const label =
          ev.name === 'permission.set_mode.fail'
            ? '权限热切失败'
            : ev.name === 'model.set.fail'
              ? '模型热切失败'
              : 'MCP 热更失败'
        setError(`${label}：${d?.error ?? ev.name}`)
      }
    }
  }, [])

  const seedSession = useCallback(
    async (sessionId: string) => {
      if (seededRef.current.has(sessionId)) return
      seededRef.current.add(sessionId)
      try {
        const hist = await api.session.history(sessionId)
        setBlocksMap((prev) => {
          const m = new Map(prev)
          const seeded = seedBlocks(hist)
          const live = prev.get(sessionId) ?? []
          // 合并：history 为底，live 中 history 没有的块（实时竞态已到达）追加
          // 禁止整表覆盖把迟到 seed 盖掉 live 消息（审计 Z8-01）
          if (live.length === 0) {
            m.set(sessionId, seeded)
            return m
          }
          const seededIds = new Set(seeded.map((b) => b.id))
          const liveOnly = live.filter((b) => !seededIds.has(b.id))
          m.set(sessionId, [...seeded, ...liveOnly])
          return m
        })
        let taskMap = new Map<string, NativeTaskEntry>()
        for (const ev of hist) {
          taskMap = applyNativeTaskEvent(taskMap, ev)
        }
        if (taskMap.size > 0) {
          setNativeTasksMap((prev) => {
            const m = new Map(prev)
            m.set(sessionId, taskMap)
            return m
          })
        }
      } catch {
        seededRef.current.delete(sessionId)
      }
    },
    [api]
  )

  const setActiveSession = useCallback(
    (id: string | null) => {
      activeRef.current = id
      setActiveSessionIdState(id)
      if (id) void seedSession(id)
    },
    [seedSession]
  )

  /* ---------- 检查器 / 布局 pane ---------- */
  const closeInspector = useCallback(() => setInspector({ kind: 'closed' }), [])

  const persistLayout = useCallback(
    (
      patch: Omit<Partial<AppSettings['layout']>, 'panes'> & {
        panes?: Partial<NonNullable<AppSettings['layout']['panes']>>
      }
    ) => {
      setSettings((prev) => {
        if (!prev) return prev
        const layout: AppSettings['layout'] = {
          ...prev.layout,
          ...patch,
          panes: {
            file: prev.layout.panes?.file ?? false,
            terminal: prev.layout.panes?.terminal ?? false,
            inspector: prev.layout.panes?.inspector ?? true,
            ...prev.layout.panes,
            ...patch.panes
          }
        }
        void api.settings.update({ layout }).catch(() => {})
        return { ...prev, layout }
      })
    },
    [api]
  )

  /**
   * T027：文件引用一键打开——应用内可读（文本/代码/Markdown）→ 右栏面板；
   * 二进制/不支持 → 弹兜底（系统默认应用 / Finder 显示）。绝对路径与相对路径都吃。
   */
  const openPath = useCallback(
    (rel: string) => {
      const cleaned = rel.replace(/^\.\//, '')
      if (!canOpenInApp(cleaned)) {
        setOpenFallback({ path: cleaned, reason: 'binary' })
        return
      }
      setActiveFilePath(cleaned)
      // 一次点击只开一个查看器：统一文件列 FilePane。
      // 旧逻辑对 .md/.mdx 同时 panes.file + inspector(kind:md) → 中栏「浏览」与右栏预览双开同文件（T003）。
      setInspector((prev) =>
        prev.kind === 'md' || prev.kind === 'file' ? { kind: 'closed' } : prev
      )
      persistLayout({ panes: { file: true } })
    },
    [persistLayout]
  )

  /* ---------- T027：文件打开全域化 ---------- */

  /** 系统默认应用打开（失败进错误条，不静默） */
  const openWithSystem = useCallback(
    (path: string) => {
      setOpenFallback(null)
      void api.system
        ?.openPath(path)
        .then((r) => {
          if (r && !r.ok) setError(`系统打开失败：${r.reason ?? path}`)
        })
        .catch((e: unknown) => setError(`系统打开失败：${e instanceof Error ? e.message : String(e)}`))
    },
    [api]
  )

  /** Finder 中显示 */
  const revealInFinder = useCallback(
    (path: string) => {
      setOpenFallback(null)
      void api.system?.revealInFinder(path).catch(() => {})
    },
    [api]
  )

  const dismissOpenFallback = useCallback(() => setOpenFallback(null), [])

  /** 读取失败等场景：主动挂起兜底弹窗 */
  const promptOpenFallback = useCallback((path: string, reason: OpenFallbackReason) => {
    setOpenFallback({ path, reason })
  }, [])

  const openTool = useCallback(
    (sessionId: string, callId: string) => {
      setInspector({ kind: 'tool', sessionId, callId })
      persistLayout({ panes: { inspector: true } })
    },
    [persistLayout]
  )

  const openTurnDiff = useCallback(
    (sessionId: string, turnId: string) => {
      setInspector({ kind: 'turnDiff', sessionId, turnId })
      persistLayout({ panes: { inspector: true } })
    },
    [persistLayout]
  )

  const openTerminal = useCallback(
    (_sessionId: string) => {
      setSettings((prev) => {
        if (!prev) return prev
        const cur = prev.layout.panes?.terminal ?? false
        const layout = {
          ...prev.layout,
          panes: {
            file: prev.layout.panes?.file ?? false,
            terminal: !cur,
            inspector: prev.layout.panes?.inspector ?? true
          }
        }
        void api.settings.update({ layout }).catch(() => {})
        return { ...prev, layout }
      })
    },
    [api]
  )

  const toggleFilePane = useCallback(() => {
    setSettings((prev) => {
      if (!prev) return prev
      const cur = prev.layout.panes?.file ?? false
      const layout = {
        ...prev.layout,
        panes: {
          file: !cur,
          terminal: prev.layout.panes?.terminal ?? false,
          inspector: prev.layout.panes?.inspector ?? true
        }
      }
      void api.settings.update({ layout }).catch(() => {})
      return { ...prev, layout }
    })
  }, [api])

  const toggleTerminalPane = useCallback(() => {
    openTerminal('')
  }, [openTerminal])

  const openPreview = useCallback(() => {
    setInspector({ kind: 'preview' })
    persistLayout({ panes: { inspector: true } })
  }, [persistLayout])

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await api.session.list())
    } catch {
      /* 未打开工作区等场景静默 */
    }
  }, [api])

  const refreshDiffs = useCallback(async () => {
    try {
      setDiffs(await api.diff.list())
    } catch {
      /* ignore */
    }
  }, [api])

  const openFolder = useCallback(async () => {
    setError(null)
    const res = await api.workspace.openDialog()
    if (!res.ok && res.reason !== 'canceled') setError(res.reason ?? '打开失败')
  }, [api])

  const openRecent = useCallback(
    async (path: string) => {
      setError(null)
      const res = await api.workspace.openPath(path)
      if (!res.ok) setError(res.reason ?? '打开失败')
    },
    [api]
  )

  const closeWorkspace = useCallback(async () => {
    await api.workspace.close()
    setSessions([])
    setActiveSession(null)
    setDiffs([])
    closeInspector()
  }, [api, setActiveSession, closeInspector])

  const newSession = useCallback(async () => {
    setError(null)
    try {
      const rec = await api.session.create()
      seededRef.current.add(rec.id)
      setBlocksMap((prev) => new Map(prev).set(rec.id, []))
      setActiveSession(rec.id)
      await refreshSessions()
      // P0-23：同 cwd 并行无 worktree 时强警告
      const list = await api.session.list()
      const peers = list.filter((s) => s.workspacePath === rec.workspacePath)
      if (peers.length > 1) {
        setError(
          `警告：已有 ${peers.length} 个会话共享工作区「${rec.workspacePath}」。并行写文件可能互相覆盖；建议一次只让一个会话改盘，或等待 worktree 隔离（波次 B）。`
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, refreshSessions, setActiveSession])

  const send = useCallback(
    async (text: string, sessionId?: string, opts?: { mediaPaths?: string[] }) => {
      const id = sessionId ?? activeRef.current
      if (!id || (!text.trim() && !(opts?.mediaPaths?.length))) return
      if (!currentWorkspace) {
        setError('请先打开工作区，再发送消息。')
        return
      }
      setError(null)
      try {
        await api.session.send(id, text.trim(), opts)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api, currentWorkspace]
  )

  /* ---------- T025：主页乐观发送 ---------- */

  /** 点发送即调：立刻进入「有内容的对话页」，会话还没建 */
  const beginPendingSend = useCallback((text: string) => {
    setError(null)
    setPendingSend(startPending(text))
  }, [])

  /**
   * 会话建好后回填 id（此时真实块开始流入，乐观块等回显再撤）。
   * 同时**把新会话标记为已 seed**：新会话没有历史可拉，而 seedSession 的异步 history() 若晚于
   * 首批引擎事件返回，会用空数组把刚到的 user.message / 流式块覆盖掉（与 newSession 同一防线）。
   */
  const attachPending = useCallback((sessionId: string) => {
    seededRef.current.add(sessionId)
    setBlocksMap((prev) => (prev.has(sessionId) ? prev : new Map(prev).set(sessionId, [])))
    setPendingSend((prev) => (prev ? attachPendingSession(prev, sessionId) : prev))
  }, [])

  /** 成功收尾 / 失败回退都用它；失败时 activeSessionId 仍为空 → 壳层自动退回主页 */
  const clearPendingSend = useCallback(() => setPendingSend(null), [])

  /** 引擎回显了同一条用户消息 → 乐观态功成身退（此后 busy 交回真实会话状态） */
  useEffect(() => {
    if (!pendingSend?.sessionId) return
    const real = blocksMap.get(pendingSend.sessionId) ?? []
    if (isEchoed(pendingSend.text, real)) setPendingSend(null)
  }, [pendingSend, blocksMap])

  /** 兜底：永不回显（slash / 引擎异常）也不许把 UI 永久钉在等待态 */
  useEffect(() => {
    if (!pendingSend) return
    const left = PENDING_TIMEOUT_MS - (Date.now() - pendingSend.startedAt)
    const timer = window.setTimeout(() => setPendingSend(null), Math.max(0, left))
    return () => window.clearTimeout(timer)
  }, [pendingSend])

  /* ---------- T026：归档表（uiState 持久化，两处消费） ---------- */

  const uiStateReady = typeof api?.uiState?.get === 'function'

  useEffect(() => {
    let alive = true
    void loadArchived(uiStateReady).then((st) => {
      if (alive) setArchived(st)
    })
    return () => {
      alive = false
    }
  }, [uiStateReady])

  const mutateArchived = useCallback(
    (fn: (prev: ArchivedState) => ArchivedState) => {
      setArchived((prev) => {
        const next = fn(prev)
        if (next !== prev) void saveArchived(next, uiStateReady)
        return next
      })
    },
    [uiStateReady]
  )

  const archiveItem = useCallback(
    (key: string) => mutateArchived((prev) => archiveKeyIn(prev, key)),
    [mutateArchived]
  )
  const unarchiveItem = useCallback(
    (key: string) => mutateArchived((prev) => unarchiveKeyIn(prev, key)),
    [mutateArchived]
  )

  /** 与真实会话对账：Desktop 幽灵 id 剔除（cli: 条目不动，见 archived-sessions 注释） */
  useEffect(() => {
    if (sessions.length === 0) return
    mutateArchived((prev) => pruneArchived(prev, sessions.map((s) => s.id)))
  }, [sessions, mutateArchived])

  /**
   * T025：带目标页打开设置（侧栏 MCP / Skills 深链）。
   * page=null 且 open=false 时仅清深链（关闭设置后防粘滞）。
   */
  const openSettingsAt = useCallback((page: string | null = null, open = true) => {
    setSettingsPage(page)
    if (open) setSettingsOpen(true)
  }, [])

  const cancel = useCallback(async () => {
    // 乐观发送窗口：先清 pending，否则主页停止键看起来无效（审计 Z7-03）
    setPendingSend(null)
    const id = activeRef.current
    if (!id) return
    // 本地立刻封口流式块：去掉斜杠光标 / 思考脉冲（引擎 cancel 只改 status→idle，不发 turn.end）
    setBlocksMap((prev) => {
      const cur = prev.get(id)
      if (!cur) return prev
      const sealed = finalizeStreaming(cur)
      if (sealed === cur) return prev
      const m = new Map(prev)
      m.set(id, sealed)
      return m
    })
    await api.session.cancel(id).catch(() => {})
  }, [api])

  const exportSession = useCallback(async () => {
    const id = activeRef.current
    if (!id) return
    await api.session.export(id).catch(() => {})
  }, [api])

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        await api.session.rename(sessionId, title)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api]
  )

  /** 侧栏删 CLI 行 / 删 Desktop 联删：记墓碑，listExternal 结果过滤 */
  const forgetCliId = useCallback((cliId: string) => {
    const id = cliId.trim()
    if (!id) return
    setForgottenCliIds((prev) => {
      if (prev.has(id)) return prev
      const n = new Set(prev)
      n.add(id)
      return n
    })
  }, [])

  /**
   * 删除会话：侧栏立刻消失（乐观）；IPC 失败也不把行插回（符合「眼下消失」）。
   * 若有 engineSessionId，记入 forgottenCliIds，避免 CLI transcript 回魂成「恢复到 Desktop」。
   */
  const removeSession = useCallback(
    async (sessionId: string) => {
      const rec = sessions.find((s) => s.id === sessionId)
      const cliId = rec?.engineSessionId?.trim()
      forgottenSessionIdsRef.current.add(sessionId)
      // 乐观：立刻从列表/块/active 摘掉
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeRef.current === sessionId) setActiveSession(null)
      setBlocksMap((prev) => {
        const m = new Map(prev)
        m.delete(sessionId)
        return m
      })
      if (cliId) forgetCliId(cliId)
      try {
        await api.session.remove(sessionId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api, setActiveSession, sessions, forgetCliId]
  )

  const revertTurn = useCallback(
    async (sessionId: string, turnId: string) => {
      setError(null)
      try {
        await api.diff.revertTurn(sessionId, turnId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api]
  )

  const resolveApproval = useCallback(
    async (requestId: string, approved: boolean) => {
      try {
        await api.approval.resolve(requestId, approved)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api]
  )

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      try {
        await api.settings.update(partial)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api]
  )

  /* ---------- 初始化 + 订阅（只挂一次） ---------- */
  useEffect(() => {
    if (!bridgeOk) return
    void (async () => {
      try {
        const info = await api.getAppInfo()
        setAppInfo(info)
        if (info?.platform) {
          document.documentElement.dataset.platform = info.platform
        }
        setSettings(await api.settings.get())
        const ws = await api.workspace.getState()
        setCurrentWorkspace(ws.currentWorkspace ?? ws.lastWorkspacePath ?? null)
        setRecent(ws.recentWorkspaces ?? [])
        await refreshSessions()
        await refreshDiffs()
        // 模型 chip：settings.model 空时显示 CLI 默认；失败不挡启动
        try {
          const listed = await api.integrations.listModels()
          const id =
            listed.defaultModel?.trim() ||
            listed.models?.find((m) => m.isDefault)?.id?.trim() ||
            ''
          if (id) setCliDefaultModel(id)
        } catch {
          /* listModels 不可用时 chip 仍可回退「默认模型」 */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()

    const offs = [
      api.workspace.onChanged((p) => {
        setCurrentWorkspace(p.currentWorkspace)
        setRecent(p.state?.recentWorkspaces ?? [])
        void refreshSessions()
      }),
      api.session.onUpdated((list) => {
        const dead = forgottenSessionIdsRef.current
        setSessions(dead.size ? list.filter((s) => !dead.has(s.id)) : list)
      }),
      api.session.onEvent(applyEvent),
      api.diff.onUpdated((list) => {
        // 广播可能是 listMeta（无 before/after）：与本地缓存合并，避免丢已有全文
        const incoming = list as FileDiff[]
        setDiffs((prev) => {
          const oldById = new Map(prev.map((d) => [d.id, d]))
          return incoming.map((d) => {
            if (!d.contentOmitted) return d
            const old = oldById.get(d.id)
            if (!old) return d
            return {
              ...d,
              before: old.before,
              after: old.after,
              contentOmitted: false
            }
          })
        })
      }),
      api.settings.onChanged((s) => setSettings(s)),
      api.menu.on('open-workspace', () => void openFolder()),
      api.menu.on('command-palette', () => setPaletteOpen(true)),
      // T009：⌘N 语义 = 去首页并聚焦输入框（会话在首页发送时才创建）。
      // 原生菜单 accelerator 优先于 renderer 按键，统一派发自定义事件由 App 收敛。
      api.menu.on('new-session', () =>
        window.dispatchEvent(new CustomEvent('grok:new-session'))
      ),
      api.menu.on('export-session', () => void exportSession()),
      api.menu.on('settings', () => setSettingsOpen(true))
    ]
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeOk])

  const blocksFor = useCallback(
    (sessionId: string | null | undefined) =>
      sessionId ? (blocksMap.get(sessionId) ?? []) : [],
    [blocksMap]
  )

  /** 原生 subagent/task + tool 派生合并（原生优先） */
  const tasks = useMemo(() => {
    if (!activeSessionId) return []
    const native = nativeTasksList(nativeTasksMap.get(activeSessionId) ?? new Map())
    const tool = tasksFromBlocks(blocksMap.get(activeSessionId) ?? [])
    return mergeTaskEntries(native, tool)
  }, [activeSessionId, nativeTasksMap, blocksMap])

  return {
    bridgeOk,
    appInfo,
    settings,
    cliDefaultModel,
    updateSettings,
    currentWorkspace,
    recent,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSession,
    seedSession,
    blocks,
    blocksFor,
    tasks,
    lastActivity,
    busy,
    diffs,
    fileVersion,
    inspector,
    activeFilePath,
    setActiveFilePath,
    closeInspector,
    openPath,
    openFallback,
    promptOpenFallback,
    dismissOpenFallback,
    openWithSystem,
    revealInFinder,
    openTool,
    openTurnDiff,
    openTerminal,
    toggleFilePane,
    toggleTerminalPane,
    openPreview,
    persistLayout,
    settingsOpen,
    setSettingsOpen,
    settingsPage,
    openSettingsAt,
    pendingSend,
    archived,
    archiveItem,
    unarchiveItem,
    forgottenCliIds,
    forgetCliId,
    beginPendingSend,
    attachPending,
    clearPendingSend,
    paletteOpen,
    setPaletteOpen,
    error,
    setError,
    openFolder,
    openRecent,
    closeWorkspace,
    newSession,
    send,
    cancel,
    exportSession,
    renameSession,
    removeSession,
    revertTurn,
    resolveApproval,
    refreshSessions,
    refreshDiffs
  }
}

export type Workbench = ReturnType<typeof useWorkbench>
