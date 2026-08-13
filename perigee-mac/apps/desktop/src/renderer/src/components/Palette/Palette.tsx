import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import {
  capabilityOf,
  fetchCommandCapabilities,
  type BridgeFeatures
} from '../../state/features'
import {
  filterPaletteItems,
  groupPaletteItems,
  type PaletteGroup,
  type PaletteItem
} from '../../state/palette-items'
import { orderSessions } from '../../state/session-order'
import { useEffectiveTheme, setThemePref } from '../../lib/theme'
import type { CommandCapability, SkillEntry } from '../../lib/perigee-api'
import { useT, useI18n } from '../../i18n'
import { localizeUiText } from '../../lib/localize-ui-text'
import { Icon } from '../ui'

/**
 * ⌘K 统一命令面板（纲领 §2）：壳命令 + slash + 会话跳转 + 文件打开，一个模糊入口。
 * 数据层纯函数在 state/palette-items；此处只负责装配 run 闭包与键盘流。
 */

/** 内建 slash 命令（Grok CLI 侧路由执行） */
const BUILTIN_SLASH: { cmd: string; desc: string }[] = [
  { cmd: '/model', desc: '切换模型' },
  { cmd: '/effort', desc: '调整推理力度' },
  { cmd: '/compact', desc: '压缩上下文' },
  { cmd: '/rewind', desc: '回退到上一检查点' },
  { cmd: '/mcps', desc: 'MCP 服务器列表' }
]

/** 文件组防爆上限 */
const FILE_CAP = 200

/** 命令项图标（PaletteItem 无 icon 字段，本地按 id 映射） */
const ITEM_ICONS: Record<string, string> = {
  'cmd:new-session': 'plus',
  'cmd:open-workspace': 'folder-open',
  'cmd:close-workspace': 'x',
  'cmd:export': 'download',
  'cmd:terminal': 'terminal',
  'cmd:context': 'panel-right',
  'cmd:model': 'brain',
  'cmd:tasks': 'bot',
  'cmd:shortcuts': 'keyboard',
  'cmd:settings': 'settings',
  'cmd:theme-dark': 'moon',
  'cmd:theme-light': 'sun'
}

const GROUP_ICONS: Record<PaletteGroup, string> = {
  命令: 'command',
  最近工作区: 'folder-open',
  Slash: 'spark',
  会话: 'message',
  文件: 'file'
}

