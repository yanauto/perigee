import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'
import { Button, EmptyState, Icon, IconButton } from '../ui'

/**
 * 侧问：以当前主会话为 parent 建独立 side 会话（session.createSide，kind=side），
 * 不写回主 transcript、不持久化（host 侧 persistSession 跳过 side）。
 * 流式显示复用 wb.blocksFor(sideId)（useWorkbench 全局 onEvent 订阅归约）；
 * ⌘Enter 发送；关闭即弃——每次打开都是全新 side 会话。
 */
export function SideChatModal({
  wb,
  open,
  onClose
}: {
  wb: Workbench
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  const t = useT()
  const [sideId, setSideId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const parentId = wb.activeSessionId

  /* 打开：建 side 会话；关闭即弃（重置本地状态） */
  useEffect(() => {
    if (!open) {
      setSideId(null)
      setDraft('')
      return
    }
    if (!parentId) return
    let alive = true
    void (async () => {
      try {
        const rec = await window.perigee.session.createSide(parentId)
        if (!alive) return
        setSideId(rec.id)
        void wb.seedSession(rec.id)
      } catch (e) {
        if (!alive) return
        wb.setError(e instanceof Error ? e.message : String(e))
        onClose()
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parentId])

  /* 聚焦输入框 */
  useEffect(() => {
    if (open && sideId) taRef.current?.focus()
  }, [open, sideId])

  const blocks = wb.blocksFor(sideId)
  const last = blocks[blocks.length - 1]
  const sideBusy = last?.kind === 'assistant' && !!last.streaming

  /* 新内容滚到底 */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  if (!open) return null

  const submit = () => {
    const raw = draft.trim()
    if (!raw || !sideId || sideBusy) return
    void wb.send(raw, sideId)
    setDraft('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="message" size={14} />
          <span>
            {t('侧问')} · {wb.activeSession?.title ?? t('会话')}
          </span>
          <IconButton tip={t('关闭')} icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          {!parentId ? (
            <EmptyState
              icon="message"
              title={t('先打开一个主会话')}
              sub={t('侧问需要以某个主会话为父会话建立。')}
            />
          ) : (
            <>
              <div className="composer-hint" style={{ marginBottom: 10 }}>
                {t('独立引擎会话（不写入主对话记录）。请只问答；不要让它改代码。')}
                {sideBusy ? ` ${t('生成中…')}` : ''}
              </div>
              <div
                ref={scrollRef}
                style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10 }}
              >
                {blocks.length === 0 ? (
                  <EmptyState
                    icon="message"
                    title={t('还没有侧问消息')}
                    sub={
                      sideId ? t('例如：这个错误是什么意思？') : t('正在建立侧问会话…')
                    }
                  />
                ) : (
                  blocks.map((b) => {
                    if (b.kind === 'user') {
                      return (
                        <div key={b.id} className="msg msg-user">
                          <div className="mu-bubble">{b.text}</div>
                        </div>
                      )
                    }
                    if (b.kind === 'assistant') {
                      return (
                        <div
                          key={b.id}
                          className="msg msg-assistant"
                          style={{ whiteSpace: 'pre-wrap' }}
                        >
                          {b.text}
                          {b.streaming ? '▍' : ''}
                        </div>
                      )
                    }
                    if (b.kind === 'error') {
                      return (
                        <div key={b.id} className="msg-error">
                          {b.text}
                        </div>
                      )
                    }
                    return null
                  })
                )}
              </div>
              <textarea
                ref={taRef}
                className="input"
                rows={3}
                style={{ resize: 'none' }}
                value={draft}
                disabled={!sideId || sideBusy}
                placeholder={t('例如：这个错误是什么意思？')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
              <div className="composer-bar">
                <span className="composer-hint">
                  <kbd>⌘Enter</kbd> {t('发送 · 独立 session · 关闭即弃')}
                </span>
                <span className="cb-right">
                  <Button variant="ghost" onClick={onClose}>
                    {t('关闭')}
                  </Button>
                  <Button
                    variant="primary"
                    icon="send"
                    disabled={!draft.trim() || !sideId || sideBusy}
                    onClick={submit}
                  >
                    {t('发送侧问')}
                  </Button>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
