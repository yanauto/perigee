import { useEffect, useState, type ReactNode } from 'react'
import type {
  InspectHook,
  InspectInstruction,
  InspectMcp,
  InspectPlugin,
  InspectResult,
  InspectSkill
} from '../../../shared/inspect'
import { AGENT_PERM_MODES, modeLabel, modeOfficial } from '../../../shared/agent-mode'
import { LOGOUT_CONFIRM, parseLoginStatus, type LoginStatus } from '../../../shared/grok-cmd'
import { inspectSourceLabel, pathBaseName } from '../../../shared/inspect'
import { modelDisplay, UI } from '../../../shared/ui-copy'
import { IconChevronLeft } from '../components/Icons'
import { askDanger, cmdText, runGrokCmd } from '../grok-cmd-client'
import {
  EFFORT_LEVELS,
  SANDBOX_PROFILES,
  effortLabel,
  sandboxLabel
} from '../../../shared/runtime-flags'
import { useWorkbench } from '../state'

function loadInspect(force: boolean): Promise<InspectResult> {
  const api = window.workbench
  if (!api || typeof api.inspect !== 'function') {
    return Promise.resolve({
      ok: false,
      error: '这个窗口还没有 inspect 接口',
      code: 'inspect-failed'
    })
  }
  return api.inspect({ force })
}

function sourceExtra(...parts: Array<string | undefined>): string {
  return parts
    .filter((part) => {
      const t = part?.trim() ?? ''
      return t && t !== '—' && !/^unknown$/i.test(t)
    })
    .join(' · ')
}

function SkillRow({ skill }: { skill: InspectSkill }) {
  const extra = sourceExtra(inspectSourceLabel(skill.source), skill.disabled ? '停用' : '', skill.vendor)
  return (
    <div className="inspect-item">
      <span className="inspect-item-name">{skill.name}</span>
      {extra ? <span className="muted">{extra}</span> : null}
    </div>
  )
}

function HookRow({ hook }: { hook: InspectHook }) {
  const name = hook.event && hook.event !== '(plugin)' ? hook.event : hook.hookType || 'hook'
  const extra = sourceExtra(
    hook.hookType,
    hook.matcher ? `matcher=${hook.matcher}` : '',
    inspectSourceLabel(hook.source)
  )
  return (
    <div className="inspect-item">
      <span className="inspect-item-name">{name}</span>
      {extra ? <span className="muted">{extra}</span> : null}
    </div>
  )
}

function RuleRow({ file }: { file: InspectInstruction }) {
  const extra = sourceExtra(
    file.fileType || 'file',
    file.scope,
    file.approxTokens != null ? `~${file.approxTokens} tokens` : '',
    file.disabled ? '停用' : ''
  )
  return (
    <div className="inspect-item">
      <span className="inspect-item-name">{pathBaseName(file.path)}</span>
      {extra ? <span className="muted">{extra}</span> : null}
    </div>
  )
}

function InspectBlock({
  label,
  count,
  children
}: {
  label: string
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <section className="settings-card">
      <button type="button" className="settings-card-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          {label}（{count}）
        </span>
        <span className="muted">{open ? '收起' : '展开'}</span>
      </button>
      {open ? <div className="inspect-list">{children}</div> : null}
    </section>
  )
}

function ManageBlock({
  label,
  count,
  children,
  footer
}: {
  label: string
  count: number
  children: ReactNode
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="settings-card">
      <button type="button" className="settings-card-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          {label}（{count}）
        </span>
        <span className="muted">{open ? '收起' : '展开'}</span>
      </button>
      {open ? (
        <>
          <div className="inspect-list">{children}</div>
          {footer}
        </>
      ) : null}
    </section>
  )
}

function foundLine(report: {
  skills: unknown[]
  plugins: unknown[]
  hooks: unknown[]
  mcpServers: unknown[]
  projectInstructions: unknown[]
}): string {
  const bits = [
    report.skills.length ? `技能 ${report.skills.length}` : '',
    report.plugins.length ? `插件 ${report.plugins.length}` : '',
    report.hooks.length ? `Hooks ${report.hooks.length}` : '',
    report.mcpServers.length ? `MCP ${report.mcpServers.length}` : '',
    report.projectInstructions.length ? `规则 ${report.projectInstructions.length}` : ''
  ].filter(Boolean)
  return bits.join(' · ') || UI.foundNone
}