export function Palette({
  wb,
  features,
  open,
  onClose,
  onOpenSettings,
  onOpenShortcuts,
  onOpenTasks,
  onGoHome
}: {
  wb: Workbench
  features: BridgeFeatures
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenTasks: () => void
  /** T009：「新建会话」= 去首页聚焦输入框（会话发送时才创建） */
  onGoHome: () => void
}): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const t = useT()
  const { lang } = useI18n()
  const effectiveTheme = useEffectiveTheme()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [cmdCaps, setCmdCaps] = useState<CommandCapability[] | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /* 打开：重置查询/选中，自动聚焦 */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    inputRef.current?.focus()
  }, [open])

  /* Slash 技能目录：打开时拉一次（与 Composer 同源） */
  useEffect(() => {
    if (!open) return
    let alive = true
    void window.perigee.integrations
      .listSkills()
      .then((list) => alive && setSkills(list))
      .catch(() => alive && setSkills([]))
    return () => {
      alive = false
    }
  }, [open])

  /* T005 命令能力表：打开且桥存在时拉一次（rewind 等 unsupported 据此明示） */
  useEffect(() => {
    if (!open || !features.command) return
    let alive = true
    void fetchCommandCapabilities().then((caps) => {
      if (alive) setCmdCaps(caps)
    })
    return () => {
      alive = false
    }
  }, [open, features.command])

  /* 文件索引：打开且有工作区时懒建（防爆上限 FILE_CAP） */
  useEffect(() => {
    if (!open) {
      setFiles([])
      return
    }
    if (!wb.currentWorkspace) {
      setFiles([])
      return
    }
    let alive = true
    void window.perigee.fs
      .list('.', 4)
      .then((entries) => {
        if (!alive) return
        setFiles(
          entries
            .filter((e) => !e.isDirectory)
            .map((e) => e.relativePath.replace(/^\.\//, ''))
            .slice(0, FILE_CAP)
        )
      })
      .catch(() => alive && setFiles([]))
    return () => {
      alive = false
    }
  }, [open, wb.currentWorkspace])

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = []
    /* T013：主题命令改走 uiState 机制（三档里的显式浅/深切换） */
    const nextTheme = effectiveTheme === 'dark' ? 'light' : 'dark'

    /* ---- 命令组 ---- */
    out.push(
      {
        id: 'cmd:new-session',
        group: '命令',
        title: t('新建会话'),
        hint: '⌘N',
        run: () => onGoHome()
      },
      {
        id: 'cmd:open-workspace',
        group: '命令',
        title: t('打开工作区'),
        run: () => void wb.openFolder()
      },
      {
        id: 'cmd:close-workspace',
        group: '命令',
        title: t('关闭工作区'),
        sub: wb.currentWorkspace ?? undefined,
        disabled: !wb.currentWorkspace,
        run: () => void wb.closeWorkspace()
      },
      {
        id: 'cmd:export',
        group: '命令',
        title: t('导出 Markdown'),
        disabled: !wb.activeSessionId,
        run: () => void wb.exportSession()
      },
      {
        id: 'cmd:terminal',
        group: '命令',
        title: t('切换终端抽屉'),
        hint: '⌘`',
        run: () => wb.toggleTerminalPane()
      },
      {
        id: 'cmd:context',
        group: '命令',
        title: t('切换上下文面板'),
        hint: '⌘I',
        run: () => {
          if (wb.inspector.kind !== 'closed') {
            wb.closeInspector()
          } else {
            const cur = wb.settings?.layout.panes?.file ?? false
            wb.persistLayout({ panes: { file: !cur } })
          }
        }
      },
      {
        id: 'cmd:model',
        group: '命令',
        title: t('切换模型（⌘M）'),
        hint: '⌘M',
        disabled: !wb.activeSessionId,
        run: () => {
          // ModelPicker 的开关在 App 层（⌘M keymap），回放同一键位打开，避免另开通道
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', metaKey: true }))
        }
      },
      {
        id: 'cmd:tasks',
        group: '命令',
        title: t('任务面板'),
        disabled: !wb.activeSessionId,
        run: () => onOpenTasks()
      },
      {
        id: 'cmd:shortcuts',
        group: '命令',
        title: t('快捷键表'),
        run: () => onOpenShortcuts()
      },
      {
        id: 'cmd:settings',
        group: '命令',
        title: t('设置'),
        hint: '⌘,',
        run: () => onOpenSettings()
      },
      {
        id: `cmd:theme-${nextTheme}`,
        group: '命令',
        title: nextTheme === 'dark' ? t('切换到暗色主题') : t('切换到浅色主题'),
        run: () => setThemePref(nextTheme)
      }
    )

    /* ---- 最近工作区（T016 删侧栏工作区卡后的归口；数据 = wb.recent，能力 = wb.openRecent） ---- */
    for (const r of wb.recent) {
      out.push({
        id: `recent:${r.path}`,
        group: '最近工作区',
        title: r.name,
        sub: r.path,
        hint: r.path === wb.currentWorkspace ? '当前' : undefined,
        disabled: r.path === wb.currentWorkspace,
        run: () => void wb.openRecent(r.path)
      })
    }

    /* ---- Slash 组：按 commandCapabilities 逐项点亮；unsupported（rewind）明示，不做假按钮 ---- */
    const sid = wb.activeSessionId
    const runSlash = (cmd: string) => () => {
      if (!sid) return
      void (async () => {
        try {
          const res = await window.perigee.session.command(sid, cmd)
          if (res.status === 'error')
            wb.setError(`/${cmd} ${t('执行失败')}：${res.detail}`)
          else if (res.status === 'unsupported')
            wb.setError(`/${cmd} ${t('暂不支持')}：${res.detail}`)
        } catch (err) {
          wb.setError(
            `${t('slash 命令执行失败')}：${err instanceof Error ? err.message : String(err)}`
          )
        }
      })()
    }
    const slashItem = (
      id: string,
      cmdName: string,
      title: string,
      sub?: string
    ): PaletteItem => {
      const support = features.command ? capabilityOf(cmdCaps, cmdName) : 'unsupported'
      const disabled = !features.command || !sid || support === 'unsupported'
      const hint = !features.command
        ? t('桥接中')
        : !sid
          ? t('无活动会话')
          : support === 'unsupported'
            ? cmdName === 'rewind'
              ? t('引擎暂不支持')
              : t('不支持')
            : undefined
      return { id, group: 'Slash', title, sub, hint, disabled, run: runSlash(cmdName) }
    }
    for (const b of BUILTIN_SLASH) {
      out.push(slashItem(`slash:${b.cmd}`, b.cmd.replace(/^\//, ''), b.cmd, b.desc))
    }
    for (const s of skills) {
      // 命令名必须是 skill 自身 name，不能写死 'skill'（审计 Z7-01）
      out.push(slashItem(`slash:skill:${s.name}`, s.name, `/${s.name}`, s.description))
    }

    /* ---- 会话组（顺序与 ⌘1…9 一致） ---- */
    orderSessions(wb.sessions).forEach((s, i) => {
      out.push({
        id: `session:${s.id}`,
        group: '会话',
        title: s.title,
        sub: (() => {
          const preview = wb.lastActivity.get(s.id)
          return preview ? localizeUiText(preview, lang) : undefined
        })(),
        hint: s.id === wb.activeSessionId ? '当前' : i < 9 ? `⌘${i + 1}` : undefined,
        run: () => wb.setActiveSession(s.id)
      })
    })

    /* ---- 文件组 ---- */
    for (const rel of files) {
      out.push({
        id: `file:${rel}`,
        group: '文件',
        title: rel,
        run: () => wb.openPath(rel)
      })
    }

    return out
  }, [
    wb,
    t,
    lang,
    features.command,
    cmdCaps,
    skills,
    files,
    effectiveTheme,
    onOpenSettings,
    onOpenShortcuts,
    onOpenTasks,
    onGoHome
  ])

  const filtered = useMemo(() => filterPaletteItems(items, query), [items, query])
  const grouped = useMemo(() => groupPaletteItems(filtered), [filtered])

  /* 查询变化：选中回到首个可执行项 */
  useEffect(() => {
    const i = filtered.findIndex((it) => !it.disabled)
    setCursor(i === -1 ? 0 : i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  /* 异步项到达/过滤变短：钳制光标 */
  useEffect(() => {
    setCursor((c) => (c >= filtered.length ? Math.max(0, filtered.length - 1) : c))
  }, [filtered.length])

  /* 选中项滚动可见 */
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-pi="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const exec = (it: PaletteItem | undefined) => {
    if (!it || it.disabled) return
    onClose()
    it.run()
  }

  const move = (dir: 1 | -1) => {
    if (filtered.length === 0) return
    let next = cursor
    for (let step = 0; step < filtered.length; step++) {
      next = (next + dir + filtered.length) % filtered.length
      if (!filtered[next].disabled) break
    }
    setCursor(next)
  }

  /* 分组渲染（组序固定：命令 → Slash → 会话 → 文件），index 为扁平光标位 */
  const rows: ({ type: 'label'; label: string } | { type: 'item'; item: PaletteItem; index: number })[] =
    []
  for (const [g, list] of grouped) {
    rows.push({ type: 'label', label: g })
    for (const it of list) rows.push({ type: 'item', item: it, index: filtered.indexOf(it) })
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('搜索命令、会话、文件…')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                move(-1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                exec(filtered[cursor])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="menu-label">{t('没有匹配项')}</div>
          ) : (
            rows.map((r) =>
              r.type === 'label' ? (
                <div key={`g:${r.label}`} className="menu-label">
                  {t(r.label)}
                </div>
              ) : (
                <button
                  key={r.item.id}
                  type="button"
                  data-pi={r.index}
                  className={`palette-item${r.index === cursor ? ' is-active' : ''}${r.item.disabled ? ' is-disabled' : ''}`}
                  onMouseEnter={() => setCursor(r.index)}
                  onClick={() => exec(r.item)}
                >
                  <Icon name={ITEM_ICONS[r.item.id] ?? GROUP_ICONS[r.item.group]} />
                  <span className="pi-title">{r.item.title}</span>
                  {r.item.sub ? <span className="pi-sub">{t(r.item.sub)}</span> : null}
                  {r.item.hint ? (
                    <span className="pi-hint">
                      {r.item.hint.startsWith('⌘') ? (
                        <kbd>{r.item.hint}</kbd>
                      ) : r.item.hint === '当前' ? (
                        <span className="chip chip-accent">
                          <span>{t('当前')}</span>
                        </span>
                      ) : (
                        t(r.item.hint)
                      )}
                    </span>
                  ) : null}
                </button>
              )
            )
          )}
        </div>
        <div className="palette-foot">
          <span>{t('↑↓ 选择')}</span>
          <span>{t('↵ 执行')}</span>
          <span>{t('esc 关闭')}</span>
        </div>
      </div>
    </div>
  )
}
