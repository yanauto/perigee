import { useEffect, useMemo, useState, type JSX } from 'react'
import type { FileDiff } from '../../lib/perigee-api'
import type { Workbench } from '../../state/useWorkbench'
import {
  formatDiffCommentsMessage,
  upsertComment,
  type DiffLineComment
} from '../../lib/diff-comments'
import { aggregateDiffStats, lineDiffStats } from '../../lib/diff-stats'
import { useT } from '../../i18n'
import { EmptyState, Icon, IconButton } from '../ui'

type Props = {
  wb: Workbench
  /** 指定则只看该会话；缺省跟随当前会话 */
  sessionId?: string
  /** 指定则只看该轮（'latest' = 最近一轮），标题显示「本轮变更」 */
  turnId?: string
}

type ParsedLine = { text: string; cls: 'add' | 'del' | 'hunk' | 'ctx'; no: number | null }

const STATUS_LABEL = { pending: '待审', accepted: '已接受', rejected: '已拒绝' } as const
const STATUS_DOT = { pending: 'dot-warn', accepted: 'dot-ok', rejected: 'dot-danger' } as const

/**
 * Diff 视图：无 turnId 列出当前会话全部变更（pending 在前）；
 * 选中一个渲染 unified 视图（行号 + 行评论）；有 turnId 时同视图按轮过滤。
 */
