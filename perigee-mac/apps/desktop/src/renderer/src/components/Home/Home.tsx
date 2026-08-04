import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import type { PermissionPolicy, SessionRecord } from '../../lib/perigee-api'
import { baseName, homeTilde, resolveModelLabel } from '../../lib/format'
import type { BridgeFeatures } from '../../state/features'
import type { Workbench } from '../../state/useWorkbench'
import { usePopover } from '../../lib/popovers'
import { useShowUsageCard } from '../../lib/ui-prefs'
import { useT } from '../../i18n'
import { Icon, IconButton } from '../ui'
import { UsageDashboard } from './UsageDashboard'
import { PermChip } from '../Composer/PermChip'
import { PlusMenu } from '../Composer/PlusMenu'
import { EffortPopover, type EffortLevel } from '../Composer/EffortPopover'
import { canSubmit, composerAction } from '../../state/composer-actions'
import { capabilityOf, fetchCommandCapabilities } from '../../state/features'
import {
  ATTACH_MAX,
  classifyAttachPath,
  mediaPathsFromAttachments,
  mergeAttachmentsIntoDraft,
  type AttachmentRef
} from '../../lib/attachments'

/** effort 档位 → chip 文字（与 Composer 一致） */
const EFFORT_LABEL: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
}

/** 权限四态（与 Composer 一致：AppSettings.permissionPolicy） */
const PERM_MODES: { id: PermissionPolicy; label: string }[] = [
  { id: 'ask', label: '询问' },
  { id: 'accept_edits', label: '改文件' },
  { id: 'plan', label: '计划' },
  { id: 'yolo', label: '放行' }
]

/** 五档时间感知问候语（claude-design 原型 greetingText） */
function greetingKey(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return '早上好'
  if (h >= 11 && h < 13) return '中午好'
  if (h >= 13 && h < 18) return '下午好'
  if (h >= 18 && h < 23) return '晚上好'
  return '夜深了'
}

/**
 * 主页（T014 重设计，对齐 claude-design 原型主页视图）：
 * 内容列 1010px 居中；问候语（26/600）与用量卡（500px）列内左对齐，卡右侧留空；
 * 输入框占满列宽沉底——上沿 chips（工作区名→选文件夹 / 分支 / worktree / + 添加文件），
 * 下沿控制条（+ 菜单 / 权限档 / 模型 / 推理力度 / 发送，与对话页 Composer 同一套组件）。
 * 拍板删减：不放「需要你 / 未读」会话行（那是侧栏状态点的职责）。
 * ⌘N = 回到本页并聚焦输入框（focusSignal 递增驱动）；会话在发送时才创建。
 */
