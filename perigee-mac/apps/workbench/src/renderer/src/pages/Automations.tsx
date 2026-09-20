import { useState } from 'react'
import { formatWhen } from '../../../shared/routines'
import type { RoutineRow } from '../../../shared/types'
import { UI } from '../../../shared/ui-copy'
import { IconPlus } from '../components/Icons'
import { useWorkbench } from '../state'

function RoutineForm({ onCreated }: { onCreated?: () => void }) {
  const { addRoutine } = useWorkbench()
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [cron, setCron] = useState('0 9 * * *')
  const can = name.trim() && instruction.trim() && cron.trim()

  return (
    <form
      className="routine-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!can) return
        void addRoutine({ name: name.trim(), instruction: instruction.trim(), cron: cron.trim() }).then(
          () => {
            setName('')
            setInstruction('')
            setCron('0 9 * * *')
            onCreated?.()
          }
        )
      }}
    >
      <div className="routine-fields">
        <label className="routine-field">
          <span>名字</span>
          <input
            className="acct-input wide"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="晨检"
          />
        </label>
        <label className="routine-field">
          <span>cron（分 时 日 月 周）</span>
          <input
            className="acct-input wide"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 9 * * *"
          />
        </label>
      </div>
      <label className="routine-field">
        <span>到点要说的话</span>
        <textarea
          className="routine-say"
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="用一句话问好"
        />
      </label>
      <button type="submit" className="btn-solid" disabled={!can}>
        <IconPlus size={13} /> {UI.autoSave}
      </button>
    </form>
  )
}

function RowMark({ row }: { row: RoutineRow }) {
  if (row.running) return <span className="session-badge is-live">进行中</span>
  if (!row.enabled) return <span className="muted">已停</span>
  return null
}

export function Automations() {
  const { state, goto } = useWorkbench()
  const items = state?.routines.items ?? []
  const empty = items.length === 0

  return (
    <div className="stage-auto">
      <header className="auto-head">
        <h1>自动化</h1>
      </header>

      <section className="auto-lane" data-lane="perigee-routine">
        <header className="auto-lane-head">
          <div className="auto-lane-kicker">Perigee</div>
          <h2 className="auto-lane-title">本机定时</h2>
          <p className="muted">{UI.autoPerigee}</p>
        </header>

        <RoutineForm />

        {empty ? (
          <div className="auto-empty">
            <div className="auto-empty-title">{UI.autoEmpty}</div>
          </div>
        ) : (
          <table className="auto-table">
            <thead>
              <tr>
                <th>名字</th>
                <th>下次</th>
                <th>上次</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} onClick={() => void goto('automations-detail', row.id)}>
                  <td className="auto-name">{row.name}</td>
                  <td className="muted">{formatWhen(row.nextRunAt)}</td>
                  <td className="muted">{formatWhen(row.lastRunAt)}</td>
                  <td>
                    <RowMark row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="auto-lane is-cli" data-lane="cli-loop">
        <header className="auto-lane-head">
          <div className="auto-lane-kicker">Grok CLI</div>
          <h2 className="auto-lane-title">/loop 与 workflow</h2>
          <p className="muted">{UI.autoCli}</p>
        </header>

        <table className="auto-table is-static">
          <thead>
            <tr>
              <th>种类</th>
              <th>在哪</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="auto-name">/loop</td>
              <td className="muted">终端那条会话里</td>
            </tr>
            <tr>
              <td className="auto-name">workflow 定义</td>
              <td className="muted">磁盘上的 .rhai；这里只列不跑</td>
            </tr>
            <tr>
              <td className="auto-name">workflow 运行</td>
              <td className="muted">终端 /workflows</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

export function AutomationsGallery() {
  const { goto } = useWorkbench()
  return (
    <div className="stage-auto">
      <header className="auto-crumb-head">
        <button type="button" className="back-btn" onClick={() => void goto('automations')}>
          自动化
        </button>
      </header>
      <div className="auto-empty">
        <div className="auto-empty-title">模板墙已收起</div>
        <p className="muted">存任务请回本机定时。</p>
        <button type="button" className="btn-solid" onClick={() => void goto('automations')}>
          回本机定时
        </button>
      </div>
    </div>
  )
}
