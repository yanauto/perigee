import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { useT } from '../../i18n'

/** 推理强度三档（T005 内建命令 `effort <low|medium|high>`） */
export type EffortLevel = 'low' | 'medium' | 'high'

const LEVELS: { id: EffortLevel; label: string }[] = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' }
]

const levelIndex = (lv: EffortLevel): number => LEVELS.findIndex((l) => l.id === lv)

const levelPct = (lv: EffortLevel): number => (levelIndex(lv) / (LEVELS.length - 1)) * 100

/**
 * Effort 三档滑杆弹层（CCD ccd-04 对齐：更快 ↔ 更强，标题「Effort · 档位」）。
 * 点档位 / 拖滑块选择（拖动只动视觉，松手才提交）；←/→ 方向键逐档提交。
 * 提交 = 路由 session.command(sid, 'effort <level>')，结果沿用 Composer flashHint / wb.setError。
 * 当前值无查询 API —— 不预填，由父组件 state 记住本会话上次选择。
 * 支持度由调用方判定（capabilities.effort 非 unsupported 才放行入口），本组件假定可执行。
 */
export function EffortPopover({
  open,
  onClose,
  anchorRef,
  wb,
  value,
  onChange,
  onHint
}: {
  open: boolean
  onClose: () => void
  /** 触发 chip（锚点测量 + 点外关闭豁免，使 chip 点击可正常 toggle） */
  anchorRef: RefObject<HTMLElement | null>
  wb: Workbench
  value: EffortLevel | null
  onChange: (lv: EffortLevel) => void
  onHint: (msg: string) => void
}): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragLevel, setDragLevel] = useState<EffortLevel | null>(null)
  const shown = dragLevel ?? value
  const t = useT()

  /* 定位：锚定 chip 正上方（offsetLeft 为动态测量值 → 内联；其余视觉走 CSS 类） */
  useLayoutEffect(() => {
    if (!open) return
    const el = rootRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    const parent = el.offsetParent
    const max = parent ? parent.clientWidth - el.offsetWidth - 8 : anchor.offsetLeft
    el.style.left = `${Math.max(0, Math.min(anchor.offsetLeft, max))}px`
  }, [open, anchorRef])

  const levelFromX = (clientX: number): EffortLevel => {
    const track = trackRef.current
    if (!track) return 'medium'
    const r = track.getBoundingClientRect()
    const t = r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0.5
    return LEVELS[Math.round(t * (LEVELS.length - 1))].id
  }

  /* 提交：记住选择 + 路由 T005 effort 命令（结果反馈与 Composer slash 同一约定） */
  const commit = (lv: EffortLevel) => {
    onChange(lv)
    const sid = wb.activeSessionId
    if (!sid) return
    void (async () => {
      try {
        const res = await window.perigee.session.command(sid, `effort ${lv}`)
        if (res.status === 'error') wb.setError(`推理强度设置失败：${res.detail}`)
        else if (res.status === 'unsupported') onHint(`推理强度暂不支持：${res.detail}`)
        else if (res.detail) onHint(res.detail)
      } catch (err) {
        wb.setError(`推理强度设置失败：${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    trackRef.current?.focus()
    try {
      trackRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* 个别环境 capture 失败不阻塞点选 */
    }
    setDragLevel(levelFromX(e.clientX))
  }
  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragLevel) setDragLevel(levelFromX(e.clientX))
  }
  const onTrackUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragLevel) return
    const lv = levelFromX(e.clientX)
    setDragLevel(null)
    commit(lv)
  }

  if (!open) return null

  return (
    <div
      ref={rootRef}
      className="popover effort-popover"
      role="dialog"
      aria-label={t('推理强度')}
      data-pop="effort"
      style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0 }}
    >
      <div className="effort-title">
        <span>
          {t('推理强度')}
          {shown ? ` · ${t(LEVELS[levelIndex(shown)].label)}` : ''}
        </span>
      </div>
      <div className="effort-labels">
        <span>{t('更快')}</span>
        <span>{t('更强')}</span>
      </div>
      <div
        ref={trackRef}
        className="effort-track"
        role="slider"
        tabIndex={0}
        aria-label={t('推理强度')}
        aria-valuemin={1}
        aria-valuemax={LEVELS.length}
        aria-valuenow={shown ? levelIndex(shown) + 1 : 2}
        aria-valuetext={shown ? t(LEVELS[levelIndex(shown)].label) : t('未设置')}
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={onTrackUp}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const idx = shown ? levelIndex(shown) : 1
          const next =
            LEVELS[Math.min(LEVELS.length - 1, Math.max(0, idx + (e.key === 'ArrowRight' ? 1 : -1)))]
          commit(next.id)
        }}
      >
        {LEVELS.map((lv) => (
          <span
            key={lv.id}
            className={`effort-dot${shown === lv.id ? ' is-active' : ''}`}
            style={{ left: `${levelPct(lv.id)}%` }}
          />
        ))}
        {shown && <div className="effort-thumb" style={{ left: `${levelPct(shown)}%` }} />}
      </div>
    </div>
  )
}
