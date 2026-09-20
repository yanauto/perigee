import { useEffect, useRef, useState } from 'react'
import type { AppState, Session } from '../../../shared/types'
import {
  CONTEXT_UNKNOWN,
  contextUsageFromInspect,
  formatQueuedPreview,
  type ContextUsageHint,
  type ExportDest
} from '../../../shared/slash-palette'
import { folderName } from '../../../shared/workspace'
import { AssistantMarkdown } from '../components/AssistantMarkdown'
import { Composer } from '../components/Composer'
import { useWorkbench } from '../state'

function elapsedSec(startedAt: number | undefined, nowTs: number): number {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((nowTs - startedAt) / 1000))
}

function LiveLine({ session, nowTs }: { session: Session; nowTs: number }) {
  const lastText = session.messages.at(-1)?.text ?? ''
  const live = session.status === 'streaming' || session.status === 'waiting'
  const sec = elapsedSec(session.turnStartedAt, nowTs)
  const connecting = Boolean(session.cliSessionId && session.messages.length === 0)
  const hasAssistant = session.messages.some(
    (m) => m.role === 'assistant' && m.text.trim() && !m.text.startsWith('工具 ·')
  )
  const queued = session.queued?.length ?? 0
  const preview = formatQueuedPreview(session.queued)

  if (lastText === '这一轮已取消' && !live) {
    return <div className="status-line">已取消</div>
  }
  if (session.status === 'error') {
    return <div className="status-line">失败</div>
  }
  if (session.status === 'waiting') {
    return (
      <div className="status-line is-live">
        <span className="live-pulse" aria-hidden />
        <span>要你批准{sec ? ` · 已等 ${sec} 秒` : ''}</span>
      </div>
    )
  }
  if (session.status === 'streaming') {
    const wait = `已等 ${sec} 秒`
    const head = connecting ? `正在接上 · ${wait}` : `还在回 · ${wait}`
    const honest =
      session.streamHint === 'delta' || hasAssistant ? '' : ' · 整段到齐才显示'
    const q = queued && preview ? ` · 已排上：${preview}` : ''
    return (
      <div className="status-line is-live">
        <span className="live-pulse" aria-hidden />
        <span>
          {head}
          {honest}
          {q}
        </span>
      </div>
    )
  }
  if (queued) {
    return <div className="status-line">下一句已排上{preview ? `：${preview}` : ''}，回完就发</div>
  }
  return null
}

