import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { RoutineCreateInput, RoutineTrigger, RoutineView } from '../../lib/perigee-api'
import { describeTrigger, emptyTrigger } from '../../lib/routines'
import { homeTilde } from '../../lib/format'
import { usePopover } from '../../lib/popovers'
import { useI18n } from '../../i18n'
import { Icon, Switch } from '../ui'

/**
 * Routine 编辑模态（T019 · 对齐原型 editOpen 段，704px）：
 * 名称 → 指令大输入框（框内嵌模型条与工作区条，同 Composer 语言）→ 触发器 chips（daily/weekly/interval，
 * 可加可删，「添加触发器」走 data-pop-trigger 统一弹层机制）→ 三 tab（连接器 / 行为 / 通知）→ 取消 / 保存。
 * 连接器 tab 常驻权限警示条（定时运行不逐条询问权限）。
 */

const EFFORTS = ['low', 'medium', 'high'] as const
const WEEKDAY_KEYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

type Tab = 'connectors' | 'behavior' | 'notify'

export function RoutineEditModal({
  open,
  routine,
  defaultWorkspace,
  defaultModel,
  mcpNames,
  onClose,
  onSave
}: {
  open: boolean
  /** null = 新建 */
  routine: RoutineView | null
  defaultWorkspace: string
  defaultModel: string
  /** 可选的 MCP 连接器名（来自 integrations.status） */
  mcpNames: string[]
  onClose: () => void
  onSave: (input: RoutineCreateInput) => void
}): JSX.Element | null {
  const { lang, t } = useI18n()
  const addPop = usePopover('routine-trigger')
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<string>('')
  const [triggers, setTriggers] = useState<RoutineTrigger[]>([])
  const [servers, setServers] = useState<string[]>([])
  const [notify, setNotify] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [tab, setTab] = useState<Tab>('connectors')

  /* 打开即用当前 routine（或新建默认值）重置表单 */
  useEffect(() => {
    if (!open) return
    setName(routine?.name ?? '')
    setInstruction(routine?.instruction ?? '')
    setModel(routine?.model ?? defaultModel)
    setEffort(routine?.effort ?? '')
    setTriggers(routine?.triggers ?? [emptyTrigger('daily')])
    setServers(routine?.mcpServers ?? [])
    setNotify(routine?.notify ?? true)
    setEnabled(routine?.enabled ?? true)
    setTab('connectors')
  }, [open, routine, defaultModel])

  /* Esc 关模态（本模态不在 App 的 Esc 链上）。弹层开着时 popovers.ts 在捕获相位吃掉 Esc，
     所以这里天然是「先关弹层、再关模态」的第二层。 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const workspace = routine?.workspace || defaultWorkspace
  const canSave = name.trim().length > 0 && instruction.trim().length > 0 && !!workspace

  const patchTrigger = (i: number, patch: Partial<RoutineTrigger>) =>
    setTriggers((prev) => prev.map((tr, idx) => (idx === i ? { ...tr, ...patch } : tr)))

  const save = () => {
    if (!canSave) return
    onSave({
      name: name.trim(),
      instruction: instruction.trim(),
      enabled,
      workspace,
      model: model.trim() || defaultModel,
      ...(effort ? { effort } : {}),
      triggers,
      mcpServers: servers,
      notify
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal re-modal" onClick={(e) => e.stopPropagation()}>
        <div className="re-head">
          <span>{routine ? t('编辑 Routine') : t('新建 Routine')}</span>
          <button type="button" className="re-x" aria-label={t('关闭')} data-tip={t('关闭')} onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="re-body">
          {/* 名称 */}
          <div className="re-field">
            <div className="re-label">
              {t('名称')} <span className="re-req">*</span>
            </div>
            <input
              className="input re-name"
              type="text"
              value={name}
              placeholder={t('例如：夜间回归')}
              aria-label={t('名称')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 指令：框内嵌模型条 + 工作区条 */}
          <div className="re-field">
            <div className="re-label">
              {t('指令')} <span className="re-req">*</span>
            </div>
            <div className="re-instruction">
              <textarea
                rows={6}
                value={instruction}
                placeholder={t('到点要 Grok 做什么？写清楚验收标准。')}
                aria-label={t('指令')}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <div className="re-inst-model">
                <input
                  className="re-model-input"
                  type="text"
                  value={model}
                  placeholder={t('默认模型')}
                  aria-label={t('默认模型')}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="re-inst-repo">
                <Icon name="branch" size={12} />
                <span title={workspace}>{homeTilde(workspace) || t('先打开一个工作区…')}</span>
              </div>
            </div>
          </div>

          {/* 触发器 */}
          <div className="re-field">
            <div className="re-label">{t('触发器')}</div>
            {triggers.map((tr, i) => (
              <div className="re-trigger" key={`${tr.kind}-${i}`}>
                <Icon name="clock" size={13} />
                <select
                  aria-label={t('触发器')}
                  value={tr.kind}
                  onChange={(e) =>
                    setTriggers((prev) =>
                      prev.map((old, idx) =>
                        idx === i ? emptyTrigger(e.target.value as RoutineTrigger['kind']) : old
                      )
                    )
                  }
                >
                  <option value="daily">{t('每天')}</option>
                  <option value="weekly">{t('每周')}</option>
                  <option value="interval">{t('每隔')}</option>
                </select>
                {tr.kind === 'weekly' ? (
                  <select
                    aria-label={t('星期')}
                    value={tr.weekday ?? 1}
                    onChange={(e) => patchTrigger(i, { weekday: Number(e.target.value) })}
                  >
                    {WEEKDAY_KEYS.map((w, idx) => (
                      <option key={w} value={idx}>
                        {t(w)}
                      </option>
                    ))}
                  </select>
                ) : null}
                {tr.kind === 'interval' ? (
                  <>
                    <input
                      className="input re-num"
                      type="number"
                      min={1}
                      max={10080}
                      value={tr.everyMinutes ?? 60}
                      aria-label={t('间隔分钟')}
                      onChange={(e) => patchTrigger(i, { everyMinutes: Number(e.target.value) })}
                    />
                    <span className="re-unit">{t('分钟')}</span>
                  </>
                ) : (
                  <input
                    className="input re-time"
                    type="time"
                    value={tr.time ?? '09:00'}
                    aria-label={t('时间')}
                    onChange={(e) => patchTrigger(i, { time: e.target.value })}
                  />
                )}
                <span className="re-trigger-desc">{describeTrigger(tr, lang)}</span>
                <button
                  type="button"
                  className="re-trigger-x"
                  aria-label={t('删除触发器')}
                  data-tip={t('删除触发器')}
                  disabled={triggers.length <= 1}
                  onClick={() => setTriggers((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            <div className="re-add-wrap">
              <button
                type="button"
                className="re-add"
                data-pop-trigger="routine-trigger"
                onClick={addPop.toggle}
              >
                <Icon name="plus" size={12} />
                {t('添加触发器')}
              </button>
              {addPop.open ? (
                <div className="popover re-add-pop" data-pop="routine-trigger" role="menu">
                  {(['daily', 'weekly', 'interval'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setTriggers((prev) => [...prev, emptyTrigger(k)])
                        addPop.close()
                      }}
                    >
                      {describeTrigger(emptyTrigger(k), lang)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* 三 tab */}
          <div className="re-field">
            <div className="re-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'connectors'}
                className={tab === 'connectors' ? 'is-active' : ''}
                onClick={() => setTab('connectors')}
              >
                {t('连接器')} <span className="re-tab-n">{servers.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'behavior'}
                className={tab === 'behavior' ? 'is-active' : ''}
                onClick={() => setTab('behavior')}
              >
                {t('行为')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'notify'}
                className={tab === 'notify' ? 'is-active' : ''}
                onClick={() => setTab('notify')}
              >
                {t('通知')}
              </button>
            </div>

            {tab === 'connectors' ? (
              <>
                <div className="re-hint">{t('运行期间 Grok 可以使用的 MCP 服务器。')}</div>
                <div className="re-chips">
                  {mcpNames.length === 0 ? (
                    <span className="rd-empty">{t('没有配置 MCP 连接器')}</span>
                  ) : (
                    mcpNames.map((m) => {
                      const on = servers.includes(m)
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`re-chip${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() =>
                            setServers((prev) =>
                              prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
                            )
                          }
                        >
                          <Icon name="plug" size={12} />
                          {m}
                          {on ? <Icon name="check" size={11} /> : null}
                        </button>
                      )
                    })
                  )}
                </div>
                {/* 权限警示条：定时运行不逐条询问权限（原型常驻） */}
                <div className="re-warn">
                  <Icon name="alert" size={14} />
                  <span>
                    {t(
                      '定时运行期间不会向你逐条询问权限 —— 这些连接器的写操作会直接执行。不想让它碰的，请在这里移除。'
                    )}
                  </span>
                </div>
              </>
            ) : null}

            {tab === 'behavior' ? (
              <div className="re-rows">
                <div className="set-row">
                  <div className="sr-label">
                    <div className="sr-name">{t('创建后立即启用')}</div>
                    <div className="sr-desc">{t('停用的 Routine 不会自动运行，但仍可手动「立即运行」。')}</div>
                  </div>
                  <Switch on={enabled} onChange={setEnabled} />
                </div>
                <div className="set-row">
                  <div className="sr-label">
                    <div className="sr-name">{t('推理强度')}</div>
                    <div className="sr-desc">{t('留空则用引擎默认。')}</div>
                  </div>
                  <div className="perm-seg">
                    {EFFORTS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={effort === e ? 'is-active' : ''}
                        onClick={() => setEffort(effort === e ? '' : e)}
                      >
                        {t(e === 'low' ? '低' : e === 'medium' ? '中' : '高')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-row">
                  <div className="sr-label">
                    <div className="sr-name">{t('工作区')}</div>
                    <div className="sr-desc">{homeTilde(workspace)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'notify' ? (
              <div className="re-rows">
                <div className="set-row">
                  <div className="sr-label">
                    <div className="sr-name">{t('跑完通知我')}</div>
                    <div className="sr-desc">{t('跑完在侧栏标未读；开启后再发一条系统通知。')}</div>
                  </div>
                  <Switch on={notify} onChange={setNotify} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="re-foot">
          <button type="button" className="re-cancel" onClick={onClose}>
            {t('取消')}
          </button>
          <button type="button" className="re-save" disabled={!canSave} onClick={save}>
            {t('保存')}
          </button>
        </div>
      </div>
    </div>
  )
}
