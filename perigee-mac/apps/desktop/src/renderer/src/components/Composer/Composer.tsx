import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import type {
  CommandCapability,
  CommandSupport,
  PermissionPolicy,
  SkillEntry
} from '../../lib/perigee-api'
import {
  ATTACH_MAX,
  classifyAttachPath,
  mediaPathsFromAttachments,
  mergeAttachmentsIntoDraft,
  type AttachmentRef
} from '../../lib/attachments'
import { applyMention, filterMentionCandidates, getMentionQuery } from '../../lib/mention'
import {
  applySlashInsert,
  filterSlashItems,
  getSlashQuery,
  type SlashItem
} from '../../lib/slash'
import {
  loadHistory,
  navNext,
  navPrev,
  recordEntry,
  resetNav,
  saveHistory,
  type HistoryNav
} from '../../state/prompt-history'
import { canSubmit, composerAction } from '../../state/composer-actions'
import { capabilityOf, fetchCommandCapabilities, type BridgeFeatures } from '../../state/features'
import type { Workbench } from '../../state/useWorkbench'
import { resolveModelLabel } from '../../lib/format'
import { usePopover } from '../../lib/popovers'
import { useT } from '../../i18n'
import { Icon, IconButton } from '../ui'
import { EffortPopover, type EffortLevel } from './EffortPopover'
import { PermChip } from './PermChip'

/** effort 档位 → chip 文字（r02 A2） */
const EFFORT_LABEL: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
}
import { PlusMenu } from './PlusMenu'

/** 权限四态（AppSettings.permissionPolicy） */
const PERM_MODES: { id: PermissionPolicy; label: string }[] = [
  { id: 'ask', label: '询问' },
  { id: 'accept_edits', label: '改文件' },
  { id: 'plan', label: '计划' },
  { id: 'yolo', label: '放行' }
]

/** 内建 pager 命令（T005 session.command 路由执行；支持度按 commandCapabilities 逐项判定） */
const BUILTIN_COMMANDS: { label: string; arg: string; description: string }[] = [
  { label: 'model', arg: '<模型id>', description: '切换模型' },
  { label: 'effort', arg: '<low|medium|high>', description: '推理强度' },
  { label: 'compact', arg: '[提示]', description: '压缩上下文' },
  { label: 'rewind', arg: '[轮次]', description: '回退到更早轮次' },
  { label: 'mcps', arg: '[服务器]', description: 'MCP 服务器面板' }
]

type SlashEntry = SlashItem & { arg?: string; builtin?: boolean; support?: CommandSupport }

type MenuMode = 'none' | 'slash' | 'mention' | 'attach'

/** T006 未就绪桥方法（feature-detect 就绪后才调用，全部防御性 try/catch） */
type T006Bridge = {
  clipboard?: { saveImage?: () => Promise<unknown> }
  fs?: { pathForFile?: (file: File) => Promise<unknown> }
}

const t006 = (): T006Bridge => window.perigee as unknown as T006Bridge

/** 桥返回值宽容解路径：string 或 { path } */
const asPath = (r: unknown): string | null => {
  if (typeof r === 'string') return r || null
  if (r && typeof r === 'object' && 'path' in r) {
    const p = (r as { path?: unknown }).path
    if (typeof p === 'string' && p) return p
  }
  return null
}

