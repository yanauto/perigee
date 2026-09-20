import { useEffect, useMemo, useState } from 'react'
import type { InspectPlugin, InspectResult } from '../../../shared/inspect'
import { installSourceFor, parseMarketPlugins, type MarketPlugin } from '../../../shared/grok-cmd'
import { pluginById } from '../../../shared/plugins'
import { IconChevron, IconPuzzle } from '../components/Icons'
import { askDanger, cmdText, runGrokCmd } from '../grok-cmd-client'
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

export function SettingsPlugins() {
  const { state, goto } = useWorkbench()
  const [inspect, setInspect] = useState<InspectResult | null>(null)
  const [market, setMarket] = useState<MarketPlugin[] | null>(null)
  const [marketErr, setMarketErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [src, setSrc] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showMarket, setShowMarket] = useState(true)

  const refresh = (force: boolean) => {
    void loadInspect(force).then(setInspect)
  }

  const loadMarket = () => {
    setMarketErr(null)
    void runGrokCmd(['plugin', 'list', '--available', '--json']).then((r) => {
      if (!r.ok) {
        setMarket([])
        setMarketErr(cmdText(r))
        return
      }
      setMarket(parseMarketPlugins(r.stdout || r.stderr))
    })
  }

  useEffect(() => {
    refresh(false)
    loadMarket()
  }, [])

  const run = async (args: string[], confirm = false, danger?: string) => {
    if (danger && !askDanger(danger)) return
    setBusy(args.join(' '))
    setNote(null)
    try {
      const result = await runGrokCmd(args, confirm)
      setNote(cmdText(result))
      refresh(true)
      if (args[1] === 'install' || args[1] === 'uninstall') loadMarket()
    } finally {
      setBusy(null)
    }
  }

  const installed = inspect?.ok ? inspect.report.plugins : []
  const installedNames = new Set(installed.map((p) => p.name))
  const query = q.trim().toLowerCase()
  const marketShown = useMemo(() => {
    const rows = market ?? []
    if (!query) return rows
    return rows.filter((p) => {
      const hay = `${p.name} ${p.description || ''} ${p.marketplace || ''}`.toLowerCase()
      return hay.includes(query)
    })
  }, [market, query])

  const locked = busy != null
  const fakeHint = pluginById(state?.plugins.activeId ?? '')

  return (
    <div className="acct-page">
      <div>
        <h1 className="acct-title">插件</h1>
        <p className="muted">已装的来自本机 Grok。安装走官方 grok plugin install，不走假市场。</p>
      </div>

      {note ? <p className="account-inline-note">{note}</p> : null}

      <section className="acct-block">
        <h2>已装</h2>
        {installed.length === 0 ? (
          <div className="plug-empty white-card">
            <IconPuzzle size={28} />
            <div className="plug-empty-title">还没有已装插件</div>
            <p className="muted">下面填 git 地址，或从官方列表点安装。</p>
          </div>
        ) : (
          <div className="plug-installed">
            {installed.map((plugin) => (
              <InstalledRow
                key={plugin.name}
                plugin={plugin}
                locked={locked}
                onToggle={() => void run(['plugin', plugin.enabled ? 'disable' : 'enable', plugin.name])}
                onRemove={() =>
                  void run(['plugin', 'uninstall', plugin.name], true, `要卸掉插件 ${plugin.name}。继续？`)
                }
                onOpen={() => void goto('settings-plugins-detail', plugin.name)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="acct-block">
        <h2>从源安装</h2>
        <form
          className="settings-add"
          onSubmit={(e) => {
            e.preventDefault()
            const next = src.trim()
            if (!next) return
            void run(['plugin', 'install', next], true, `要往本机装 ${next}（grok plugin install）。继续？`).then(
              () => setSrc('')
            )
          }}
        >
          <input
            className="acct-input"
            value={src}
            placeholder="git 地址 / user/repo / 本地路径"
            disabled={locked}
            onChange={(e) => setSrc(e.target.value)}
          />
          <button type="submit" className="btn-ghost" disabled={locked || !src.trim()}>
            安装
          </button>
        </form>
      </section>

      <section className="acct-block">
        <div className="plug-section-head">
          <h2>官方 marketplace（只读）</h2>
          <button type="button" className="account-text" onClick={() => setShowMarket((v) => !v)}>
            {showMarket ? '收起' : '列出'}
          </button>
        </div>
        {showMarket ? (
          <>
            <label className="plug-search">
              <input
                value={q}
                placeholder="筛名字"
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {marketErr ? <p className="muted">{marketErr}</p> : null}
            {market == null ? <p className="muted">正在读官方列表…</p> : null}
            {market && marketShown.length === 0 ? (
              <div className="settings-empty">
                <div>官方列表是空的</div>
                <div className="muted">没有可装的，或筛法太窄。</div>
              </div>
            ) : null}
            <div className="plug-grid">
              {marketShown.slice(0, 80).map((item) => {
                const on = installedNames.has(item.name)
                return (
                  <div key={`${item.marketplace || ''}:${item.name}`} className="plug-card">
                    <div className="plug-copy">
                      <div className="plug-name">{item.name}</div>
                      <p>{item.description || item.marketplace || '官方 marketplace'}</p>
                    </div>
                    {on ? (
                      <span className="muted">已装</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={locked}
                        onClick={() =>
                          void run(
                            ['plugin', 'install', installSourceFor(item)],
                            true,
                            `要装 ${item.name}（grok plugin install）。继续？`
                          )
                        }
                      >
                        安装
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {marketShown.length > 80 ? (
              <p className="muted">只先列出 80 个。再筛一下名字。</p>
            ) : null}
          </>
        ) : null}
      </section>

      {fakeHint ? (
        <p className="muted">演示目录里的「{fakeHint.name}」不会真装。要用上面的官方入口。</p>
      ) : null}
    </div>
  )
}

function InstalledRow({
  plugin,
  locked,
  onToggle,
  onRemove,
  onOpen
}: {
  plugin: InspectPlugin
  locked: boolean
  onToggle: () => void
  onRemove: () => void
  onOpen: () => void
}) {
  return (
    <div className="plug-row">
      <button type="button" className="plug-copy" onClick={onOpen}>
        <div className="plug-name">{plugin.name}</div>
        <p>
          {plugin.enabled ? '开' : '关'}
          {plugin.scope ? ` · ${plugin.scope}` : ''}
        </p>
      </button>
      <div className="inspect-item-actions">
        <button type="button" className={plugin.enabled ? 'chip is-on' : 'chip'} disabled={locked} onClick={onToggle}>
          {plugin.enabled ? '停用' : '启用'}
        </button>
        <button type="button" className="chip" disabled={locked} onClick={onRemove}>
          卸掉
        </button>
        <IconChevron />
      </div>
    </div>
  )
}

export function SettingsPluginsDetail() {
  const { state, goto } = useWorkbench()
  const name = state?.plugins.activeId || ''
  const fake = pluginById(name)
  const [plugin, setPlugin] = useState<InspectPlugin | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadInspect(false).then((r) => {
      if (!r.ok) return
      setPlugin(r.report.plugins.find((p) => p.name === name) ?? null)
    })
  }, [name])

  const run = async (args: string[], confirm = false, danger?: string) => {
    if (danger && !askDanger(danger)) return
    setBusy(true)
    setNote(null)
    try {
      const result = await runGrokCmd(args, confirm)
      setNote(cmdText(result))
      const next = await loadInspect(true)
      if (next.ok) setPlugin(next.report.plugins.find((p) => p.name === name) ?? null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acct-page">
      <button type="button" className="account-back plug-back" onClick={() => void goto('settings-plugins')}>
        ← 插件
      </button>

      <header className="plug-detail-head">
        <div>
          <h1 className="acct-title tight">{plugin?.name || fake?.name || name || '插件'}</h1>
          <p className="muted">{plugin ? plugin.scope || '已装' : '还没装，或不在本机列表里'}</p>
        </div>
        <div className="plug-detail-actions">
          {plugin ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => void run(['plugin', plugin.enabled ? 'disable' : 'enable', plugin.name])}
              >
                {plugin.enabled ? '停用' : '启用'}
              </button>
              <button
                type="button"
                className="account-text"
                disabled={busy}
                onClick={() => void run(['plugin', 'uninstall', plugin.name], true, `要卸掉 ${plugin.name}。继续？`)}
              >
                卸掉
              </button>
            </>
          ) : fake ? (
            <button type="button" className="btn-ghost" disabled>
              演示条目，不会真装
            </button>
          ) : name ? (
            <button
              type="button"
              className="btn-solid"
              disabled={busy}
              onClick={() => void run(['plugin', 'install', name], true, `要装 ${name}（grok plugin install）。继续？`)}
            >
              安装
            </button>
          ) : null}
        </div>
      </header>

      <p className="plug-detail-blurb">
        {plugin
          ? '开关和卸掉走官方 grok plugin。'
          : fake
            ? '这是旧的演示市场条目。真安装请回插件页，用官方列表或填 git 地址。'
            : '点安装会转官方 grok plugin install。'}
      </p>
      {note ? <p className="account-inline-note">{note}</p> : null}
    </div>
  )
}