export function Chat({ state }: { state: AppState }) {
  const { submit, cancel, allow, deny } = useWorkbench()
  const session = state.sessions.find((s) => s.id === state.activeSessionId) ?? state.sessions[0]
  const bottom = useRef<HTMLDivElement>(null)
  const lastText = session?.messages.at(-1)?.text ?? ''
  const engineLabel = state.grok.cli ? 'Grok' : '未接 Grok'
  const live = session?.status === 'streaming' || session?.status === 'waiting'
  const ask = session?.pendingAsk
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const [usage, setUsage] = useState<ContextUsageHint>({
    kind: 'unknown',
    label: CONTEXT_UNKNOWN,
    detail: '还没读 inspect。'
  })
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [compactBusy, setCompactBusy] = useState(false)

  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => setNowTs(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [live, session?.id, session?.turnStartedAt])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [session?.messages.length, lastText, session?.status])

  useEffect(() => {
    let gone = false
    const api = window.workbench
    if (!api || typeof api.inspect !== 'function') {
      setUsage(contextUsageFromInspect(null))
      return
    }
    void api.inspect().then((r) => {
      if (gone) return
      setUsage(contextUsageFromInspect(r.ok ? r.report : null))
    })
    return () => {
      gone = true
    }
  }, [state.workspace.path, session?.id])

  const empty = !session || session.messages.length === 0
  const sessionFolder = session?.workspacePath ? folderName(session.workspacePath) : null
  const sub = session?.cliSessionId
    ? `${sessionFolder ?? 'CLI'} · 续聊`
    : (sessionFolder ?? state.workspace.name ?? '还没打开文件夹')
  const emptyHint =
    session?.cliSessionId && session.status === 'streaming'
      ? '正在接上这条 CLI 会话…'
      : session?.cliSessionId
        ? '已接上。没有回放出历史时，这里只有新消息。'
        : '先发一句。'

  const showNotice = (text: string) => {
    setNotice(text)
    setExportOpen(false)
  }

  const runExport = async (dest: ExportDest) => {
    const api = window.workbench
    if (!api || typeof api.exportCurrent !== 'function') {
      showNotice('这个窗口还没有导出接口')
      return
    }
    setExportBusy(true)
    setExportOpen(false)
    try {
      const r = await api.exportCurrent({ dest })
      if (r.ok) showNotice(r.detail || (dest === 'clipboard' ? '已复制' : '已写出文件'))
      else showNotice(r.error || '导出失败')
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setExportBusy(false)
    }
  }

  const runCompact = async () => {
    const api = window.workbench
    setCompactBusy(true)
    try {
      if (api && typeof api.compactCurrent === 'function') {
        const r = await api.compactCurrent()
        if (!r.ok) showNotice(r.error || '压上下文失败')
      } else {
        await submit('/compact')
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setCompactBusy(false)
    }
  }

  return (
    <div className="stage-chat">
      <header className="chat-head">
        <div>
          <div className="chat-title">{session?.title ?? '对话'}</div>
          <div className="chat-sub">{sub}</div>
        </div>
        <div className="chat-head-actions">
          <button
            type="button"
            className="chat-usage"
            title={usage.detail}
            onClick={() => showNotice(`${usage.label}。${usage.detail}`)}
          >
            {usage.label}
          </button>
          <button
            type="button"
            className="btn-ghost chat-head-btn"
            disabled={compactBusy}
            title="对当前会话发 /compact。官方没有 grok compact 子命令。"
            onClick={() => void runCompact()}
          >
            压上下文
          </button>
          <div className="export-wrap">
            <button
              type="button"
              className="btn-ghost chat-head-btn"
              disabled={exportBusy}
              title="走 grok export <这条的官方 id>"
              onClick={() => setExportOpen((v) => !v)}
            >
              导出
            </button>
            {exportOpen ? (
              <div className="export-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void runExport('file')}>
                  存成文件
                </button>
                <button type="button" role="menuitem" onClick={() => void runExport('clipboard')}>
                  复制到剪贴板
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {notice ? (
        <div className="chat-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="chat-notice-close" onClick={() => setNotice(null)}>
            关掉
          </button>
        </div>
      ) : null}

      <div className="chat-scroll">
        <div className="chat-col">
          {empty ? (
            <div className="state-msg">{emptyHint}</div>
          ) : (
            <>
              {session.messages.map((m, i) => (
                <article key={m.id} className={`msg msg-${m.role}`}>
                  {m.role === 'user' ? (
                    <div className="bubble">{m.text}</div>
                  ) : (
                    <AssistantMarkdown
                      text={m.text}
                      streaming={session.status === 'streaming' && i === session.messages.length - 1}
                    />
                  )}
                </article>
              ))}
            </>
          )}
          {session ? <LiveLine session={session} nowTs={nowTs} /> : null}
          {ask ? (
            <div className="ask-bar">
              <span>要你批准 · {ask.action}</span>
              <button type="button" className="btn-solid" onClick={() => void allow()}>
                允许
              </button>
              <button type="button" className="btn-ghost" onClick={() => void deny()}>
                拒绝
              </button>
            </div>
          ) : null}
          {live ? (
            <div className="turn-bar">
              <button type="button" className="btn-ghost" onClick={() => void cancel()}>
                取消这一轮
              </button>
            </div>
          ) : null}
          <div ref={bottom} />
        </div>
      </div>

      <div className="chat-dock">
        <Composer
          variant="dock"
          placeholder="补充一句，或打 /"
          engineLabel={engineLabel}
          queued={session?.queued}
          onSubmit={submit}
          onNotice={showNotice}
          onExport={runExport}
          onContext={() => showNotice(`${usage.label}。${usage.detail}`)}
        />
      </div>
    </div>
  )
}