const fmtTok = (n?: number): string => {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

const mentionSnippet = (path: string): string =>
  path.includes(' ') ? `@"${path}" ` : `@${path} `

/**
 * 输入区（纲领 §3 键盘流）：
 * Enter 发送 / Shift+Enter 换行 · 空时 ↑ 提示词历史 · Shift+Tab 权限四态 ·
 * `/` slash 菜单（T005 选中即执行）· `@` 文件补全 · 附件 chip · 贴图/拖放 · 跨会话投递 ·
 * `+` 菜单（附件/Slash/连接器统一入口，CCD ccd-06）· effort 三档滑杆弹层（CCD ccd-04）
 */
export function Composer({
  wb,
  features,
  onOpenModelPicker
}: {
  wb: Workbench
  features: BridgeFeatures
  onOpenModelPicker: () => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [fileIndex, setFileIndex] = useState<string[]>([])
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [cmdCaps, setCmdCaps] = useState<CommandCapability[] | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [slashItems, setSlashItems] = useState<SlashEntry[]>([])
  const [menuMode, setMenuMode] = useState<MenuMode>('none')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [slashStart, setSlashStart] = useState<number | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [crossOpen, setCrossOpen] = useState(false)
  /* T013：plus / effort 弹层开关交全站统一机制（data-pop 栈），点外/Esc/换弹层一处生效 */
  const plusPop = usePopover('plus')
  const effortPop = usePopover('effort')
  const t = useT()
  /** effort 当前值无查询 API：记住本会话上次选择（不预填） */
  const [effort, setEffort] = useState<EffortLevel | null>(null)
  const [bridgeHint, setBridgeHint] = useState<string | null>(null)
  const [histEntries, setHistEntries] = useState<string[]>([])
  const [histNav, setHistNav] = useState<HistoryNav>(resetNav())
  const taRef = useRef<HTMLTextAreaElement>(null)
  const plusAnchorRef = useRef<HTMLSpanElement>(null)
  const effortAnchorRef = useRef<HTMLButtonElement>(null)
  const hintTimer = useRef<number | null>(null)

  const disabled = !wb.currentWorkspace || !wb.activeSessionId
  const policy = wb.settings?.permissionPolicy ?? 'ask'
  /** effort 入口支持度：桥就绪 + capabilities 非 unsupported（未拉表前安全置灰） */
  const effortCapable = features.command && capabilityOf(cmdCaps, 'effort') !== 'unsupported'
  const effortEnabled = !!wb.activeSessionId && effortCapable

  /* ---------- 一次性/订阅式数据 ---------- */

  // 会话切换：载入该会话的提示词历史并退出历史浏览态
  useEffect(() => {
    setHistEntries(wb.activeSessionId ? loadHistory(wb.activeSessionId) : [])
    setHistNav(resetNav())
  }, [wb.activeSessionId])

  // 工作区文件索引（@mention 与 + 附件选择器共用）
  useEffect(() => {
    if (disabled) {
      setFileIndex([])
      return
    }
    let alive = true
    void window.perigee.fs
      .list('.', 4)
      .then((entries) => {
        if (!alive) return
        setFileIndex(
          entries.filter((e) => !e.isDirectory).map((e) => e.relativePath.replace(/\\/g, '/'))
        )
      })
      .catch(() => {
        if (alive) setFileIndex([])
      })
    return () => {
      alive = false
    }
  }, [disabled])

  // skills 目录
  useEffect(() => {
    let alive = true
    void window.perigee.integrations
      .listSkills()
      .then((list) => alive && setSkills(list))
      .catch(() => alive && setSkills([]))
    return () => {
      alive = false
    }
  }, [])

  // T005 命令能力表（桥存在才拉；rewind 等 unsupported 项据此置灰）
  useEffect(() => {
    if (!features.command) return
    let alive = true
    void fetchCommandCapabilities().then((caps) => {
      if (alive) setCmdCaps(caps)
    })
    return () => {
      alive = false
    }
  }, [features.command])

  // 自适应高度（max-height 220px 由 CSS 控制）
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft])

  // 桥提示定时器清理
  useEffect(
    () => () => {
      if (hintTimer.current != null) window.clearTimeout(hintTimer.current)
    },
    []
  )

  /* ---------- 派生 ---------- */

  const slashCatalog = useMemo<SlashEntry[]>(() => {
    const builtins: SlashEntry[] = BUILTIN_COMMANDS.map((c) => ({
      id: `builtin:${c.label}`,
      label: c.label,
      description: c.description,
      insert: '',
      arg: c.arg,
      builtin: true,
      support: features.command ? capabilityOf(cmdCaps, c.label) : 'unsupported'
    }))
    const fromSkills: SlashEntry[] = skills.map((s) => ({
      id: `skill:${s.name}`,
      label: s.name,
      description: s.description,
      insert: `/${s.name} `,
      support: features.command ? capabilityOf(cmdCaps, 'skill') : 'unsupported'
    }))
    return [...builtins, ...fromSkills]
  }, [skills, features.command, cmdCaps])

  const attachChoices = useMemo(() => fileIndex.slice(0, 20), [fileIndex])

  const menuLen =
    menuMode === 'slash'
      ? slashItems.length
      : menuMode === 'mention'
        ? suggestions.length
        : menuMode === 'attach'
          ? attachChoices.length
          : 0

  // blocks 末条 usage 块 → token 用量小字
  const usageText = useMemo(() => {
    for (let i = wb.blocks.length - 1; i >= 0; i--) {
      const b = wb.blocks[i]
      if (b.kind === 'usage' && (b.inputTokens != null || b.outputTokens != null)) {
        return `${fmtTok(b.inputTokens)} in · ${fmtTok(b.outputTokens)} out`
      }
    }
    return null
  }, [wb.blocks])

  // T006 桥就绪后升级为窗口占比（session.contextInfo）；未就绪保持 tokens 小字
  const [ctxInfo, setCtxInfo] = useState<{ used: number; total: number } | null>(null)
  useEffect(() => {
    if (!features.contextInfo || !wb.activeSessionId) {
      setCtxInfo(null)
      return
    }
    let alive = true
    const sid = wb.activeSessionId
    void (async () => {
      try {
        const res = await (
          window.perigee as unknown as {
            session: { contextInfo?: (id: string) => Promise<unknown> }
          }
        ).session.contextInfo?.(sid)
        if (!alive || !res || typeof res !== 'object') return
        const r = res as Record<string, unknown>
        // 分母只认窗口上限，勿把 totalTokens（账单向）当窗口
        const used = (r.usedTokens ?? r.used) as number | undefined
        const total = (r.windowTokens ?? r.limit) as number | undefined
        if (
          used != null &&
          total != null &&
          total > 0 &&
          used >= 0 &&
          used <= total * 1.05
        ) {
          setCtxInfo({ used, total })
        } else {
          // 无可靠上下文信号：退回 in/out 小字，不画误导进度条
          setCtxInfo(null)
        }
      } catch {
        /* 半就绪：保持 tokens 显示 */
      }
    })()
    return () => {
      alive = false
    }
  }, [features.contextInfo, wb.activeSessionId, usageText])

  const crossTargets = useMemo(
    () => wb.sessions.filter((s) => s.id !== wb.activeSessionId && s.kind !== 'side'),
    [wb.sessions, wb.activeSessionId]
  )

  /* ---------- 小工具 ---------- */

  const closeMenus = useCallback(() => {
    setMenuMode('none')
    setSuggestions([])
    setSlashItems([])
    setMentionStart(null)
    setSlashStart(null)
  }, [])

  const focusAt = useCallback((pos: number) => {
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }, [])

  const focusAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      const len = el.value.length
      el.setSelectionRange(len, len)
      setCaret(len)
    })
  }, [])

  const flashHint = useCallback((msg: string) => {
    setBridgeHint(msg)
    if (hintTimer.current != null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setBridgeHint(null), 3000)
  }, [])

  const addAttachment = useCallback((path: string) => {
    setAttachments((prev) =>
      prev.some((a) => a.path === path) || prev.length >= ATTACH_MAX
        ? prev
        : [...prev, { path }]
    )
  }, [])

  const refreshMenus = useCallback(
    (text: string, pos: number) => {
      const sq = getSlashQuery(text, pos)
      if (sq) {
        setMenuMode('slash')
        setSlashStart(sq.start)
        // 内建命令置顶（不进字母排序，防被 skills 挤出 12 条上限）
        const builtins = slashCatalog.filter((i) => i.builtin)
        const skillItems = slashCatalog.filter((i) => !i.builtin)
        setSlashItems([
          ...filterSlashItems(sq.query, builtins, builtins.length),
          ...filterSlashItems(sq.query, skillItems, 12)
        ] as SlashEntry[])
        setSuggestions([])
        setMentionStart(null)
        setActiveIdx(0)
        return
      }
      const mq = getMentionQuery(text, pos)
      if (mq) {
        setMenuMode('mention')
        setMentionStart(mq.start)
        setSuggestions(filterMentionCandidates(mq.query, fileIndex))
        setSlashItems([])
        setSlashStart(null)
        setActiveIdx(0)
        return
      }
      closeMenus()
    },
    [fileIndex, slashCatalog, closeMenus]
  )

  /* ---------- 菜单选中 ---------- */

  /** + 菜单「添加文件」：打开工作区文件索引附件选择器（沿用 attach 菜单路径） */
  const openAttachPicker = () => {
    setCrossOpen(false)
    setActiveIdx(0)
    setSuggestions([])
    setSlashItems([])
    setMentionStart(null)
    setSlashStart(null)
    setMenuMode('attach')
  }

  /* ⌘U（T017 快捷键总表）：壳层派 grok:add-files，这里打开附件选择器并聚焦输入框 */
  useEffect(() => {
    const onAddFiles = () => {
      if (disabled) return
      openAttachPicker()
      taRef.current?.focus()
    }
    window.addEventListener('grok:add-files', onAddFiles)
    return () => window.removeEventListener('grok:add-files', onAddFiles)
    // openAttachPicker 只写 setState（引用每帧新建但语义恒定），依赖只跟 disabled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  /** + 菜单「Slash 命令」：光标处插入 `/` 并聚焦，触发既有 slash 菜单（行首/空白后才生效，必要时补空格） */
  const insertSlash = () => {
    const pos = taRef.current?.selectionStart ?? draft.length
    const needSpace = pos > 0 && !/\s/.test(draft.charAt(pos - 1))
    const snippet = needSpace ? ' /' : '/'
    const next = draft.slice(0, pos) + snippet + draft.slice(pos)
    setDraft(next)
    focusAt(pos + snippet.length)
    refreshMenus(next, pos + snippet.length)
  }

  const pickMention = (path: string) => {
    if (mentionStart == null) return
    const pos = taRef.current?.selectionStart ?? caret
    const { text, caret: nextCaret } = applyMention(draft, pos, mentionStart, path)
    setDraft(text)
    closeMenus()
    focusAt(nextCaret)
  }

  const pickSlash = (item: SlashEntry) => {
    const executable = features.command && item.support !== 'unsupported'
    if (item.builtin && !executable) return // 置灰项不可选
    if (features.command && item.support !== 'unsupported') {
      // 选中即执行（T005 路由 session.command）：带上已输入的参数，清掉 /query，不作为消息发出
      const sid = wb.activeSessionId
      if (slashStart == null || !sid) return
      const pos = taRef.current?.selectionStart ?? caret
      const segment = draft.slice(slashStart + 1, pos) // `/` 之后到光标的已输入内容
      const args = segment.startsWith(item.label)
        ? segment.slice(item.label.length).trim()
        : ''
      const cmd = args ? `${item.label} ${args}` : item.label
      setDraft(draft.slice(0, slashStart) + draft.slice(pos))
      focusAt(slashStart)
      closeMenus()
      void (async () => {
        try {
          const res = await window.perigee.session.command(sid, cmd)
          if (res.status === 'error') {
            wb.setError(`/${cmd} 执行失败：${res.detail}`)
          } else if (res.status === 'unsupported') {
            flashHint(`/${cmd} 暂不支持：${res.detail}`)
          } else if (res.detail) {
            flashHint(res.detail)
          }
        } catch (err) {
          wb.setError(`slash 命令执行失败：${err instanceof Error ? err.message : String(err)}`)
        }
      })()
      return
    }
    // 桥未就绪：skills 维持旧行为（插入文本到光标处）
    if (slashStart == null) return
    const pos = taRef.current?.selectionStart ?? caret
    const { text, caret: nextCaret } = applySlashInsert(draft, pos, slashStart, item.insert)
    setDraft(text)
    closeMenus()
    focusAt(nextCaret)
  }

  const pickAttach = (path: string) => {
    closeMenus()
    if (classifyAttachPath(path) === 'file') {
      // 文本类 → 光标处插入 @path（Host 展开）
      const snippet = mentionSnippet(path)
      const pos = taRef.current?.selectionStart ?? draft.length
      setDraft(draft.slice(0, pos) + snippet + draft.slice(pos))
      focusAt(pos + snippet.length)
    } else {
      // image/pdf → 附件 chip（发送时走 mediaPaths）
      addAttachment(path)
      focusAt(taRef.current?.selectionStart ?? draft.length)
    }
  }

  const runActiveItem = () => {
    if (menuMode === 'slash') {
      const it = slashItems[activeIdx]
      if (it) pickSlash(it)
    } else if (menuMode === 'mention') {
      const p = suggestions[activeIdx]
      if (p) pickMention(p)
    } else if (menuMode === 'attach') {
      const p = attachChoices[activeIdx]
      if (p) pickAttach(p)
    }
  }

  /* ---------- 发送 ---------- */

  const submit = () => {
    /* T026-返修 3：与按钮同一判据——流式中 Enter 也不许发（不留回车后门） */
    if (!canSubmit({ busy: wb.busy, disabled, draft, attachmentCount: attachments.length })) return
    const mediaPaths = mediaPathsFromAttachments(attachments)
    const merged = mergeAttachmentsIntoDraft(draft, attachments)
    if (!merged && mediaPaths.length === 0) return
    void wb.send(merged || '请查看附件', undefined, {
      mediaPaths: mediaPaths.length ? mediaPaths : undefined
    })
    // 提示词历史：按会话持久化
    const sid = wb.activeSessionId
    if (sid) {
      const next = recordEntry(histEntries, merged)
      if (next !== histEntries) {
        setHistEntries(next)
        saveHistory(sid, next)
      }
    }
    setHistNav(resetNav())
    setDraft('')
    setAttachments([])
    closeMenus()
  }

  /* ---------- 贴图 / 拖放（T002 负释放修复） ---------- */

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const hasImage = Array.from(items).some(
      (it) => it.kind === 'file' && it.type.startsWith('image/')
    )
    if (!hasImage) return // 纯文本粘贴不拦截
    e.preventDefault()
    if (!features.saveClipboardImage) {
      flashHint('贴图/拖放需 T005 桥接（桥接中）')
      return
    }
    void (async () => {
      try {
        const p = asPath(await t006().clipboard?.saveImage?.())
        if (p) addAttachment(p)
        else flashHint('贴图保存失败：桥未返回路径')
      } catch {
        flashHint('贴图保存失败（桥异常）')
      }
    })()
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault() // 阻止浏览器直接打开文件
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length === 0) return
    if (!features.filePathForDrop) {
      flashHint('贴图/拖放需 T005 桥接（桥接中）')
      return
    }
    void (async () => {
      let failed = false
      for (const f of files) {
        try {
          const p = asPath(await t006().fs?.pathForFile?.(f))
          if (p) addAttachment(p)
          else failed = true
        } catch {
          failed = true
        }
      }
      if (failed) flashHint('部分拖放文件取路径失败')
    })()
  }

  /* ---------- 跨会话投递 ---------- */

  const deliverCross = (toId: string) => {
    const text = draft.trim()
    const from = wb.activeSessionId
    setCrossOpen(false)
    if (!from || !text) return
    void (async () => {
      try {
        const r = await window.perigee.session.sendCross(from, toId, text)
        if (r?.ok) setDraft('')
        else wb.setError(`跨会话投递失败：${r?.reason ?? '未知原因'}`)
      } catch (err) {
        wb.setError(`跨会话投递失败：${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }

  /* ---------- 键盘流（纲领 §3） ---------- */

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. 菜单打开：↑↓ 选择 · Enter 确认 · Esc 关闭（不冒泡给外层关面板）
    if (menuLen > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, menuLen - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        runActiveItem()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeMenus()
        return
      }
    }
    // 2. Shift+Tab：权限四态循环
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      const order = PERM_MODES.map((m) => m.id)
      const next = order[(order.indexOf(policy) + 1) % order.length]
      void wb.updateSettings({ permissionPolicy: next })
      return
    }
    // 3. 提示词历史：空输入 ↑ 进入；浏览中 ↑↓
    if (
      e.key === 'ArrowUp' &&
      (histNav.cursor !== null || draft === '') &&
      (histEntries.length > 0 || histNav.cursor !== null)
    ) {
      e.preventDefault()
      const r = navPrev(histEntries, histNav, draft)
      setHistNav(r.nav)
      if (r.value !== draft) {
        setDraft(r.value)
        focusAtEnd()
      }
      return
    }
    if (e.key === 'ArrowDown' && histNav.cursor !== null) {
      e.preventDefault()
      const r = navNext(histEntries, histNav)
      setHistNav(r.nav)
      setDraft(r.value)
      focusAtEnd()
      return
    }
    // 4. 历史浏览中 Esc：还原草稿退出（不冒泡）
    if (e.key === 'Escape' && histNav.cursor !== null) {
      e.preventDefault()
      e.stopPropagation()
      setDraft(histNav.draft)
      setHistNav(resetNav())
      focusAtEnd()
      return
    }
    // 5. Enter 发送 / Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  /* ---------- 渲染 ---------- */

  const placeholder = !wb.currentWorkspace
    ? t('先打开工作区，再派活…')
    : !wb.activeSessionId
      ? t('先新建或选中一个会话（⌘N）…')
      : t('给 Grok 派活…') // r02 B4：placeholder 不带快捷键提示

  /* T026：模型名显示层去 -build；settings 空则回退 CLI 默认 id */
  const modelLabel =
    resolveModelLabel(wb.settings?.model, wb.cliDefaultModel) || t('默认模型')

  return (
    <div className="composer-wrap">
      <div
        className="composer"
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // 焦点在 bar 按钮上时的 Esc（textarea 内的 Esc 已各自 stopPropagation）
          if (e.key !== 'Escape') return
          if (crossOpen) {
            e.stopPropagation()
            setCrossOpen(false)
          } else if (menuMode === 'attach') {
            e.stopPropagation()
            closeMenus()
            taRef.current?.focus()
          }
        }}
      >
        {(menuLen > 0 || menuMode === 'attach') && (
          <div className="popover slash-menu" role="listbox">
            {menuMode === 'slash' &&
              slashItems.map((it, i) => {
                // 桥未就绪：内建命令全置灰「桥接中」（skills 可插入）；
                // 桥就绪：按 capabilities 逐项判定，unsupported（如 rewind）明示「引擎暂不支持」
                const itemDisabled = it.builtin
                  ? !features.command || it.support === 'unsupported'
                  : features.command && it.support === 'unsupported'
                const disabledHint = !features.command
                  ? '桥接中'
                  : it.label === 'rewind'
                    ? '引擎暂不支持'
                    : '不支持'
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`menu-item${i === activeIdx ? ' is-active' : ''}${itemDisabled ? ' is-disabled' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (!itemDisabled) pickSlash(it)
                    }}
                  >
                    <Icon name={it.builtin ? 'command' : 'spark'} size={13} />
                    <span>/{it.label}</span>
                    {itemDisabled ? (
                      <span className="mi-hint">{disabledHint}</span>
                    ) : (
                      <>
                        {it.description ? <span className="mi-hint">{it.description}</span> : null}
                        {it.arg ? <span className="sm-arg">{it.arg}</span> : null}
                      </>
                    )}
                  </button>
                )
              })}
            {menuMode === 'mention' &&
              suggestions.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`menu-item${i === activeIdx ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickMention(p)
                  }}
                >
                  <Icon name="file" size={13} />
                  <span>{p}</span>
                </button>
              ))}
            {menuMode === 'attach' &&
              attachChoices.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`menu-item${i === activeIdx ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickAttach(p)
                  }}
                >
                  <Icon name="file" size={13} />
                  <span>{p}</span>
                </button>
              ))}
            {menuMode === 'attach' && attachChoices.length === 0 && (
              <div className="menu-label">未索引到工作区文件</div>
            )}
          </div>
        )}

        <PlusMenu
          open={plusPop.open}
          onClose={plusPop.close}
          anchorRef={plusAnchorRef}
          onAddFiles={openAttachPicker}
          onSlashCommands={insertSlash}
          onConnectors={() => wb.setSettingsOpen(true)}
          onCrossSession={
            wb.activeSessionId
              ? () => {
                  closeMenus()
                  setCrossOpen((v) => !v)
                }
              : undefined
          }
        />

        <EffortPopover
          open={effortPop.open}
          onClose={effortPop.close}
          anchorRef={effortAnchorRef}
          wb={wb}
          value={effort}
          onChange={setEffort}
          onHint={flashHint}
        />

        {crossOpen && (
          <div className="popover slash-menu" role="menu">
            <div className="menu-label">把当前输入投递到其他会话</div>
            {!wb.settings?.crossSessionSendEnabled ? (
              <div className="menu-label">未开启跨会话投递 —— 请先在「设置」中打开</div>
            ) : !draft.trim() ? (
              <div className="menu-label">输入框为空：先输入要投递的内容</div>
            ) : crossTargets.length === 0 ? (
              <div className="menu-label">没有其他可投递的会话</div>
            ) : (
              crossTargets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="menu-item"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    deliverCross(s.id)
                  }}
                >
                  <Icon name="message" size={13} />
                  <span>{s.title || s.id.slice(0, 8)}</span>
                  <span className="mi-hint">{String(s.status)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="composer-attach">
            {attachments.map((a) => {
              const k = classifyAttachPath(a.path)
              return (
                <span key={a.path} className="chip" title={a.path}>
                  <Icon name={k === 'image' ? 'image' : 'file'} size={12} />
                  <span>{a.path.split('/').pop()}</span>
                  <IconButton
                    tip={t('移除附件')}
                    icon="x"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((x) => x.path !== a.path))
                    }
                  />
                </span>
              )
            })}
          </div>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            const pos = e.target.selectionStart
            setCaret(pos)
            // 用户手动输入即退出历史浏览态
            if (histNav.cursor !== null) setHistNav(resetNav())
            refreshMenus(e.target.value, pos)
          }}
          onClick={(e) => {
            const pos = e.currentTarget.selectionStart
            setCaret(pos)
            refreshMenus(draft, pos)
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />

        <div className="composer-bar">
          <span ref={plusAnchorRef} data-pop-trigger="plus">
            <IconButton
              tip={t('添加文件、命令或扩展')}
              icon="plus"
              disabled={disabled}
              on={plusPop.open}
              onClick={() => {
                setCrossOpen(false)
                closeMenus()
                plusPop.toggle()
              }}
            />
          </span>
          <PermChip
            policy={policy}
            disabled={disabled}
            onChange={(p) => void wb.updateSettings({ permissionPolicy: p })}
          />
          <button
            type="button"
            className="chip chip-click"
            data-tip={t('切换模型（⌘M）')}
            onClick={onOpenModelPicker}
          >
            <span>{modelLabel}</span>
          </button>
          {wb.activeSessionId && (
            <button
              ref={effortAnchorRef}
              type="button"
              className="chip chip-click"
              data-pop-trigger="effort"
              data-tip={
                effortEnabled
                  ? t('推理强度')
                  : features.command
                    ? t('推理强度（引擎暂不支持）')
                    : t('推理强度（桥接中）')
              }
              disabled={!effortEnabled}
              onClick={() => {
                closeMenus()
                effortPop.toggle()
              }}
            >
              {/* r02 A2：chip 只显当前档文字（无查询 API，记本会话上次选择，缺省 Medium） */}
              <span>{effort ? EFFORT_LABEL[effort] : 'Medium'}</span>
            </button>
          )}
          {ctxInfo ? (
            <span className="ctx-meter" data-tip={t('上下文窗口占比')}>
              <span className="ctx-bar">
                <span style={{ width: `${Math.min(100, (ctxInfo.used / ctxInfo.total) * 100)}%` }} />
              </span>
              {`${fmtTok(ctxInfo.used)} / ${fmtTok(ctxInfo.total)}`}
            </span>
          ) : usageText ? (
            <span className="composer-hint">{usageText}</span>
          ) : null}
          <div className="cb-right">
            {/* T026-返修 3：发送 / 停止**互斥**——同一位置只有一个按钮（对齐 Grok CLI 原生行为）。
                流式中只有红色方形停止键；打断后 busy 落回 false，自动变回发送键。 */}
            {composerAction(wb.busy) === 'stop' ? (
              <button
                type="button"
                className="send-btn is-stop"
                data-tip={t('停止')}
                aria-label={t('停止')}
                onClick={() => void wb.cancel()}
              >
                <Icon name="stop" />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                data-tip={t('发送  ↵')}
                aria-label={t('发送  ↵')}
                disabled={
                  !canSubmit({
                    busy: wb.busy,
                    disabled,
                    draft,
                    attachmentCount: attachments.length
                  })
                }
                onClick={submit}
              >
                <Icon name="send" />
              </button>
            )}
          </div>
        </div>

        {bridgeHint && <div className="composer-hint">{bridgeHint}</div>}
      </div>
    </div>
  )
}