export function Home({
  wb,
  features,
  focusSignal,
  onSelectSession,
  onOpenModelPicker
}: {
  wb: Workbench
  features: BridgeFeatures
  focusSignal: number
  onSelectSession: (id: string) => void
  onOpenModelPicker: () => void
}): JSX.Element {
  const t = useT()
  const showUsage = useShowUsageCard()
  const workspace = wb.currentWorkspace
  const hasWorkspace = !!workspace

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [branch, setBranch] = useState<string | null>(null)
  /** 与 WorktreeService 一致：仅 git 仓显示 worktree chip */
  const [isGit, setIsGit] = useState(false)
  const [effort, setEffort] = useState<EffortLevel | null>(null)
  const [effortCapable, setEffortCapable] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachChoices, setAttachChoices] = useState<string[]>([])
  const effortAnchorRef = useRef<HTMLButtonElement>(null)
  const plusAnchorRef = useRef<HTMLSpanElement>(null)
  const attachChipRef = useRef<HTMLButtonElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  /* T013 统一弹层：主页控制条的 + 菜单与 effort 滑杆 */
  const plusPop = usePopover('plus')
  const effortPop = usePopover('effort')

  /* effort 支持度探测（与会话内 Composer 统一） */
  useEffect(() => {
    if (!features.command) return
    let alive = true
    void fetchCommandCapabilities().then((caps) => {
      if (alive) setEffortCapable(capabilityOf(caps, 'effort') !== 'unsupported')
    })
    return () => {
      alive = false
    }
  }, [features.command])

  /* ⌘N 语义：信号变化即聚焦大输入框（挂载时也算一次） */
  useEffect(() => {
    taRef.current?.focus()
  }, [focusSignal])

  /* git 分支 + isGit：挂载 / 换工作区拉一次；非 git 隐藏分支与 worktree chip */
  useEffect(() => {
    setBranch(null)
    setIsGit(false)
    if (!workspace) return
    let alive = true
    window.perigee.integrations
      .ghStatus()
      .then((s) => {
        if (!alive) return
        setIsGit(!!s.isGit)
        setBranch(s.ok && s.branch ? s.branch : null)
      })
      .catch(() => {
        if (alive) {
          setIsGit(false)
          setBranch(null)
        }
      })
    return () => {
      alive = false
    }
  }, [workspace])

  /* 自适应高度（max 220px 由 CSS 限制） */
  const autogrow = useCallback(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const insertSlash = useCallback(() => {
    const el = taRef.current
    setDraft((v) => (v.startsWith('/') ? v : `/${v}`))
    autogrow()
    el?.focus()
  }, [autogrow])

  /** 上沿 + chip：添加工作区文件附件（文件夹 chip 才是选工作区） */
  const openAddFiles = useCallback(() => {
    if (!workspace) {
      void wb.openFolder()
      return
    }
    setAttachMenuOpen((v) => !v)
    void (async () => {
      try {
        const entries = await window.perigee.fs.list('.', 4)
        const paths = entries
          .filter((e) => !e.isDirectory)
          .map((e) => e.relativePath || e.path)
          .filter(Boolean)
          .slice(0, 80)
        setAttachChoices(paths)
      } catch {
        setAttachChoices([])
      }
    })()
  }, [workspace, wb])

  const pickAttach = useCallback((path: string) => {
    setAttachMenuOpen(false)
    if (classifyAttachPath(path) === 'file') {
      // 文本类 → 草稿前插入 @path（与 Composer 一致，Host 展开）
      const p = path.trim().replace(/\\/g, '/')
      const tag = p.includes(' ') ? `@"${p}"` : `@${p}`
      setDraft((v) => {
        const body = v.trim()
        return body ? `${tag} ${body}` : tag
      })
      taRef.current?.focus()
      return
    }
    setAttachments((prev) => {
      if (prev.some((a) => a.path === path) || prev.length >= ATTACH_MAX) return prev
      return [...prev, { path }]
    })
    taRef.current?.focus()
  }, [])

  /**
   * 发送（T025 乐观导航）：**点击即切对话页**，建会话 / 派活 / 刷列表全部挪到后台。
   * 旧顺序是 create → send → refreshSessions → 切页，三个 await 串行（create 还要建 worktree +
   * ACP session/new），2–3 秒都耗在首页干等。现在先 beginPendingSend 让壳层立刻换页并渲染
   * 「用户消息 + 等待态」，会话建好再 attach，失败则清掉乐观态自动退回首页并报错。
   */
  const submit = useCallback(() => {
    const text = draft.trim()
    if (
      !canSubmit({
        busy: wb.busy,
        disabled: !hasWorkspace || sending,
        draft,
        attachmentCount: attachments.length
      })
    )
      return
    setSending(true)

    const mediaPaths = mediaPathsFromAttachments(attachments)
    const merged = mergeAttachmentsIntoDraft(text, attachments)
    // 纯媒体附件时草稿可空，占位文案与 Composer 一致
    const displayText = merged || text || (mediaPaths.length ? '请查看附件' : '')
    if (!displayText && mediaPaths.length === 0) return

    /* ① 立刻切页：草稿清空 + 乐观态上屏（这一步是同步的，不 await 任何东西） */
    wb.beginPendingSend(displayText)
    setDraft('')
    setAttachments([])
    setAttachMenuOpen(false)
    if (taRef.current) taRef.current.style.height = 'auto'

    /* ② 后台把真会话跑起来 */
    void (async () => {
      try {
        let rec: SessionRecord
        try {
          rec = await window.perigee.session.create()
        } catch (e) {
          // 建会话失败：撤乐观态（activeSessionId 仍为空 → 壳层自动退回首页）+ 明确报错
          wb.clearPendingSend()
          setDraft(text) // 草稿还给用户，别让人白打一遍
          wb.setError(
            `${t('会话创建失败，已退回主页')}：${e instanceof Error ? e.message : String(e)}`
          )
          return
        }
        wb.attachPending(rec.id)
        onSelectSession(rec.id) // 真会话就位：对话页从乐观态平滑接到真实流

        // 首页选过推理强度：建会话后即下发（best-effort，失败不阻断发送）
        if (effort) {
          void window.perigee.session.command(rec.id, `effort ${effort}`).catch(() => {})
        }
        if (text.startsWith('/')) {
          // slash 命令选中即执行（T005 路由），不作为提示词发送
          try {
            const res = await window.perigee.session.command(rec.id, text.slice(1))
            if (res.status === 'error') wb.setError(`命令执行失败：${res.detail}`)
            else if (res.status === 'unsupported') wb.setError(`命令暂不支持：${res.detail}`)
          } catch (err) {
            wb.setError(`命令执行失败：${err instanceof Error ? err.message : String(err)}`)
          }
          wb.clearPendingSend() // slash 不会有用户消息回显，这里显式收尾
        } else {
          await wb.send(displayText, rec.id, {
            mediaPaths: mediaPaths.length ? mediaPaths : undefined
          })
        }
        await wb.refreshSessions() // 内部已 catch
      } finally {
        setSending(false)
      }
    })()
  }, [draft, hasWorkspace, sending, wb, onSelectSession, effort, t, attachments])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Tab：权限四态循环（与 Composer 同键盘流）
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      const order = PERM_MODES.map((m) => m.id)
      const cur = order.indexOf(policy)
      const next = order[(cur + 1) % order.length]!
      void wb.updateSettings({ permissionPolicy: next })
      return
    }
    // 中文输入法组词中的 Enter 不发送；流式中 Enter 同样不发（与按钮同判据，不留回车后门）
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (
        !canSubmit({
          busy: wb.busy,
          disabled: !hasWorkspace || sending,
          draft,
          attachmentCount: attachments.length
        })
      )
        return
      submit()
    }
  }

  const policy = wb.settings?.permissionPolicy ?? 'ask'

  return (
    <div className="home">
      <div className="home-col">
        <h1 className="home-greeting">
          <Icon name="spark" size={20} />
          <span>{t(greetingKey())}</span>
        </h1>

        {/* T017：设置 → 通用「主页显示用量卡」可关（关掉后只剩问候语与输入框） */}
        {showUsage ? <UsageDashboard enabled={features.stats} /> : null}

        {/* 输入框沉底：chips 在框上，控制条在框内下沿 */}
        <div className="home-composer">
          <div className="home-chips">
            {hasWorkspace ? (
              <>
                {/* 文件夹 chip = 切换工作区（不是 +） */}
                <button
                  type="button"
                  className="home-chip"
                  data-tip={`${t('打开其他文件夹…')} · ${homeTilde(workspace)}`}
                  aria-label={t('打开其他文件夹…')}
                  onClick={() => void wb.openFolder()}
                >
                  <Icon name="folder" size={12} />
                  <span>{baseName(workspace)}</span>
                </button>
                {branch ? (
                  <span className="home-chip is-mono">
                    <Icon name="branch" size={12} />
                    <span>{branch}</span>
                  </span>
                ) : null}
                {/* 非 git 仓无 worktree 能力：隐藏，避免 Desktop 等目录空勾误导 */}
                {isGit ? (
                  <button
                    type="button"
                    className="home-chip home-chip-check"
                    data-tip={t('新会话在独立的 git worktree 中运行，不动主工作区。')}
                    aria-pressed={wb.settings?.useWorktree ?? false}
                    onClick={() =>
                      void wb.updateSettings({ useWorktree: !(wb.settings?.useWorktree ?? false) })
                    }
                  >
                    <span className={`hc-box${wb.settings?.useWorktree ? ' is-on' : ''}`}>
                      {wb.settings?.useWorktree ? <Icon name="check" size={9} /> : null}
                    </span>
                    <span className="hc-label">worktree</span>
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="home-chip"
                data-tip={t('打开工作区')}
                aria-label={t('打开工作区')}
                onClick={() => void wb.openFolder()}
              >
                <Icon name="folder" size={12} />
                <span>{t('打开工作区')}</span>
              </button>
            )}
            {/* 上沿 + = 添加文件附件（无工作区时退回打开文件夹） */}
            <button
              ref={attachChipRef}
              type="button"
              className={`home-chip home-chip-plus${attachMenuOpen ? ' is-on' : ''}`}
              data-tip={hasWorkspace ? t('添加文件') : t('打开工作区')}
              aria-label={hasWorkspace ? t('添加文件') : t('打开工作区')}
              aria-expanded={attachMenuOpen}
              onClick={openAddFiles}
            >
              <Icon name="plus" size={12} />
            </button>
          </div>

          {attachMenuOpen && hasWorkspace ? (
            <div className="popover slash-menu home-attach-menu" role="listbox">
              {attachChoices.length === 0 ? (
                <div className="menu-label">未索引到工作区文件</div>
              ) : (
                attachChoices.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="option"
                    className="menu-item"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickAttach(p)
                    }}
                  >
                    <Icon name={classifyAttachPath(p) === 'image' ? 'image' : 'file'} size={13} />
                    <span>{p}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          <div className="home-box">
            {attachments.length > 0 ? (
              <div className="composer-attach home-attach">
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
            ) : null}
            <textarea
              ref={taRef}
              value={draft}
              rows={1}
              disabled={!hasWorkspace || sending}
              placeholder={hasWorkspace ? t('给 Grok 派个活…  /  唤起命令，@ 引用文件') : t('先打开一个工作区…')}
              onChange={(e) => {
                setDraft(e.target.value)
                autogrow()
              }}
              onKeyDown={onKeyDown}
            />
            <div className="home-bar">
              <span ref={plusAnchorRef} data-pop-trigger="plus">
                <button
                  type="button"
                  className={`home-plus${plusPop.open ? ' is-on' : ''}`}
                  data-tip={t('添加命令或扩展')}
                  aria-label={t('添加命令或扩展')}
                  disabled={!hasWorkspace}
                  onClick={plusPop.toggle}
                >
                  <Icon name="plus" size={15} />
                </button>
              </span>
              <PermChip
                policy={policy}
                disabled={!hasWorkspace}
                onChange={(p) => void wb.updateSettings({ permissionPolicy: p })}
              />
              <button
                type="button"
                className="chip chip-click is-mono"
                data-tip={t('切换模型（⌘M）')}
                onClick={onOpenModelPicker}
              >
                <span>
                  {resolveModelLabel(wb.settings?.model, wb.cliDefaultModel) || t('默认模型')}
                </span>
              </button>
              {effortCapable ? (
                <button
                  ref={effortAnchorRef}
                  type="button"
                  className="chip chip-click"
                  data-pop-trigger="effort"
                  data-tip={t('推理强度（新会话生效）')}
                  onClick={effortPop.toggle}
                >
                  <span>{effort ? EFFORT_LABEL[effort] : 'Medium'}</span>
                </button>
              ) : null}
              <div className="hb-right">
                <span className="hb-hint">{t('↵ 发送')}</span>
                {/* T026-返修 3：与对话页同一套互斥——忙时只有停止键，闲时只有发送键 */}
                {composerAction(wb.busy) === 'stop' ? (
                  <button
                    type="button"
                    className="home-send is-stop"
                    data-tip={t('停止')}
                    aria-label={t('停止')}
                    onClick={() => void wb.cancel()}
                  >
                    <Icon name="stop" size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="home-send"
                    data-tip={t('发送  ↵')}
                    aria-label={t('发送  ↵')}
                    disabled={
                      !canSubmit({
                        busy: wb.busy,
                        disabled: !hasWorkspace || sending,
                        draft,
                        attachmentCount: attachments.length
                      })
                    }
                    onClick={() => submit()}
                  >
                    <Icon name="send" size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <PlusMenu
            open={plusPop.open}
            onClose={plusPop.close}
            anchorRef={plusAnchorRef}
            onAddFiles={openAddFiles}
            onSlashCommands={insertSlash}
            onConnectors={() => wb.setSettingsOpen(true)}
          />
          <EffortPopover
            open={effortPop.open}
            onClose={effortPop.close}
            anchorRef={effortAnchorRef}
            wb={wb}
            value={effort}
            onChange={(lv) => setEffort(lv)}
            onHint={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
