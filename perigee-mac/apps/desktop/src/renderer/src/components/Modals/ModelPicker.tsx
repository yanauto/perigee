import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { displayModel } from '../../lib/format'
import { useT } from '../../i18n'
import { Button, Icon } from '../ui'

/** 主列表数字快捷键上限（CCD ccd-03：列表项带数字快捷键 1-4） */
const QUICK_MAX = 4

type ModelEntry = { id: string; isDefault?: boolean }

/**
 * 模型选择弹层（CCD ccd-03 对齐，纲领：≤2 步完成切换——⌘M 打开、Enter 即完成）。
 * 形态：锚定 Composer 区上方的白底弹层（.popover），fixed 水平居中、bottom≈120。
 * 内容：「默认」分区置顶 + 列表项右侧数字快捷键 1-4 + 当前项 ✓ +「更多模型」子级（带返回行）。
 * 键盘：↑↓ 移动 · Enter 选中 · 1-4 直选 · Esc 关闭（捕获相位拦截，不冒泡给全局 keymap）。
 * listModels 不可用或抛错 → 降级为自由输入框 + 「应用」（沿用 palette 壳）。
 */
export function ModelPicker({
  wb,
  open,
  onClose
}: {
  wb: Workbench
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  const current = wb.settings?.model ?? ''
  const t = useT()
  const [models, setModels] = useState<ModelEntry[] | null>(null)
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [fallback, setFallback] = useState(false)
  const [freeInput, setFreeInput] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [moreCursor, setMoreCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  /* 打开：重置并拉模型列表（桥未就绪/抛错 → 自由输入降级） */
  useEffect(() => {
    if (!open) return
    setModels(null)
    setDefaultId(null)
    setFallback(false)
    setFreeInput(current)
    setMoreOpen(false)
    setCursor(0)
    setMoreCursor(0)
    let alive = true
    const integrations = window.perigee.integrations as {
      listModels?: () => Promise<{
        defaultModel?: string
        models: ModelEntry[]
        detail: string
      }>
    }
    if (typeof integrations.listModels !== 'function') {
      setFallback(true)
      return
    }
    integrations
      .listModels()
      .then((r) => {
        if (!alive) return
        const list = r.models ?? []
        setModels(list)
        setDefaultId(r.defaultModel ?? list.find((m) => m.isDefault)?.id ?? null)
      })
      .catch(() => alive && setFallback(true))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* 列表到达：预选当前模型（Enter 即完成） */
  useEffect(() => {
    if (!models) return
    const deduped = models.filter((m) => m.id !== defaultId)
    const i = deduped.slice(0, QUICK_MAX).findIndex((m) => m.id === current)
    setCursor(i >= 0 ? i : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, defaultId])

  /* 降级模式聚焦并全选（便于直接覆盖输入） */
  useEffect(() => {
    if (!open || !fallback) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [open, fallback])

  const apply = (model: string) => {
    const m = model.trim()
    if (!m) return
    void wb.updateSettings({ model: m })
    onClose()
  }

  /* 键盘流（每次渲染重挂，保证读到最新 cursor/models；代价可忽略）。
     捕获相位 stopPropagation：handled 键不冒泡给 React 根与全局 keymap（Esc 不触发 App 层叠关）。
     T013：点外关闭已交全站统一机制（根节点 data-pop="model"），本组件不再挂 mousedown。 */
  useEffect(() => {
    if (!open || fallback) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return // ⌘M/⌘K 等全局组合键放行
      const deduped = (models ?? []).filter((m) => m.id !== defaultId)
      const main = deduped.slice(0, QUICK_MAX)
      const rest = deduped.slice(QUICK_MAX)
      const eat = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === 'Escape') {
        eat()
        onClose()
      } else if (e.key === 'ArrowDown') {
        eat()
        if (moreOpen) setMoreCursor((c) => Math.min(c + 1, Math.max(0, rest.length - 1)))
        else setCursor((c) => Math.min(c + 1, Math.max(0, main.length - 1)))
      } else if (e.key === 'ArrowUp') {
        eat()
        if (moreOpen) setMoreCursor((c) => Math.max(c - 1, 0))
        else setCursor((c) => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        eat()
        const m = moreOpen ? rest[moreCursor] : main[cursor]
        if (m) apply(m.id)
      } else if (!moreOpen && e.key >= '1' && e.key <= String(QUICK_MAX)) {
        const m = main[Number(e.key) - 1]
        if (m) {
          eat()
          apply(m.id)
        }
      } else if (moreOpen && (e.key === 'ArrowLeft' || e.key === 'Backspace')) {
        eat()
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  })

  if (!open) return null

  /* ---- 降级：自由输入 ---- */
  if (fallback) {
    return (
      <div className="palette-overlay" onClick={onClose}>
        <div className="palette" data-pop="model" onClick={(e) => e.stopPropagation()}>
          <div className="palette-input-row">
            <Icon name="brain" size={15} />
            <input
              ref={inputRef}
              value={freeInput}
              placeholder={t('输入模型 id，回车应用')}
              onChange={(e) => setFreeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  onClose()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  apply(freeInput)
                }
              }}
            />
            <kbd>esc</kbd>
          </div>
          <div className="palette-foot">
            <span>{t('模型列表不可用（桥接中或接口异常），改为手输')}</span>
            <span style={{ marginLeft: 'auto' }}>
              <Button variant="primary" disabled={!freeInput.trim()} onClick={() => apply(freeInput)}>
                {t('应用')}
              </Button>
            </span>
          </div>
        </div>
      </div>
    )
  }

  /* ---- 主路径：锚定弹层 ---- */
  // r02 C9：默认行与列表行去重——列表里排除已在「默认」分区展示的模型，✓ 唯一
  const deduped = (models ?? []).filter((m) => m.id !== defaultId)
  const main = deduped.slice(0, QUICK_MAX)
  const rest = deduped.slice(QUICK_MAX)

  return (
    <div
      ref={rootRef}
      className="popover model-picker"
      role="menu"
      aria-label={t('模型')}
      data-pop="model"
      style={{ position: 'fixed', left: '50%', bottom: 120, transform: 'translateX(-50%)' }}
    >
      {!moreOpen ? (
        <>
          <div className="menu-label">{t('模型')}</div>
          {defaultId && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => apply(defaultId)}>
              <span title={defaultId}>{displayModel(defaultId)}</span>
              <span className="mi-sub">{t('· 默认')}</span>
              {(!current || current === defaultId) && (
                <span className="mi-hint">
                  <Icon name="check" size={13} />
                </span>
              )}
            </button>
          )}
          {defaultId && main.length > 0 && <div className="menu-sep" />}
          {models === null ? (
            <div className="menu-label">{t('加载模型列表…')}</div>
          ) : main.length === 0 ? null : (
            /* r03-final：列表为空（唯一模型已进默认分区）时整段隐藏，不显示占位文案 */
            main.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                className={`menu-item${i === cursor ? ' is-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => apply(m.id)}
              >
                <span title={m.id}>{displayModel(m.id)}</span>
                <span className="mi-hint">
                  {m.id === current ? <Icon name="check" size={13} /> : i + 1}
                </span>
              </button>
            ))
          )}
          {rest.length > 0 && (
            <>
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMoreCursor(0)
                  setMoreOpen(true)
                }}
              >
                <span>{t('更多模型')}</span>
                <span className="mi-hint">
                  <Icon name="chevron" size={12} />
                </span>
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button type="button" className="menu-item" onClick={() => setMoreOpen(false)}>
            <span aria-hidden>‹</span>
            <span>{t('返回')}</span>
          </button>
          <div className="menu-sep" />
          <div className="model-picker-list">
            {rest.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                className={`menu-item${i === moreCursor ? ' is-active' : ''}`}
                onMouseEnter={() => setMoreCursor(i)}
                onClick={() => apply(m.id)}
              >
                <span title={m.id}>{displayModel(m.id)}</span>
                {m.id === current && (
                  <span className="mi-hint">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
