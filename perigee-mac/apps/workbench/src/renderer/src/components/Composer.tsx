import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AGENT_PERM_MODES, modeLabel, modeOfficial } from '../../../shared/agent-mode'
import type { InspectSkill } from '../../../shared/inspect'
import {
  buildSlashItems,
  filterSlashItems,
  formatQueuedPreview,
  getSlashQuery,
  resolveSlashLine,
  type SlashItem
} from '../../../shared/slash-palette'
import type { AgentModeState, AgentPermMode, QueuedTurn } from '../../../shared/types'
import { EFFORT_LEVELS, effortLabel } from '../../../shared/runtime-flags'
import { useWorkbench } from '../state'
import { IconSend } from './Icons'
import { SlashPalette } from './SlashPalette'

type Props = {
  variant: 'hero' | 'dock'
  placeholder: string
  onSubmit: (text: string) => Promise<void>
  onBrowseMcp?: () => void
  onNotice?: (text: string) => void
  onExport?: (dest: 'file' | 'clipboard') => Promise<void>
  onContext?: () => void
  queued?: QueuedTurn[]
  engineLabel?: string
  disabled?: boolean
}

function shortNote(agent?: AgentModeState | null): string {
  if (!agent) return '本机闭环 · 档跟 CLI'
  const bits: string[] = []
  if (agent.cliMode === 'always-approve' && agent.mode !== 'always-approve') {
    bits.push('CLI 已全放行，窗上改档盖不住')
  } else if (agent.mode === 'always-approve' && agent.cliMode !== 'always-approve') {
    bits.push('本窗全放行 · 没改 CLI 配置')
  } else if (agent.mode === 'auto' && agent.cliMode !== 'auto') {
    bits.push('本窗自动 · 危险的仍会问')
  } else if (agent.mode === 'ask' && agent.cliMode === 'auto') {
    bits.push('CLI 是自动；窗上问我盖不住 CLI 先放行的')
  }
  if (agent.plan) bits.push('Plan：先写计划再改')
  return bits.length ? bits.join(' · ') : '本机闭环 · 档跟 CLI'
}

