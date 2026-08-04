import { useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import type {
  AppSettings,
  EngineMode,
  IntegrationsStatus,
  PermissionPolicy
} from '../../lib/perigee-api'
import { Button, Icon, IconButton, StatusDot, Switch } from '../ui'
import { useThemePref, setThemePref } from '../../lib/theme'
import {
  ACCENT_PRESETS,
  setAccent,
  setShowUsageCard,
  useAccent,
  useShowUsageCard
} from '../../lib/ui-prefs'
import { shortcutRowsForPlatform } from '../../state/shortcuts'
import { ArchivedPage } from './ArchivedPage'
import { useI18n } from '../../i18n'

/**
 * 设置模态（T017 对齐 claude-design 原型设置窗）：
 * 940×min(760,82vh)，左 196px 导航（分组微标签 + 搜索框）+ 右内容区（46px 标题行 + 滚动体）。
 * 「通用」页钉死五项：外观三档 + 强调色 · 界面语言 · 默认权限档 · worktree 默认 · 主页用量卡，
 * 页尾接原型的「关于」三行（版本 / 安全模式 / 引擎模式）。
 * 其余页按**现有真功能**裁剪：引擎与模型 / 窗口与终端 / 快捷键 / 开发者 / Skills / MCP 连接器；
 * 账户 · 隐私 · 用量 · 插件**没有实功能**，用原型的骨架占位样式，不摆假开关。
 * 关闭路径：点遮罩、右上 ×、Esc（App 层 keymap）。
 */

const ENGINE_MODES: { id: EngineMode; label: string; hint: string }[] = [
  { id: 'acp', label: 'ACP', hint: '主路径：grok agent stdio（长连接）' },
  { id: 'headless', label: 'Headless', hint: '降级：grok -p streaming-json' },
  { id: 'stub', label: 'Stub', hint: '本地回声，不调引擎（调试用）' }
]

const PERM_MODES: { id: PermissionPolicy; label: string; hint: string }[] = [
  { id: 'ask', label: '询问', hint: '每次动手前问你' },
  { id: 'accept_edits', label: '改文件', hint: '编辑免问，命令仍问' },
  { id: 'plan', label: '计划', hint: '只读只想，不落盘' },
  { id: 'yolo', label: '放行', hint: '全部免问 · 谨慎使用' }
]

const TERMINAL_MODES: { id: 'echo' | 'shell-c' | 'pty'; label: string; hint: string }[] = [
  { id: 'echo', label: 'echo', hint: '仅本地 echo' },
  { id: 'shell-c', label: 'shell -c', hint: '每行 spawn shell -c' },
  { id: 'pty', label: 'pty*', hint: '真 PTY 需 node-pty 原生模块；当前未绑定时会提示并降级 shell-c' }
]

type SetPageId =
  | 'general'
  | 'archived'
  | 'account'
  | 'privacy'
  | 'usage'
  | 'engine'
  | 'app'
  | 'shortcut'
  | 'dev'
  | 'skills'
  | 'mcp'
  | 'plugins'

type SetNav = { id: SetPageId; label: string; icon: string; placeholder?: boolean }

/** 左导航三组（原型分组：设置 / 桌面应用 / 自定义） */
const SET_GROUPS: { label: string; items: SetNav[] }[] = [
  {
    label: '设置',
    items: [
      { id: 'general', label: '通用', icon: 'settings' },
      /* T026：归档区从侧栏迁到这里（会话数据管理，语义上归「设置」组） */
      { id: 'archived', label: '已归档', icon: 'archive' },
      { id: 'account', label: '账户', icon: 'user', placeholder: true },
      { id: 'privacy', label: '隐私', icon: 'lock', placeholder: true },
      { id: 'usage', label: '用量', icon: 'chart', placeholder: true },
      { id: 'engine', label: '引擎与模型', icon: 'server' }
    ]
  },
  {
    label: '桌面应用',
    items: [
      { id: 'app', label: '窗口与终端', icon: 'monitor' },
      { id: 'shortcut', label: '快捷键', icon: 'keyboard' },
      { id: 'dev', label: '开发者', icon: 'wrench' }
    ]
  },
  {
    label: '自定义',
    items: [
      { id: 'skills', label: 'Skills', icon: 'spark' },
      { id: 'mcp', label: 'MCP 连接器', icon: 'plug' },
      { id: 'plugins', label: '插件', icon: 'plus', placeholder: true }
    ]
  }
]

const ALL_NAVS: SetNav[] = SET_GROUPS.flatMap((g) => g.items)

function SetRow({
  name,
  desc,
  children
}: {
  name: string
  desc?: string
  children?: ReactNode
}) {
  return (
    <div className="set-row">
      <div className="sr-label">
        <div className="sr-name">{name}</div>
        {desc ? <div className="sr-desc">{desc}</div> : null}
      </div>
      {children}
    </div>
  )
}

/** 未接功能的页：原型骨架条（灰条 + 灰控件轮廓），明确「先占位」，不摆假开关 */
function PlaceholderPage({ note }: { note: string }) {
  return (
    <div className="set-placeholder">
      <div className="sp-note">{note}</div>
      <div className="sp-skeleton">
        {[180, 240, 150, 210].map((w, i) => (
          <div className="sp-row" key={w}>
            <span className="sp-bar" style={{ maxWidth: w }} />
            <span className={i < 2 ? 'sp-switch' : 'sp-btn'} style={i === 3 ? { width: 60 } : undefined} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SettingsModal({
  wb,
  open,
  initialPage,
  onClose
}: {
  wb: Workbench
  open: boolean
  /** T025 深链：侧栏 MCP / Skills 直接落到对应页；null / 非法值 → 「通用」 */
  initialPage?: string | null
  onClose: () => void
}): JSX.Element | null {
  const settings = wb.settings
  const appInfo = wb.appInfo
  const [status, setStatus] = useState<IntegrationsStatus | null>(null)
  const [nav, setNav] = useState<SetPageId>('general')
  const [navQuery, setNavQuery] = useState('')
  /* T013/T017：主题三档 · 强调色 · 界面语言 · 主页用量卡都走 uiState 机制 */
  const themePref = useThemePref()
  const accent = useAccent()
  const showUsage = useShowUsageCard()
  const { lang, setLang, t } = useI18n()

  /* T025：每次打开按深链目标定位（无目标回默认「通用」），关闭再开不残留上次页 */
  useEffect(() => {
    if (!open) return
    const target = ALL_NAVS.find((n) => n.id === initialPage)
    setNav(target ? target.id : 'general')
    setNavQuery('')
  }, [open, initialPage])

  /* 集成状态：打开时探测；引擎模式/二进制变化后重探（与旧一致） */
  useEffect(() => {
    if (!open) return
    let alive = true
    void window.perigee.integrations
      .status()
      .then((s) => alive && setStatus(s))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, settings?.engineMode, settings?.grokBinary])

  /* 导航搜索：命中标题即留（空查询 = 全量） */
  const navGroups = useMemo(() => {
    const q = navQuery.trim().toLowerCase()
    if (!q) return SET_GROUPS
    return SET_GROUPS.map((g) => ({
      label: g.label,
      items: g.items.filter(
        (it) => it.label.toLowerCase().includes(q) || t(it.label).toLowerCase().includes(q)
      )
    })).filter((g) => g.items.length > 0)
  }, [navQuery, t])

  if (!open || !settings) return null

  const onChange = (partial: Partial<AppSettings>) => void wb.updateSettings(partial)
  const perm = settings.permissionPolicy ?? (settings.alwaysApproveTools ? 'yolo' : 'ask')
  const activeNav = ALL_NAVS.find((n) => n.id === nav) ?? ALL_NAVS[0]!

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal set-modal" onClick={(e) => e.stopPropagation()}>
        {/* 左导航：搜索框 + 三组（微标签 mono 9.5 大写） */}
        <div className="set-nav">
          <div className="set-nav-search">
            <Icon name="search" size={13} />
            <input
              className="input"
              type="text"
              value={navQuery}
              placeholder={t('搜索设置…')}
              aria-label={t('搜索设置…')}
              spellCheck={false}
              onChange={(e) => setNavQuery(e.target.value)}
            />
          </div>
          {navGroups.map((g) => (
            <div key={g.label}>
              <div className="set-nav-label">{t(g.label)}</div>
              {g.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`set-nav-item${nav === n.id ? ' is-active' : ''}`}
                  aria-pressed={nav === n.id}
                  onClick={() => setNav(n.id)}
                >
                  <Icon name={n.icon} size={14} />
                  <span>{t(n.label)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 右内容区：标题行（当前页名 + ×）+ 滚动内容 */}
        <div className="set-main">
          <div className="modal-head">
            <span>{t(activeNav.label)}</span>
            <IconButton tip={t('关闭')} icon="x" onClick={onClose} />
          </div>
          <div className="modal-body">
            {/* ---------- 通用（钉死五项 + 关于三行） ---------- */}
            {nav === 'general' ? (
              <div className="set-section">
                <SetRow name={t('外观')} desc={t('浅色与深色是同等品质的两套主题。')}>
                  <div className="perm-seg">
                    {(
                      [
                        { id: 'system' as const, label: t('跟随系统') },
                        { id: 'light' as const, label: t('浅色') },
                        { id: 'dark' as const, label: t('深色') }
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={themePref === m.id ? 'is-active' : ''}
                        onClick={() => setThemePref(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </SetRow>
                <SetRow name={t('强调色')} desc={t('只用于焦点、活跃与链接——全站唯一的彩色。')}>
                  <div className="accent-row">
                    {ACCENT_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`accent-dot${accent === c ? ' is-active' : ''}`}
                        style={{ background: c }}
                        aria-label={c}
                        data-tip={c}
                        aria-pressed={accent === c}
                        onClick={() => setAccent(c)}
                      />
                    ))}
                  </div>
                </SetRow>
                <SetRow name={t('界面语言')} desc={t('切换后立即生效，不需要重启。')}>
                  <div className="perm-seg">
                    {(
                      [
                        { id: 'zh' as const, label: '中文' },
                        { id: 'en' as const, label: 'English' }
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={lang === m.id ? 'is-active' : ''}
                        onClick={() => setLang(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </SetRow>
                <SetRow
                  name={t('默认权限档')}
                  desc={t('新会话的起始档位，会话内仍可用 ⇧⇥ 切换。')}
                >
                  <div className="perm-seg">
                    {PERM_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={perm === m.id ? 'is-active' : ''}
                        data-tip={t(m.hint)}
                        onClick={() => onChange({ permissionPolicy: m.id })}
                      >
                        {t(m.label)}
                      </button>
                    ))}
                  </div>
                </SetRow>
                <SetRow
                  name={t('worktree 隔离')}
                  desc={t('新会话在独立的 git worktree 中运行，不动主工作区。')}
                >
                  <Switch
                    on={settings.useWorktree !== false}
                    onChange={(v) => onChange({ useWorktree: v })}
                  />
                </SetRow>
                <SetRow name={t('主页显示用量卡')} desc={t('关掉后主页只剩问候语和输入框。')}>
                  <Switch on={showUsage} onChange={setShowUsageCard} />
                </SetRow>

                <div className="set-sub-label">{t('关于')}</div>
                <SetRow name={t('版本')}>
                  <span className="set-value">v{appInfo?.version ?? '…'}</span>
                </SetRow>
                <SetRow name={t('安全模式')}>
                  <span className="set-value set-value-dot">
                    <StatusDot
                      status={
                        appInfo && appInfo.security.contextIsolation && !appInfo.security.nodeIntegration
                          ? 'ok'
                          : 'danger'
                      }
                    />
                    {appInfo?.security.sandbox ? t('沙箱') : t('未加固')}
                  </span>
                </SetRow>
                <SetRow name={t('引擎模式')} desc={t('Grok CLI · ACP 协议')}>
                  <span className="set-value">{appInfo?.engineModeActual ?? settings.engineMode}</span>
                </SetRow>
              </div>
            ) : null}

            {/* ---------- 已归档（T026：侧栏不再有归档区） ---------- */}
            {nav === 'archived' ? <ArchivedPage wb={wb} /> : null}

            {/* ---------- 引擎与模型 ---------- */}
            {nav === 'engine' ? (
              <div className="set-section">
                <SetRow name={t('默认模型')} desc={t('留空或填 CLI 支持的模型 id；⌘M 可从列表快切')}>
                  <input
                    className="input"
                    style={{ width: 220 }}
                    type="text"
                    defaultValue={settings.model}
                    key={settings.model}
                    onBlur={(e) =>
                      e.target.value !== settings.model && onChange({ model: e.target.value })
                    }
                  />
                </SetRow>
                <SetRow
                  name={t('运行模式')}
                  desc={t(ENGINE_MODES.find((m) => m.id === settings.engineMode)?.hint ?? '')}
                >
                  <div className="perm-seg">
                    {ENGINE_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={settings.engineMode === m.id ? 'is-active' : ''}
                        data-tip={t(m.hint)}
                        onClick={() => onChange({ engineMode: m.id })}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </SetRow>
                {settings.engineMode === 'headless' ? (
                  <SetRow
                    name={t('当前为降级模式')}
                    desc={t('streaming-json 一次性进程，能力弱于 ACP 长连接')}
                  >
                    <Button variant="primary" onClick={() => onChange({ engineMode: 'acp' })}>
                      {t('一键切回 ACP（推荐）')}
                    </Button>
                  </SetRow>
                ) : null}
                {appInfo?.engineModeActual?.includes('headless') ? (
                  <div
                    className="banner banner-warn"
                    style={{ borderRadius: 'var(--r-6)', margin: '4px 0 8px' }}
                  >
                    <span>
                      {t('实际引擎为')} {appInfo.engineModeActual}
                      {t('：若配置为 ACP 却 fallback，请检查 grok 二进制。')}
                    </span>
                  </div>
                ) : null}
                <SetRow name={t('grok 可执行文件')} desc={t('CLI 二进制路径或命令名')}>
                  <input
                    className="input"
                    style={{ width: 220 }}
                    type="text"
                    defaultValue={settings.grokBinary}
                    key={settings.grokBinary}
                    onBlur={(e) =>
                      e.target.value !== settings.grokBinary &&
                      onChange({ grokBinary: e.target.value })
                    }
                  />
                </SetRow>
                <SetRow name={t('最大回合数（maxTurns）')}>
                  <input
                    className="input"
                    style={{ width: 90 }}
                    type="number"
                    min={1}
                    max={200}
                    defaultValue={settings.maxTurns}
                    key={settings.maxTurns}
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n) && n > 0 && n !== settings.maxTurns) {
                        onChange({ maxTurns: n })
                      }
                    }}
                  />
                </SetRow>
                <SetRow name={t('跨会话消息闸')} desc={t('允许将文本投递到另一主会话（不自动 merge worktree）')}>
                  <Switch
                    on={!!settings.crossSessionSendEnabled}
                    onChange={(v) => onChange({ crossSessionSendEnabled: v })}
                  />
                </SetRow>
              </div>
            ) : null}

            {/* ---------- 窗口与终端 ---------- */}
            {nav === 'app' ? (
              <div className="set-section">
                <SetRow name={`${t('界面字号')} · ${settings.fontSize}px`}>
                  <input
                    type="range"
                    min={11}
                    max={16}
                    step={0.5}
                    style={{ width: 180 }}
                    aria-label={t('界面字号')}
                    value={settings.fontSize}
                    onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                  />
                </SetRow>
                <SetRow name={t('回合结束系统通知')}>
                  <Switch
                    on={settings.notifyOnTurnEnd !== false}
                    onChange={(v) => onChange({ notifyOnTurnEnd: v })}
                  />
                </SetRow>
                <SetRow
                  name={t('终端真执行（shell -c）')}
                  desc={t('开启后在会话 cwd 执行命令（非交互式完整 PTY）')}
                >
                  <Switch
                    on={!!settings.terminalShellEnabled}
                    onChange={(v) =>
                      onChange({
                        terminalShellEnabled: v,
                        terminalMode: v ? 'shell-c' : 'echo'
                      })
                    }
                  />
                </SetRow>
                <SetRow
                  name={t('终端模式')}
                  desc={t('pty* 为预留档；无原生模块时自动说明并降级，不拖垮主流程')}
                >
                  <div className="perm-seg">
                    {TERMINAL_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={(settings.terminalMode ?? 'echo') === m.id ? 'is-active' : ''}
                        data-tip={t(m.hint)}
                        onClick={() =>
                          onChange({
                            terminalMode: m.id,
                            terminalShellEnabled: m.id !== 'echo'
                          })
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </SetRow>
              </div>
            ) : null}

            {/* ---------- 快捷键（与 ⌘K「快捷键表」同一份数据） ---------- */}
            {nav === 'shortcut' ? (
              <div className="set-section">
                {shortcutRowsForPlatform(appInfo?.platform ?? 'darwin').map((r) => (
                  <SetRow key={r.action} name={t(r.action)} desc={r.note ? t(r.note) : undefined}>
                    {r.keys.map((k, i) => (
                      <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {i > 0 ? <span className="sr-desc">·</span> : null}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </SetRow>
                ))}
              </div>
            ) : null}

            {/* ---------- 开发者：诊断与热路径 ---------- */}
            {nav === 'dev' ? (
              <div className="set-section">
                <SetRow
                  name={t('Flyby（agent 效应器）')}
                  desc={status ? (status.gcu.detail ?? '…') : t('探测中…')}
                >
                  <span className="chip">
                    <StatusDot
                      status={status?.gcu.ok ? 'ok' : status?.gcu.bridgeUp ? 'warn' : 'danger'}
                    />
                    <span>
                      {status?.gcu.ok ? t('就绪') : status?.gcu.bridgeUp ? t('无扩展') : t('离线')}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    icon="refresh"
                    data-tip={t('重新探测 Flyby bridge 与扩展')}
                    onClick={() => {
                      void window.perigee.integrations.gcuStatus?.().then((g) => {
                        void window.perigee.integrations.status().then(setStatus)
                        if (g.hint) window.alert(g.detail + '\n\n' + g.hint)
                      })
                    }}
                  >
                    {t('重新探测')}
                  </Button>
                </SetRow>
                {status?.gcu ? (
                  <div className="composer-hint" style={{ padding: '0 0 6px' }}>
                    Bridge {status.gcu.bridgeUp ? '↑' : '↓'} · {t('扩展')}{' '}
                    {status.gcu.extensionConnected ? t('已连') : t('未连')} · MCP{' '}
                    {status.gcu.mcpCommandResolved ? t('路径已解析') : t('裸命令')}
                    {status.gcu.mcpCommand ? ` · ${status.gcu.mcpCommand}` : ''}
                    {status.gcu.hint ? (
                      <div style={{ color: 'var(--danger)' }}>{status.gcu.hint}</div>
                    ) : null}
                  </div>
                ) : null}
                <SetRow name="grok CLI" desc={status?.grokBinary ?? '…'}>
                  <span className="chip">
                    <StatusDot status={status?.grokAvailable ? 'ok' : 'danger'} />
                    <span>{status?.grokAvailable ? t('可用') : t('缺失')}</span>
                  </span>
                </SetRow>
                <SetRow name={t('CLI 热路径')} desc={`${t('活会话')} ${status?.liveSessionCount ?? '—'}`}>
                  <Button
                    data-tip={t('重建 ACP/引擎子进程（丢热会话；热切失败时的降级）')}
                    onClick={() => {
                      void window.perigee.integrations.rebuildEngine?.().then(() => {
                        void window.perigee.integrations.status().then(setStatus)
                      })
                    }}
                  >
                    {t('重建引擎')}
                  </Button>
                </SetRow>
                {status?.permissionHot ? (
                  <SetRow name={t('权限热切')} desc={status.permissionHot.detail}>
                    <span className="chip">
                      <StatusDot status={status.permissionHot.ok ? 'ok' : 'danger'} />
                      <span>mode</span>
                    </span>
                  </SetRow>
                ) : null}
                {status?.mcpHotReload ? (
                  <SetRow name={t('MCP 热更')} desc={status.mcpHotReload.detail}>
                    <span className="chip">
                      <StatusDot status={status.mcpHotReload.ok ? 'ok' : 'danger'} />
                      <span>mcp</span>
                    </span>
                  </SetRow>
                ) : null}
                {status?.modelHotSwitch ? (
                  <SetRow name={t('模型热切')} desc={status.modelHotSwitch.detail}>
                    <span className="chip">
                      <StatusDot status={status.modelHotSwitch.policy === 'hot' ? 'ok' : 'idle'} />
                      <span>{status.modelHotSwitch.policy}</span>
                    </span>
                  </SetRow>
                ) : null}
                {status?.gh ? (
                  <>
                    <SetRow name={t('仓库 / PR')} desc={status.gh.detail}>
                      <span className="chip">
                        <StatusDot status={status.gh.ok ? 'ok' : 'idle'} />
                        <span>{status.gh.ok ? 'Git' : '—'}</span>
                      </span>
                    </SetRow>
                    {status.gh.prUrl ? (
                      <SetRow name="PR" desc={status.gh.prUrl}>
                        <Button
                          variant="ghost"
                          icon="external"
                          onClick={() => void window.open(status.gh!.prUrl, '_blank')}
                        >
                          #{status.gh.prNumber} {status.gh.prTitle}
                        </Button>
                      </SetRow>
                    ) : null}
                  </>
                ) : null}
                {status?.terminalShell ? (
                  <div className="composer-hint" style={{ padding: '0 0 4px' }}>
                    {t('终端')}：{status.terminalShell.detail}
                  </div>
                ) : null}
                {status?.crossSession ? (
                  <div className="composer-hint" style={{ padding: '0 0 4px' }}>
                    {t('跨会话')}：{status.crossSession.detail}
                  </div>
                ) : null}
                {status?.multimodal ? (
                  <div className="composer-hint" style={{ padding: '0 0 4px' }}>
                    {t('多模态')}：{status.multimodal.supported ? t('支持') : t('未支持')} —{' '}
                    {status.multimodal.detail}
                  </div>
                ) : null}
                <SetRow
                  name={t('安全')}
                  desc={
                    appInfo
                      ? `contextIsolation ${String(appInfo.security.contextIsolation)} · nodeIntegration ${String(appInfo.security.nodeIntegration)} · sandbox ${String(appInfo.security.sandbox)}`
                      : '…'
                  }
                />
              </div>
            ) : null}

            {/* ---------- Skills（与 Composer / 只读同源） ---------- */}
            {nav === 'skills' ? (
              <div className="set-section">
                {status?.skills && status.skills.length > 0 ? (
                  status.skills.map((s) => (
                    <SetRow key={s.name} name={`/${s.name}`} desc={s.description} />
                  ))
                ) : (
                  <div className="composer-hint">
                    {t('没有探测到 Skills（~/.grok/skills 与 bundled 目录为空）')}
                  </div>
                )}
              </div>
            ) : null}

            {/* ---------- MCP 连接器（写 Grok CLI，与终端共用） ---------- */}
            {nav === 'mcp' ? (
              <div className="set-section">
                {status && status.mcp.length > 0 ? (
                  status.mcp.map((m) => (
                    <SetRow key={m.name} name={m.name} desc={m.command}>
                      <span className="chip">
                        <StatusDot status={m.enabled ? 'ok' : 'idle'} />
                        <span>{m.enabled ? t('已启用') : t('已停用')}</span>
                      </span>
                      <Switch
                        on={m.enabled}
                        tip={t('启停后热推到已活 ACP 会话')}
                        onChange={(v) => {
                          void window.perigee.integrations.setMcpEnabled(m.name, v).then(() => {
                            void window.perigee.integrations.status().then(setStatus)
                          })
                        }}
                      />
                    </SetRow>
                  ))
                ) : (
                  <div className="composer-hint">{t('没有配置 MCP 连接器')}</div>
                )}
                <div className="composer-hint" style={{ padding: '6px 0 0' }}>
                  {t('MCP 列表与启停写入 Grok CLI（~/.grok/config.toml），与终端共用；注入 session/new 并热更已活会话。')}
                </div>
              </div>
            ) : null}

            {/* ---------- 未接功能的页：原型占位 ---------- */}
            {activeNav.placeholder ? (
              <PlaceholderPage note={t('这一页还没接内容 —— 先占位。')} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
