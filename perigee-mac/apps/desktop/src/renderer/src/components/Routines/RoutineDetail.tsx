import type { JSX } from 'react'
import type { RoutineView } from '../../lib/perigee-api'
import { baseName, displayModel } from '../../lib/format'
import { describeTriggers, formatNextRun, formatRunDuration, formatRunTime } from '../../lib/routines'
import { useI18n } from '../../i18n'
import { Icon, IconButton, Switch } from '../ui'

/**
 * Routine 详情（T019 · 对齐原型 isRoutineDetail 段）：
 * 面包屑 Routines / <名字>；右侧 编辑 / 删除 / ▷ 立即运行。
 * 左列 状态 · 重复 · 工作区 · MCP 连接器；右列 指令块 + 运行记录（点一条跳该次运行开的会话）。
 */
export function RoutineDetail({
  routine,
  onBack,
  onEdit,
  onDelete,
  onRunNow,
  onToggle,
  onOpenSession
}: {
  routine: RoutineView
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  onToggle: (enabled: boolean) => void
  onOpenSession: (sessionId: string) => void
}): JSX.Element {
  const { lang, t } = useI18n()
  const next = formatNextRun(routine.nextRunAt, Date.now(), lang)

  return (
    <div className="ro-scroll">
      <div className="ro-col">
        <div className="rd-crumb">
          <button type="button" className="rd-crumb-link" onClick={onBack}>
            Routines
          </button>
          <span className="rd-crumb-sep">/</span>
          <span className="rd-crumb-cur">{routine.name}</span>
        </div>

        <div className="rd-head">
          <h1 title={routine.name}>{routine.name}</h1>
          <IconButton tip={t('编辑')} icon="wrench" onClick={onEdit} />
          <IconButton tip={t('删除')} icon="trash" className="rd-del" onClick={onDelete} />
          <button type="button" className="rd-run" onClick={onRunNow}>
            <Icon name="play" size={12} />
            {t('立即运行')}
          </button>
        </div>

        <div className="rd-body">
          <div className="rd-left">
            <section>
              <div className="rd-label">{t('状态')}</div>
              <div className="rd-state">
                <Switch on={routine.enabled} tip={t('启用 / 停用')} onChange={onToggle} />
                <span className="rd-state-text">
                  <span className={`dot${routine.enabled ? ' dot-ok' : ''}`} />
                  {routine.enabled ? t('已启用') : t('已停用')}
                </span>
                <span className="rd-next">
                  {next ? `${t('下次运行：')}${next}` : t('停用中，不会自动运行')}
                </span>
              </div>
            </section>

            <section>
              <div className="rd-label">{t('重复')}</div>
              <div className="rd-repeat">{describeTriggers(routine.triggers, lang)}</div>
            </section>

            <section>
              <div className="rd-label">{t('工作区')}</div>
              <div className="rd-chips">
                <span className="rd-chip" title={routine.workspace}>
                  <Icon name="folder" size={12} />
                  {baseName(routine.workspace) || routine.workspace}
                </span>
                <span className="rd-chip is-mono">
                  {displayModel(routine.model)}
                  {routine.effort ? ` · ${routine.effort}` : ''}
                </span>
              </div>
            </section>

            <section>
              <div className="rd-label">{t('MCP 连接器')}</div>
              <div className="rd-chips">
                {routine.mcpServers.length > 0 ? (
                  routine.mcpServers.map((m) => (
                    <span key={m} className="rd-chip">
                      <Icon name="plug" size={12} />
                      {m}
                    </span>
                  ))
                ) : (
                  <span className="rd-empty">{t('没有配置 MCP 连接器')}</span>
                )}
              </div>
            </section>
          </div>

          <div className="rd-right">
            <section>
              <div className="rd-label">{t('指令')}</div>
              <div className="rd-instruction">{routine.instruction}</div>
            </section>

            <section>
              <div className="rd-label">{t('运行记录')}</div>
              <div className="rd-runs">
                {routine.runs.length === 0 ? (
                  <div className="rd-empty">{t('还没有运行记录')}</div>
                ) : (
                  routine.runs.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className="rd-run-row"
                      data-tip={t('打开这次运行的会话')}
                      onClick={() => onOpenSession(run.sessionId)}
                    >
                      <span className={`dot ${run.status === 'ok' ? 'dot-ok' : 'dot-danger'}`} />
                      <span className="rr-when">{formatRunTime(run.startedAt, Date.now(), lang)}</span>
                      <span className="rr-summary">
                        {run.summary ?? (run.status === 'ok' ? t('已完成') : t('运行失败'))}
                      </span>
                      <span className="rr-dur">{formatRunDuration(run.durationMs)}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
