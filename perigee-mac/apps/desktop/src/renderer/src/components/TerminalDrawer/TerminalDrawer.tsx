import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'
import { baseName } from '../../lib/format'
import { EmptyState, Icon, IconButton } from '../ui'
import '@xterm/xterm/css/xterm.css'

/**
 * 底部终端抽屉：PTY(xterm) / shell-c / echo 三模（移植旧 TerminalPane）。
 * 始终挂载，open=false 仅高度收起（.is-closed），保住 xterm 状态与终端日志。
 * xterm 主题色读 CSS 变量；主题切换下次挂载生效。
 */
export function TerminalDrawer({ wb, open }: { wb: Workbench; open: boolean }): JSX.Element {
  const t = useT()
  const sessionId = wb.activeSessionId
  const [log, setLog] = useState('')
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<string>(
    wb.settings?.terminalMode ?? (wb.settings?.terminalShellEnabled ? 'shell-c' : 'echo')
  )
  const [ptyOk, setPtyOk] = useState<boolean | null>(null)
  const [ptyReason, setPtyReason] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const logRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const xtermHostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const isPtyMode = mode === 'pty' && ptyOk === true

  /* 模式来源之一：设置（设置页可热切 terminalMode） */
  useEffect(() => {
    const s = wb.settings
    if (!s) return
    setMode(s.terminalMode ?? (s.terminalShellEnabled ? 'shell-c' : 'echo'))
  }, [wb.settings])

  /* 模式来源之二：node-pty 可用性 */
  useEffect(() => {
    void window.perigee.terminal.availability?.().then((a) => {
      if (!a) return
      setPtyOk(a.pty)
      setPtyReason(a.reason)
    })
  }, [])

  /* 会话状态 + shell-c/echo 累计日志（PTY 时仍维护，供降级与清屏）；跟随会话切换 */
  useEffect(() => {
    if (!sessionId) {
      setLog('')
      setRunning(false)
      return
    }
    let alive = true
    void window.perigee.terminal.read(sessionId).then((t) => alive && setLog(t))
    void window.perigee.terminal.status(sessionId).then((st) => {
      if (!alive) return
      setRunning(st.running)
      if (st.mode) setMode(st.mode)
    })
    const off = window.perigee.terminal.onData((p) => {
      if (p.sessionId !== sessionId) return
      setLog((prev) => prev + p.chunk)
      void window.perigee.terminal.status(sessionId).then((st) => {
        if (!alive) return
        setRunning(st.running)
        if (st.mode) setMode(st.mode)
      })
    })
    return () => {
      alive = false
      off()
    }
  }, [sessionId])

  /* 粘底滚动（距底 60px 内跟随新输出） */
  useEffect(() => {
    const el = logRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [log])

  const destroyXterm = useCallback(() => {
    try {
      termRef.current?.dispose()
    } catch {
      /* */
    }
    termRef.current = null
    fitRef.current = null
  }, [])

  /* PTY：xterm + FitAddon（attach/writeRaw/resize/onData/onExit） */
  useEffect(() => {
    if (!sessionId || !isPtyMode) {
      destroyXterm()
      return
    }
    const host = xtermHostRef.current
    if (!host) return

    const css = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'JetBrains Mono, Cascadia Mono, Cascadia Code, Consolas, SF Mono, Menlo, ui-monospace, monospace',
      fontSize: 12,
      theme: {
        background: v('--bg-1', '#1d1d20'),
        foreground: v('--tx-1', 'rgba(255,255,255,0.92)'),
        cursor: v('--accent', '#7aa2f7'),
        selectionBackground: v('--accent-soft', 'rgba(122,162,247,0.14)')
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    try {
      fit.fit()
    } catch {
      /* 抽屉收起时高度为 0，fit 失败等下次 resize */
    }
    termRef.current = term
    fitRef.current = fit

    void window.perigee.terminal
      .attach?.(sessionId, { cols: term.cols, rows: term.rows })
      ?.then((r) => {
        if (!r.ok) {
          setMode(r.mode ?? 'shell-c')
          term.writeln(`\r\n[pty attach 失败: ${r.reason ?? '?'}]`)
        }
      })

    const offData = window.perigee.terminal.onData((p) => {
      if (p.sessionId === sessionId) term.write(p.chunk)
    })
    const offExit = window.perigee.terminal.onExit?.((p) => {
      if (p.sessionId === sessionId) {
        term.writeln(`\r\n[exit ${p.exitCode ?? '?'}]`)
        setRunning(false)
      }
    })
    const disp = term.onData((data) => {
      void window.perigee.terminal.writeRaw?.(sessionId, data)
    })
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        void window.perigee.terminal.resize?.(sessionId, term.cols, term.rows)
      } catch {
        /* */
      }
    })
    ro.observe(host)

    return () => {
      offData()
      offExit?.()
      disp.dispose()
      ro.disconnect()
      destroyXterm()
    }
  }, [sessionId, isPtyMode, destroyXterm])

  const submit = () => {
    const line = input.trim()
    if (!line || !sessionId) return
    setHistory((h) => [...h.filter((x) => x !== line), line].slice(-50))
    setHistIdx(-1)
    void window.perigee.terminal.write(sessionId, line).then(() => {
      void window.perigee.terminal.status(sessionId).then((st) => {
        setRunning(st.running)
        if (st.mode) setMode(st.mode)
      })
    })
    setInput('')
  }

  const clear = () => {
    if (!sessionId) return
    void window.perigee.terminal.clear(sessionId)
    setLog('')
    termRef.current?.clear()
  }
  const kill = () => {
    if (!sessionId) return
    void window.perigee.terminal.kill(sessionId)
  }

  return (
    <div className={`terminal-drawer${open ? '' : ' is-closed'}`} aria-hidden={!open}>
      {/* 头部（T017 对齐原型）：图标 + 等宽微标签「mode · 工作区」+ ⌘` 微 chip + 右侧操作 */}
      <div className="td-head">
        <Icon name="terminal" size={13} />
        <span
          className="td-label"
          data-tip={ptyOk === false ? `PTY 不可用：${ptyReason ?? 'node-pty 未加载'}` : undefined}
        >
          {mode}
          {wb.currentWorkspace ? ` · ${baseName(wb.currentWorkspace)}` : ''}
          {running ? ` · ${t('运行中')}` : ''}
          {ptyOk === false ? ` · ${t('无原生模块')}` : ''}
        </span>
        <kbd className="td-kbd">⌘`</kbd>
        <span style={{ marginLeft: 'auto' }} />
        <IconButton tip={t('清屏')} icon="trash" onClick={clear} disabled={!sessionId} />
        <IconButton tip={t('终止进程')} icon="stop" onClick={kill} disabled={!sessionId} />
        <IconButton tip={t('收起终端')} icon="x" onClick={() => wb.toggleTerminalPane()} />
      </div>
      {!sessionId ? (
        <div className="td-body">
          <EmptyState
            icon="terminal"
            title={t('先开一个会话')}
            sub={t('选择或新建会话后，在会话 cwd 下使用终端。')}
          />
        </div>
      ) : isPtyMode ? (
        <div className="td-body">
          <div ref={xtermHostRef} style={{ height: '100%' }} />
        </div>
      ) : (
        <>
          <div className="td-body">
            <div
              className="td-log"
              ref={logRef}
              onScroll={() => {
                const el = logRef.current
                if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
              }}
            >
              {log || t('（无输出）')}
            </div>
          </div>
          <form
            className="td-input-row"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <span className="prompt-sign">❯</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  kill()
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHistIdx((i) => {
                    const next = i < 0 ? history.length - 1 : Math.max(0, i - 1)
                    setInput(history[next] ?? '')
                    return next
                  })
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHistIdx((i) => {
                    if (i < 0) return -1
                    const next = i + 1
                    if (next >= history.length) {
                      setInput('')
                      return -1
                    }
                    setInput(history[next] ?? '')
                    return next
                  })
                }
              }}
              placeholder={
                mode === 'echo'
                  ? t('echo 模式 · 命令不会真正执行')
                  : t('会话 cwd · Enter 执行 · ↑↓ 历史 · ⌃C 停止')
              }
              spellCheck={false}
            />
          </form>
        </>
      )}
    </div>
  )
}