function loginLabel(status: LoginStatus): string {
  if (status === 'in') return UI.grokComIn
  if (status === 'out') return UI.grokComOut
  return UI.grokComUnknown
}

function splitCmd(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function Settings() {
  const { newAgent, state, setAgentModel, setAgentMode, setAgentPlan, setAgentEffort, setAgentSandbox, refreshModels } =
    useWorkbench()
  const grok = state?.grok
  const models = state?.models
  const agent = state?.agent
  const [inspect, setInspect] = useState<InspectResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [login, setLogin] = useState<LoginStatus>('unknown')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [mcpName, setMcpName] = useState('')
  const [mcpCmd, setMcpCmd] = useState('')
  const [plugSrc, setPlugSrc] = useState('')

  const refreshLogin = () => {
    void runGrokCmd(['models']).then((r) => {
      setLogin(parseLoginStatus(`${r.stdout}\n${r.stderr}\n${r.error || ''}`))
    })
  }

  const refresh = (force: boolean) => {
    setLoading(true)
    void refreshModels().catch(() => {})
    refreshLogin()
    void loadInspect(force)
      .then(setInspect)
      .catch((err: unknown) => {
        setInspect({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'inspect-failed'
        })
      })
      .finally(() => setLoading(false))
  }

  const run = async (args: string[], confirm = false, danger?: string) => {
    if (danger && !askDanger(danger)) return
    setBusy(args.join(' '))
    setNote(null)
    try {
      const result = await runGrokCmd(args, confirm)
      setNote(cmdText(result))
      refresh(true)
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    refresh(false)
    // 换文件夹后按新目录再拉一次
  }, [state?.workspace.path])

  const cliLine = grok?.cli ? '有 CLI' : '没有 CLI'
  const acpLine = !grok
    ? '还没探测'
    : !grok.cli
      ? 'ACP 做不了：没有 CLI'
      : grok.acp
        ? 'ACP 行'
        : `ACP 不行：${grok.acpDetail}`
  const flyby = grok?.flyby
  const flybyLine = !flyby
    ? '还没探测'
    : flyby.ok
      ? 'Flyby 通，能读页'
      : !flyby.bridgeUp
        ? '读不了页：本机 127.0.0.1:19527 没有 bridge'
        : !flyby.extensionConnected
          ? '读不了页：Chrome 扩展没连上'
          : `读不了页：${flyby.detail}`

  const report = inspect?.ok ? inspect.report : null
  const cwdName = report?.cwd ? pathBaseName(report.cwd) : state?.workspace.name || '还没选文件夹'
  const ready = !loading && inspect != null
  const modelLine = models?.current
    ? modelDisplay(models.current)
    : loading
      ? UI.inspectLoading
      : UI.modelUnknown
  const modelList = models?.list ?? []
  const plugins = report?.plugins ?? []
  const mcps = report?.mcpServers ?? []
  const locked = busy != null

  return (
    <div className="stage-settings" data-inspect-ready={ready ? '1' : '0'}>
      <header className="settings-head">
        <button type="button" className="back-btn" onClick={() => void newAgent()}>
          <IconChevronLeft />
          返回对话
        </button>
        <div className="settings-head-row">
          <div className="chat-title">{UI.keysTitle}</div>
          <button
            type="button"
            className="settings-refresh"
            disabled={loading || locked}
            onClick={() => refresh(true)}
          >
            {loading ? UI.refreshing : UI.refresh}
          </button>
        </div>
        <p className="settings-lead">{UI.keysLead}</p>
      </header>
      <div className="settings-body">
        <section className="settings-card">
          <div className="settings-card-label">{UI.keysNow}</div>
          <div className="settings-row">
            <span>{UI.keysModel}</span>
            <span className="muted" title={models?.detail}>
              {modelLine}
              {models?.followCli ? ' · CLI 默认' : ''}
            </span>
          </div>
          {modelList.length ? (
            <div className="settings-pick" role="group" aria-label="模型">
              {modelList.map((m) => {
                const on = models?.current === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={on ? 'chip is-on' : 'chip'}
                    aria-pressed={on}
                    title={m.isDefault ? `${m.id} · grok models 默认` : m.id}
                    onClick={() => void setAgentModel(m.id)}
                  >
                    {m.id}
                    {m.isDefault ? ' · 默认' : ''}
                  </button>
                )
              })}
            </div>
          ) : null}
          {models?.liveApply ? <p className="settings-hint">{models.liveApply}</p> : null}
          <div className="settings-row">
            <span>{UI.keysMode}</span>
            <span className="muted">
              {agent?.label ?? '—'}
              {agent?.plan ? ' · Plan' : ''}
            </span>
          </div>
          <div className="settings-pick" role="group" aria-label="权限档">
            {AGENT_PERM_MODES.map((mode) => {
              const on = agent?.mode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  className={on ? 'chip is-on' : 'chip'}
                  aria-pressed={on}
                  title={`${modeOfficial(mode)} · ${mode}`}
                  onClick={() => void setAgentMode(mode)}
                >
                  {modeLabel(mode)}
                </button>
              )
            })}
            <button
              type="button"
              className={agent?.plan ? 'chip is-on' : 'chip'}
              aria-pressed={agent?.plan === true}
              title="Plan mode"
              onClick={() => void setAgentPlan(!(agent?.plan === true))}
            >
              Plan
            </button>
          </div>
          {agent?.coverNote ? <p className="settings-hint">{agent.coverNote}</p> : null}
          {agent?.liveApply ? <p className="settings-hint">{agent.liveApply}</p> : null}
          <div className="settings-row">
            <span>推理力度</span>
            <span className="muted">{effortLabel((agent?.effort as 'low' | 'medium' | 'high') || '')}</span>
          </div>
          <div className="settings-pick" role="group" aria-label="推理力度">
            <button
              type="button"
              className={!agent?.effort ? 'chip is-on' : 'chip'}
              onClick={() => void setAgentEffort('')}
            >
              {effortLabel('')}
            </button>
            {EFFORT_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                className={agent?.effort === lv ? 'chip is-on' : 'chip'}
                onClick={() => void setAgentEffort(lv)}
              >
                {effortLabel(lv)}
              </button>
            ))}
          </div>
          <div className="settings-row">
            <span>沙箱</span>
            <span className="muted">
              {sandboxLabel(
                agent?.sandbox === 'workspace' || agent?.sandbox === 'read-only' || agent?.sandbox === 'strict'
                  ? agent.sandbox
                  : 'off'
              )}
            </span>
          </div>
          <div className="settings-pick" role="group" aria-label="沙箱">
            {SANDBOX_PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                className={(agent?.sandbox || 'off') === p ? 'chip is-on' : 'chip'}
                title="官方 --sandbox。下一轮新开会话生效。"
                onClick={() => void setAgentSandbox(p)}
              >
                {sandboxLabel(p)}
              </button>
            ))}
          </div>
          <p className="settings-hint">沙箱走 GROK_SANDBOX，下一轮新开的会话才换。活着的这一轮不改。</p>
          <div className="settings-row">
            <span>{UI.keysPlaceLabel}</span>
            <span className="muted" title={UI.keysPlaceHint}>
              {UI.keysPlace}
            </span>
          </div>
          <div className="settings-row">
            <span>grok.com</span>
            <span className="muted">{loginLabel(login)}</span>
          </div>
          <div className="settings-pick" role="group" aria-label="grok.com 登录">
            <button
              type="button"
              className="chip"
              disabled={locked}
              onClick={() => void run(['login'])}
            >
              {UI.grokLogin}
            </button>
            <button
              type="button"
              className="chip"
              disabled={locked}
              onClick={() => void run(['logout'], true, LOGOUT_CONFIRM)}
            >
              {UI.grokLogout}
            </button>
            <button
              type="button"
              className="chip"
              disabled={locked}
              onClick={() =>
                void run(['memory', 'clear'], true, '要清掉跨会话记忆（grok memory clear）。继续？')
              }
            >
              清记忆
            </button>
          </div>
          <p className="settings-hint">{UI.grokLoginHint}</p>
          {report?.grokVersion ? (
            <div className="settings-row">
              <span>Grok</span>
              <span className="muted">
                {report.grokVersion}
                {report.channel ? ` · ${report.channel}` : ''}
              </span>
            </div>
          ) : null}
          <div className="settings-row">
            <span>目录</span>
            <span className="muted">{cwdName}</span>
          </div>
          {report ? (
            <>
              <div className="settings-row">
                <span>项目信任</span>
                <span className="muted">{report.projectTrusted ? '是' : '否'}</span>
              </div>
              <div className="settings-row">
                <span>{UI.found}</span>
                <span className="muted">{foundLine(report)}</span>
              </div>
            </>
          ) : null}
          {inspect && !inspect.ok && !loading ? (
            <div className="settings-row">
              <span>说明</span>
              <span className="muted">{UI.inspectMiss}</span>
            </div>
          ) : null}
        </section>

        {note ? <p className="settings-hint">{note}</p> : null}

        <ManageBlock
          label="插件"
          count={plugins.length}
          footer={
            <form
              className="settings-add"
              onSubmit={(e) => {
                e.preventDefault()
                const src = plugSrc.trim()
                if (!src) return
                void run(
                  ['plugin', 'install', src],
                  true,
                  `要往本机装插件 ${src}（grok plugin install）。继续？`
                ).then(() => setPlugSrc(''))
              }}
            >
              <input
                className="acct-input"
                value={plugSrc}
                placeholder="git 地址 / user/repo / 本地路径"
                disabled={locked}
                onChange={(e) => setPlugSrc(e.target.value)}
              />
              <button type="submit" className="chip" disabled={locked || !plugSrc.trim()}>
                安装
              </button>
            </form>
          }
        >
          {plugins.length === 0 ? <div className="inspect-empty">还没有已装插件。下面填源再装，走官方 grok plugin install。</div> : null}
          {plugins.map((plugin, i) => (
            <PluginManageRow
              key={`${plugin.name}-${i}`}
              plugin={plugin}
              locked={locked}
              onToggle={() =>
                void run(['plugin', plugin.enabled ? 'disable' : 'enable', plugin.name])
              }
              onRemove={() =>
                void run(
                  ['plugin', 'uninstall', plugin.name],
                  true,
                  `要卸掉插件 ${plugin.name}。继续？`
                )
              }
            />
          ))}
        </ManageBlock>

        <ManageBlock
          label="MCP"
          count={mcps.length}
          footer={
            <form
              className="settings-add"
              onSubmit={(e) => {
                e.preventDefault()
                const name = mcpName.trim()
                const cmd = mcpCmd.trim()
                if (!name || !cmd) return
                const extra = /^https?:\/\//i.test(cmd)
                  ? ['--transport', 'http', name, cmd]
                  : [name, '--', ...splitCmd(cmd)]
                void run(
                  ['mcp', 'add', ...extra],
                  true,
                  `要写入 MCP ${name}（grok mcp add）。继续？`
                ).then(() => {
                  setMcpName('')
                  setMcpCmd('')
                })
              }}
            >
              <input
                className="acct-input"
                value={mcpName}
                placeholder="名字"
                disabled={locked}
                onChange={(e) => setMcpName(e.target.value)}
              />
              <input
                className="acct-input"
                value={mcpCmd}
                placeholder="命令或 https 地址"
                disabled={locked}
                onChange={(e) => setMcpCmd(e.target.value)}
              />
              <button type="submit" className="chip" disabled={locked || !mcpName.trim() || !mcpCmd.trim()}>
                添加
              </button>
            </form>
          }
        >
          {mcps.length === 0 ? <div className="inspect-empty">还没有 MCP。填名字和命令，走官方 grok mcp add。</div> : null}
          {mcps.map((mcp, i) => (
            <McpManageRow
              key={`${mcp.name}-${i}`}
              mcp={mcp}
              locked={locked}
              onToggle={() =>
                void run(['mcp', mcp.disabled ? 'enable' : 'disable', mcp.name])
              }
              onRemove={() =>
                void run(['mcp', 'remove', mcp.name], true, `要从本机配置删掉 MCP ${mcp.name}。继续？`)
              }
            />
          ))}
        </ManageBlock>

        {report ? (
          <>
            <InspectBlock label="子 agent" count={report.agents.length}>
              {report.agents.map((ag, i) => (
                <div className="inspect-item" key={`${ag.name}-${i}`}>
                  <span className="inspect-item-name">{ag.name}</span>
                  {ag.description ? <span className="muted">{ag.description}</span> : null}
                </div>
              ))}
            </InspectBlock>

            <InspectBlock label="技能" count={report.skills.length}>
              {report.skills.map((skill, i) => (
                <SkillRow key={`${skill.name}-${i}`} skill={skill} />
              ))}
            </InspectBlock>

            <InspectBlock label="Hooks" count={report.hooks.length}>
              {report.hooks.map((hook, i) => (
                <HookRow key={`${hook.event}-${hook.hookType}-${i}`} hook={hook} />
              ))}
            </InspectBlock>

            <InspectBlock label="规则" count={report.projectInstructions.length}>
              {report.projectInstructions.map((file, i) => (
                <RuleRow key={`${file.path}-${i}`} file={file} />
              ))}
            </InspectBlock>

            <section className="settings-card">
              <div className="settings-card-label">权限</div>
              <div className="settings-row">
                <span>已加载</span>
                <span className="muted">{report.permissions.loaded} 条</span>
              </div>
              <div className="settings-row">
                <span>跳过</span>
                <span className="muted">{report.permissions.skipped.length} 条</span>
              </div>
              <div className="settings-row">
                <span>来源</span>
                <span className="muted">
                  {report.permissions.sources.length
                    ? `${report.permissions.sources.length} 处`
                    : '（无）'}
                </span>
              </div>
            </section>
          </>
        ) : null}

        <section className="settings-card">
          <div className="settings-card-label">本机探测</div>
          <div className="settings-row">
            <span>CLI</span>
            <span className="muted">{cliLine}</span>
          </div>
          <div className="settings-row">
            <span>ACP</span>
            <span className="muted">{acpLine}</span>
          </div>
          <div className="settings-row">
            <span>Flyby</span>
            <span className="muted">{flybyLine}</span>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-row">
            <span>关于</span>
            <span className="muted">Perigee 0.1</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function PluginManageRow({
  plugin,
  locked,
  onToggle,
  onRemove
}: {
  plugin: InspectPlugin
  locked: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const bits = sourceExtra(
    plugin.scope,
    plugin.enabled ? '开' : '关',
    plugin.provides?.skills ? `${plugin.provides.skills} 技能` : '',
    plugin.provides?.hooks ? 'hooks' : ''
  )
  return (
    <div className="inspect-item">
      <span className="inspect-item-name" title={plugin.path}>
        {plugin.name}
      </span>
      <span className="inspect-item-actions">
        {bits ? <span className="muted">{bits}</span> : null}
        <button type="button" className={plugin.enabled ? 'chip is-on' : 'chip'} disabled={locked} onClick={onToggle}>
          {plugin.enabled ? '停用' : '启用'}
        </button>
        <button type="button" className="chip" disabled={locked} onClick={onRemove}>
          卸掉
        </button>
      </span>
    </div>
  )
}

function McpManageRow({
  mcp,
  locked,
  onToggle,
  onRemove
}: {
  mcp: InspectMcp
  locked: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const off = Boolean(mcp.disabled || mcp.disabledReason)
  const extra = sourceExtra(
    mcp.transport,
    inspectSourceLabel(mcp.source),
    off ? mcp.disabledReason || '停用' : '开'
  )
  return (
    <div className="inspect-item">
      <span className="inspect-item-name">{mcp.name}</span>
      <span className="inspect-item-actions">
        {extra ? <span className="muted">{extra}</span> : null}
        <button type="button" className={off ? 'chip' : 'chip is-on'} disabled={locked} onClick={onToggle}>
          {off ? '启用' : '停用'}
        </button>
        <button type="button" className="chip" disabled={locked} onClick={onRemove}>
          删除
        </button>
      </span>
    </div>
  )
}
