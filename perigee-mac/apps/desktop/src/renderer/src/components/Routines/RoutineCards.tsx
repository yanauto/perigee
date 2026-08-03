import type { JSX } from 'react'
import type { RoutineView } from '../../lib/perigee-api'
import { displayModel } from '../../lib/format'
import { describeTriggers, formatNextRun } from '../../lib/routines'
import { useI18n } from '../../i18n'
import { Button, EmptyState, Icon, Switch } from '../ui'

/**
 * Routines 总览（T019 · 对齐原型 isRoutines 段）：
 * 1010 内容列、3 列卡片网格（gap 12），每卡 = 名字 + 启停开关 + 运行时间 + 模型 chip + 下次运行。
 * 停用卡整体降透明度；顶部「新建 Routine」墨色主按钮。
 */
export function RoutineCards({
  routines,
  ready,
  onOpen,
  onNew,
  onToggle
}: {
  routines: RoutineView[]
  ready: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onToggle: (id: string, enabled: boolean) => void
}): JSX.Element {
  const { lang, t } = useI18n()

  return (
    <div className="ro-scroll">
      <div className="ro-col">
        <div className="ro-head">
          <div className="ro-head-text">
            <h1>Routines</h1>
            <p>
              {t('把重复的活交给 Grok 定时跑 —— 到点自动开一个会话，跑完在侧栏标未读。')}
            </p>
          </div>
          <Button variant="primary" icon="plus" onClick={onNew}>
            {t('新建 Routine')}
          </Button>
        </div>

        {ready && routines.length === 0 ? (
          <EmptyState
            icon="clock"
            title={t('还没有 Routine')}
            sub={t('把重复的活交给 Grok 定时跑 —— 到点自动开一个会话，跑完在侧栏标未读。')}
          >
            <Button variant="primary" icon="plus" onClick={onNew}>
              {t('新建 Routine')}
            </Button>
          </EmptyState>
        ) : (
          <div className="ro-grid">
            {routines.map((r) => {
              const next = formatNextRun(r.nextRunAt, Date.now(), lang)
              return (
                <div
                  key={r.id}
                  className={`ro-card${r.enabled ? '' : ' is-off'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(r.id)}
                  onKeyDown={(e) => {
                    /* 只认卡片自身的回车/空格——焦点在卡内开关上时不要顺带进详情 */
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(r.id)
                    }
                  }}
                >
                  <div className="rc-head">
                    <span className="rc-name" title={r.name}>
                      {r.name}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Switch
                        on={r.enabled}
                        tip={t('启用 / 停用')}
                        onChange={(v) => onToggle(r.id, v)}
                      />
                    </span>
                  </div>
                  <div className="rc-schedule">
                    <Icon name="clock" size={12} />
                    <span>{describeTriggers(r.triggers, lang)}</span>
                  </div>
                  <div className="rc-foot">
                    <span className="rc-model">{displayModel(r.model)}</span>
                    <span className={`rc-next${r.enabled ? '' : ' is-off'}`}>
                      {next
                        ? `${t('下次 ')}${next}`
                        : t('停用中，不会自动运行')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