export function Composer({
  variant,
  placeholder,
  onSubmit,
  onBrowseMcp,
  onNotice,
  onExport,
  onContext,
  queued,
  engineLabel = 'Grok',
  disabled = false
}: Props) {
  const { state, setAgentMode, setAgentPlan, setAgentModel, setAgentEffort } = useWorkbench()
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [skills, setSkills] = useState<InspectSkill[]>([])
  const [skillsReady, setSkillsReady] = useState(false)
  const [active, setActive] = useState(0)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0 && !busy && !disabled
  const agent = state?.agent
  const models = state?.models
  const cover = agent?.coverNote ?? null
  const line = shortNote(agent)
  const more = cover && cover !== line ? cover : null
  const modelList = models?.list ?? []
  const currentModel = models?.current ?? ''
  const hasCli = Boolean(state?.grok.cli)
  const slash = getSlashQuery(text, caret)
  const catalog = useMemo(() => buildSlashItems(skills), [skills])
  const shown = useMemo(
    () => (slash ? filterSlashItems(slash.query, catalog) : []),
    [slash, catalog]
  )
  const paletteOpen = Boolean(slash) && !disabled
  const queuePreview = formatQueuedPreview(queued)
  const highlight = shown.length ? Math.min(active, shown.length - 1) : 0
  const tell = (msg: string) => {
    onNotice?.(msg)
    if (!onNotice) setLocalNotice(msg)
  }

  useEffect(() => {
    setNoteOpen(false)
  }, [agent?.mode, agent?.plan, agent?.cliMode, cover, currentModel])

  useEffect(() => {
    setActive(0)
  }, [slash?.query, shown.length])

  useEffect(() => {
    if (!paletteOpen || skillsReady) return
    let gone = false
    const api = window.workbench
    if (!api || typeof api.inspect !== 'function') {
      setSkillsReady(true)
      return
    }
    void api.inspect().then((r) => {
      if (gone) return
      if (r.ok) setSkills(r.report.skills)
      setSkillsReady(true)
    })
    return () => {
      gone = true
    }
  }, [paletteOpen, skillsReady])

  const doExport = async (dest: 'file' | 'clipboard') => {
    if (onExport) {
      await onExport(dest)
      return
    }
    const api = window.workbench
    if (!api || typeof api.exportCurrent !== 'function') {
      tell('这个窗口还没有导出接口')
      return
    }
    try {
      const r = await api.exportCurrent({ dest })
      tell(r.ok ? r.detail || '已导出' : r.error || '导出失败')
    } catch (err) {
      tell(err instanceof Error ? err.message : String(err))
    }
  }

  const showContext = () => {
    if (onContext) {
      onContext()
      return
    }
    tell('终端里 /context 才有实时占用。官方没有 grok context，inspect 也不报这条此刻占了多少。')
  }

  const runItem = async (item: SlashItem) => {
    if (item.kind === 'tui-only') {
      tell(item.hint)
      return
    }
    if (item.kind === 'local') {
      setText('')
      if (item.local === 'export-file') {
        await doExport('file')
        return
      }
      if (item.local === 'export-clip') {
        await doExport('clipboard')
        return
      }
      if (item.local === 'context') {
        showContext()
        return
      }
      if (item.local === 'queue') {
        tell(queuePreview ? `下一句已排上：${queuePreview}` : '没有排队的下一句')
        return
      }
      return
    }
    const next = item.sendText || `/${item.name}`
    setText('')
    setBusy(true)
    try {
      await onSubmit(next)
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!canSend) return
    const next = text
    const resolved = resolveSlashLine(next)
    if (resolved.action === 'block') {
      tell(resolved.message)
      setText('')
      return
    }
    if (resolved.action === 'export-file') {
      setText('')
      await doExport('file')
      return
    }
    if (resolved.action === 'export-clip') {
      setText('')
      await doExport('clipboard')
      return
    }
    if (resolved.action === 'context') {
      setText('')
      showContext()
      return
    }
    if (resolved.action === 'queue') {
      setText('')
      tell(queuePreview ? `下一句已排上：${queuePreview}` : '没有排队的下一句')
      return
    }
    setText('')
    setBusy(true)
    try {
      await onSubmit(resolved.action === 'send' ? resolved.text : next)
    } finally {
      setBusy(false)
    }
  }

  const onForm = (e: FormEvent) => {
    e.preventDefault()
    void send()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen && shown.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => (i + 1) % shown.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i - 1 + shown.length) % shown.length)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setText(text.slice(0, slash?.start ?? 0))
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        const item = shown[highlight]
        if (item && item.kind !== 'tui-only') {
          e.preventDefault()
          void runItem(item)
          return
        }
        if (item?.kind === 'tui-only') {
          e.preventDefault()
          tell(item.hint)
          return
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const pickMode = (mode: AgentPermMode) => {
    void setAgentMode(mode)
  }

  return (
    <form className={`composer composer-${variant}`} onSubmit={onForm}>
      {paletteOpen ? (
        <SlashPalette
          items={shown}
          active={highlight}
          placement={variant === 'dock' ? 'up' : 'down'}
          queuePreview={queuePreview || undefined}
          onHover={setActive}
          onPick={(item) => void runItem(item)}
        />
      ) : null}
      <textarea
        ref={box}
        className="composer-input"
        value={text}
        placeholder={placeholder}
        rows={variant === 'hero' ? 4 : 2}
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKey}
      />
      {queuePreview && !paletteOpen ? (
        <p className="composer-queue" title={queuePreview}>
          已排上：{queuePreview}
        </p>
      ) : null}
      {localNotice && !onNotice ? (
        <p className="composer-queue" role="status">
          {localNotice}
        </p>
      ) : null}
      <div className="composer-bar">
        <div className="composer-meta">
          {hasCli && modelList.length ? (
            <label className="composer-model-wrap">
              <span className="sr-only">模型</span>
              <select
                className="composer-model"
                value={currentModel}
                aria-label="模型"
                title="下一轮用这个模型。来自本机 grok models。"
                onChange={(e) => void setAgentModel(e.target.value)}
              >
                {modelList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {m.isDefault ? ' · 默认' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="composer-engine">{engineLabel}</span>
          )}
          <label className="composer-model-wrap">
            <span className="sr-only">推理力度</span>
            <select
              className="composer-model"
              value={agent?.effort ?? ''}
              aria-label="推理力度"
              title="官方 --effort。空着跟 CLI。"
              onChange={(e) => void setAgentEffort(e.target.value)}
            >
              <option value="">{effortLabel('')}</option>
              {EFFORT_LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {effortLabel(lv)}
                </option>
              ))}
            </select>
          </label>
          {onBrowseMcp ? (
            <button type="button" className="chip" onClick={onBrowseMcp}>
              MCP
            </button>
          ) : null}
          <span className="composer-modes" role="group" aria-label="权限档">
            {AGENT_PERM_MODES.map((mode) => {
              const on = agent?.mode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  className={on ? 'chip is-on' : 'chip'}
                  aria-pressed={on}
                  title={`${modeOfficial(mode)} · ${mode}`}
                  onClick={() => pickMode(mode)}
                >
                  {modeLabel(mode)}
                </button>
              )
            })}
            <button
              type="button"
              className={agent?.plan ? 'chip is-on' : 'chip'}
              aria-pressed={agent?.plan === true}
              title="Plan mode"
              onClick={() => void setAgentPlan(!(agent?.plan === true))}
            >
              Plan
            </button>
          </span>
        </div>
        <div className="composer-actions">
          <button type="submit" className="send-btn" aria-label="发送" disabled={!canSend}>
            <IconSend />
          </button>
        </div>
      </div>
      <div className={noteOpen && more ? 'composer-note is-open' : 'composer-note'}>
        {more ? (
          <button
            type="button"
            className="composer-note-btn"
            aria-expanded={noteOpen}
            title={cover ?? line}
            onClick={() => setNoteOpen((v) => !v)}
          >
            <span className="composer-note-line">{noteOpen ? more : line}</span>
          </button>
        ) : (
          <p className="composer-note-line" title={line}>
            {line}
          </p>
        )}
      </div>
    </form>
  )
}