export function DiffView({ wb, sessionId, turnId }: Props): JSX.Element {
  const t = useT()
  const sid = sessionId ?? wb.activeSessionId

  const list = useMemo(() => {
    const forSession = sid ? wb.diffs.filter((d) => d.sessionId === sid) : wb.diffs
    let filtered = forSession
    if (turnId) {
      if (turnId === 'latest') {
        /* 最近 turnId；无 turnId 的也纳入 */
        const ids = [...new Set(forSession.map((d) => d.turnId).filter(Boolean))] as string[]
        const last = ids[ids.length - 1]
        filtered = last ? forSession.filter((d) => d.turnId === last || !d.turnId) : forSession
      } else {
        filtered = forSession.filter((d) => d.turnId === turnId)
      }
    }
    const rank = (d: FileDiff) => (d.status === 'pending' ? 0 : d.status === 'accepted' ? 1 : 2)
    return [...filtered].sort((a, b) => rank(a) - rank(b))
  }, [wb.diffs, sid, turnId])

  const agg = useMemo(() => aggregateDiffStats(list), [list])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = list.find((d) => d.id === selectedId) ?? null
  const [unified, setUnified] = useState('')
  const [comments, setComments] = useState<DiffLineComment[]>([])
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  /* 换会话/轮次：回到列表并清空评论草稿 */
  useEffect(() => {
    setSelectedId(null)
    setComments([])
    setEditingLine(null)
    setDraft('')
  }, [sid, turnId])

  /* 选中文件的 unified diff（接受/拒绝后状态翻转需重取） */
  useEffect(() => {
    if (!selected) {
      setUnified('')
      return
    }
    let alive = true
    void window.perigee.diff.unified(selected.id).then((u) => alive && setUnified(u))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.status])

  const parsed = useMemo(() => parseUnified(unified), [unified])
  const selStats = useMemo(() => {
    if (!selected) return null
    if (typeof selected.lineAdd === 'number' && typeof selected.lineDel === 'number') {
      return { add: selected.lineAdd, del: selected.lineDel }
    }
    return lineDiffStats(selected.before, selected.after)
  }, [selected])

  const commentOnLine = (lineIndex: number) => {
    if (!selected) return
    const existing = comments.find(
      (c) => c.path === selected.relativePath && c.lineIndex === lineIndex
    )
    setEditingLine(lineIndex)
    setDraft(existing?.comment ?? '')
  }

  const saveLineComment = () => {
    if (editingLine == null || !selected) return
    setComments((prev) =>
      upsertComment(prev, {
        path: selected.relativePath,
        lineIndex: editingLine,
        lineText: parsed[editingLine]?.text ?? '',
        comment: draft
      })
    )
    setEditingLine(null)
    setDraft('')
  }

  const submitComments = () => {
    const msg = formatDiffCommentsMessage(comments)
    if (!msg || !sid) return
    void wb.send(msg, sid)
    setComments([])
    setEditingLine(null)
    setDraft('')
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon="diff"
        title={t('暂无变更')}
        sub={
          turnId
            ? t('本轮没有文件变更；可能已被接受、打回，或该轮未触及文件。')
            : t('当前会话还没有文件变更。')
        }
      />
    )
  }

  const submitBtn =
    comments.length > 0 && sid ? (
      <button
        type="button"
        className="btn btn-primary"
        data-tip={t('提交全部行评论给 Grok')}
        onClick={submitComments}
      >
        {t('提交为消息')}（{comments.length}）
      </button>
    ) : null

  /* 底部操作条（T017 对齐原型）：放行全部 / 还原此文件 / 「已放行 N / M 文件」 */
  const pendingList = list.filter((d) => d.status === 'pending')
  const acceptedCount = list.filter((d) => d.status === 'accepted').length
  const acceptAll = () => {
    pendingList.forEach((d) => void window.perigee.diff.accept(d.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {selected ? (
        <>
          <div className="diff-file-head">
            <IconButton tip={t('返回变更列表')} onClick={() => setSelectedId(null)}>
              <Icon name="chevron" style={{ rotate: '180deg' }} />
            </IconButton>
            <span
              style={{
                fontFamily: 'var(--mono)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={selected.relativePath}
            >
              {selected.relativePath}
            </span>
            {selStats && (selStats.add > 0 || selStats.del > 0) ? (
              <span style={{ fontFamily: 'var(--mono)', flex: 'none' }}>
                <span style={{ color: 'var(--add)' }}>+{selStats.add}</span>{' '}
                <span style={{ color: 'var(--del)' }}>−{selStats.del}</span>
              </span>
            ) : null}
            <span style={{ marginLeft: 'auto' }} />
            {submitBtn}
            {selected.status !== 'pending' ? (
              <span className="chip">{t(STATUS_LABEL[selected.status])}</span>
            ) : null}
          </div>
          <div className="diff-scroll">
            {parsed.map((l, i) => {
              const has = comments.some(
                (c) => c.path === selected.relativePath && c.lineIndex === i
              )
              return (
                <div key={i}>
                  <div
                    className={`diff-line ${l.cls}`}
                    style={{ cursor: 'pointer' }}
                    data-tip={t('点击添加行评论')}
                    onClick={() => commentOnLine(i)}
                  >
                    <span className="dl-no">{l.no ?? ''}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{l.text || ' '}</span>
                    {has ? (
                      <span style={{ color: 'var(--warn)', flex: 'none' }} data-tip={t('已有评论')}>
                        ●
                      </span>
                    ) : null}
                  </div>
                  {editingLine === i ? (
                    <div
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-2)',
                        borderTop: '1px solid var(--border)'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        className="input"
                        autoFocus
                        value={draft}
                        placeholder={t('写审查意见…')}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveLineComment()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingLine(null)
                            setDraft('')
                          }
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--tx-3)'
                        }}
                      >
                        <span>{t('Enter 保存 · Esc 取消')}</span>
                        <span style={{ marginLeft: 'auto' }} />
                        <button type="button" className="btn" onClick={saveLineComment}>
                          {t('保存')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {/* 操作条：墨色「放行全部」+ 「还原此文件」+ 右侧等宽计数 */}
          <div className="diff-actions">
            <button
              type="button"
              className="da-accept"
              disabled={pendingList.length === 0}
              data-tip={t('放行本视图内全部待审变更')}
              onClick={acceptAll}
            >
              {t('放行全部')}
            </button>
            <button
              type="button"
              className="da-revert"
              disabled={selected.status !== 'pending'}
              data-tip={t('拒绝会把磁盘还原到修改前')}
              onClick={() => void window.perigee.diff.reject(selected.id)}
            >
              {t('还原此文件')}
            </button>
            <span className="da-count">
              {acceptedCount} / {list.length} {t('文件')}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="diff-file-head">
            <span style={{ color: 'var(--tx-1)', fontWeight: 550 }}>
              {turnId ? t('本轮变更') : t('变更')}
            </span>
            <span style={{ color: 'var(--tx-3)' }}>
              {list.length} {t('文件')}
            </span>
            {agg.add > 0 || agg.del > 0 ? (
              <span style={{ fontFamily: 'var(--mono)' }}>
                <span style={{ color: 'var(--add)' }}>+{agg.add}</span>{' '}
                <span style={{ color: 'var(--del)' }}>−{agg.del}</span>
              </span>
            ) : null}
            <span style={{ marginLeft: 'auto' }} />
            {submitBtn}
          </div>
          <div className="ftree">
            {list.map((d) => {
              const st = lineDiffStats(d.before, d.after)
              const n = comments.filter((c) => c.path === d.relativePath).length
              return (
                <button
                  key={d.id}
                  type="button"
                  className="ftree-row"
                  title={d.relativePath}
                  onClick={() => setSelectedId(d.id)}
                >
                  <span
                    className={`dot ${STATUS_DOT[d.status]}`}
                    data-tip={t(STATUS_LABEL[d.status])}
                  />
                  <span
                    className="fr-name"
                    style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 0 }}
                  >
                    {d.relativePath}
                  </span>
                  {n > 0 ? (
                    <span className="chip">
                      {n} {t('评')}
                    </span>
                  ) : null}
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--mono)',
                      fontSize: 11.5,
                      flex: 'none'
                    }}
                  >
                    {st.add > 0 || st.del > 0 ? (
                      <>
                        <span style={{ color: 'var(--add)' }}>+{st.add}</span>{' '}
                        <span style={{ color: 'var(--del)' }}>−{st.del}</span>
                      </>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** unified diff → 渲染行（add 取新行号，del 取旧行号；未见 hunk 头前不出行号） */
function parseUnified(src: string): ParsedLine[] {
  if (!src) return []
  const raw = src.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  const out: ParsedLine[] = []
  let oldNo = 0
  let newNo = 0
  let inHunks = false
  for (const line of raw) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      inHunks = true
      out.push({ text: line, cls: 'hunk', no: null })
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      out.push({ text: line, cls: 'hunk', no: null })
    } else if (line.startsWith('+')) {
      out.push({ text: line, cls: 'add', no: inHunks ? newNo : null })
      if (inHunks) newNo++
    } else if (line.startsWith('-')) {
      out.push({ text: line, cls: 'del', no: inHunks ? oldNo : null })
      if (inHunks) oldNo++
    } else if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity') ||
      line.startsWith('rename ')
    ) {
      out.push({ text: line, cls: 'hunk', no: null })
    } else if (line.startsWith('\\')) {
      /* "\ No newline at end of file" */
      out.push({ text: line, cls: 'ctx', no: null })
    } else {
      /* ' ' 前缀上下文行（无前缀也容错按上下文） */
      out.push({ text: line, cls: 'ctx', no: inHunks ? newNo : null })
      if (inHunks) {
        oldNo++
        newNo++
      }
    }
  }
  return out
}
