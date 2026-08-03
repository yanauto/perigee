/**
 * 全部 ipcMain.handle 注册。通道名与返回形不得改动。
 */
import {
  app,
  dialog,
  ipcMain,
  shell,
  clipboard
} from 'electron'
import { join } from 'node:path'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { GrokBuildEngine } from '@perigee/engine-grok-build'
import { classifyMediaPath } from '@perigee/engine-grok-acp'
import {
  unifiedDiff,
  fetchGhStatus,
  gateCrossSessionSend,
  probeGcu,
  loadGrokConfigSnapshot,
  validateGrokBinary,
  resolveGrokBinary,
  listModelsViaCli,
  setMcpEnabled as setCliMcpEnabled,
  setPermissionModeInToml,
  cliPermissionToDesktop,
  desktopPermissionToCliWrite,
  configMtimeMs,
  userConfigPath,
  scanGrokSkills,
  exportDiagnostics,
  extractMentions,
  buildMentionPrompt,
  MENTION_MAX_BYTES,
  listExternalCliSessions,
  findExternalCliSession,
  removeExternalCliSession,
  sessionCommandCapabilities,
  parseSessionCommand,
  unsupportedResult,
  okResult,
  errorResult,
  aggregateUsageStats,
  type AppSettings,
  type MentionFile,
  type SessionCommandResult,
  type UsageRange,
  type RoutineCreateInput,
  type RoutinePatch
} from '@perigee/host-core'
import { openExternalSafe } from '../security.js'
import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso
} from '@perigee/event-schema'
import { renderMarkdown } from '@perigee/md-core'
import type { MainCtx } from '../ctx.js'

export function registerIpc(ctx: MainCtx): void {
  ipcMain.handle('app:getInfo', () => {
    const s = ctx.settingsStore.load()
    const bin = s.grokBinary || resolveGrokBinary()
    return {
      name: 'Perigee',
      version: app.getVersion(),
      phase: 'backend-w1-5',
      engineId: ctx.engine.id,
      engineName: ctx.engine.displayName ?? ctx.engine.id,
      engineModeConfigured: s.engineMode,
      engineModeActual: ctx.engineModeActual,
      grokAvailable: GrokBuildEngine.isAvailable(bin),
      grokVersion: ctx.grokVersion(),
      grokBinary: bin,
      platform: process.platform,
      security: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }
  })

  ipcMain.handle('settings:get', () => {
    const shell = ctx.settingsStore.load()
    const agent = ctx.agentConfigFromCli()
    // 聚合：agent 字段以 CLI 为准；壳字段 settings.json
    return {
      ...shell,
      permissionPolicy: agent.permissionPolicy,
      alwaysApproveTools: agent.permissionPolicy === 'yolo',
      model: shell.model || agent.model,
      mcp: { servers: agent.mcpServers },
      agentConfigSource: 'cli' as const,
      cliPermissionMode: agent.cliPermissionRaw,
      cliConfigPath: agent.snap.path,
      cliConfigNote: agent.permissionNote,
      cliMcpSource: agent.snap.mcpSource
    }
  })
  ipcMain.handle('settings:update', async (_e, partial: Partial<AppSettings>) => {
    // agent 字段不写 settings 真相源；壳字段照常
    const {
      permissionPolicy: _pp,
      alwaysApproveTools: _aa,
      mcp: _mcp,
      model: modelPartial,
      ...shellPartial
    } = partial as Partial<AppSettings> & Record<string, unknown>

    // grokBinary 允许根校验：拒绝任意路径 spawn（审计 Z5-02）
    if (
      shellPartial &&
      typeof (shellPartial as Partial<AppSettings>).grokBinary === 'string'
    ) {
      const vb = validateGrokBinary((shellPartial as Partial<AppSettings>).grokBinary)
      if (!vb.ok) {
        throw new Error(vb.reason)
      }
      ;(shellPartial as Partial<AppSettings>).grokBinary =
        vb.path === resolveGrokBinary() ? '' : vb.path
    }

    let next = ctx.settingsStore.load()
    const shellKeys = Object.keys(shellPartial).filter((k) => k !== 'undefined')
    if (shellKeys.length > 0) {
      next = ctx.settingsStore.update(shellPartial as Partial<AppSettings>)
    }
    ctx.shellRunner.setEnabled(!!next.terminalShellEnabled)

    const has = (k: keyof AppSettings) => partial[k] !== undefined
    const acpLive = !!ctx.engine.acp

    // 权限：热切 + ask/yolo 写 CLI toml
    if (has('permissionPolicy') || has('alwaysApproveTools')) {
      let policy = next.permissionPolicy
      if (partial.permissionPolicy) policy = partial.permissionPolicy
      else if (partial.alwaysApproveTools === true) policy = 'yolo'
      else if (partial.alwaysApproveTools === false) policy = 'ask'

      // 会话内存仍记一笔（壳侧缓存，非权威）
      next = ctx.settingsStore.update({
        permissionPolicy: policy,
        alwaysApproveTools: policy === 'yolo'
      })

      if (acpLive) ctx.engine.acp!.setPermissionPolicy(policy)

      const mapped = desktopPermissionToCliWrite(policy)
      if ('mode' in mapped && !('sessionOnly' in mapped && mapped.sessionOnly)) {
        const w = setPermissionModeInToml(mapped.mode, {
          expectedMtimeMs: configMtimeMs() ?? undefined
        })
        if (!w.ok) {
          console.warn('[perigee] permission toml write failed', w.detail)
        }
      }
      // plan / accept_edits：仅会话 set_mode，不写脏 CLI 键
    }

    // 模型：会话热切；可选写入 settings.model 作「上次输入」缓存，非 CLI 权威
    if (has('model') && modelPartial !== undefined) {
      next = ctx.settingsStore.update({ model: String(modelPartial ?? '') })
      if (acpLive) await ctx.engine.acp!.setModel(next.model || '')
      else if (has('engineMode') || has('grokBinary') || has('maxTurns') || has('turnTimeoutMs')) {
        /* fallthrough rebuild below */
      }
    }

    // MCP 列表变更：忽略 partial.mcp 写 settings；应用 CLI 当前列表热更
    if (has('mcp') && acpLive) {
      const agent = ctx.agentConfigFromCli()
      await ctx.engine.acp!.applyMcpServers(agent.mcpServers)
    }

    const onlyShellHot =
      !has('engineMode') &&
      !has('grokBinary') &&
      !has('maxTurns') &&
      !has('turnTimeoutMs') &&
      (has('permissionPolicy') ||
        has('alwaysApproveTools') ||
        has('model') ||
        has('mcp') ||
        has('layout') ||
        has('theme') ||
        has('fontSize') ||
        has('useWorktree') ||
        has('notifyOnTurnEnd') ||
        has('terminalShellEnabled') ||
        has('crossSessionSendEnabled'))

    if (
      has('engineMode') ||
      has('grokBinary') ||
      has('maxTurns') ||
      has('turnTimeoutMs')
    ) {
      ctx.engine = ctx.createEngine(ctx.settingsStore.load())
      ctx.sessions.setEngine(ctx.engine)
    } else if (!onlyShellHot && Object.keys(partial).length > 0 && !acpLive) {
      // headless 等：可能需重建
      if (has('permissionPolicy') || has('alwaysApproveTools') || has('model')) {
        ctx.engine = ctx.createEngine(ctx.settingsStore.load())
        ctx.sessions.setEngine(ctx.engine)
      }
    }

    const view = await (async () => {
      // 与 settings:get 同形
      const shell = ctx.settingsStore.load()
      const agent = ctx.agentConfigFromCli()
      return {
        ...shell,
        permissionPolicy: has('permissionPolicy')
          ? shell.permissionPolicy
          : agent.permissionPolicy,
        alwaysApproveTools: shell.permissionPolicy === 'yolo',
        model: shell.model || agent.model,
        mcp: { servers: agent.mcpServers },
        agentConfigSource: 'cli' as const,
        cliPermissionMode: agent.cliPermissionRaw,
        cliConfigPath: agent.snap.path,
        cliConfigNote: agent.permissionNote,
        cliMcpSource: agent.snap.mcpSource
      }
    })()
    ctx.broadcast('settings:changed', view)
    return view
  })

  ipcMain.handle('workspace:getState', () => {
    const state = ctx.workspaceStore.load()
    return { ...state, currentWorkspace: ctx.currentWorkspace }
  })
  ipcMain.handle('workspace:openDialog', async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, reason: 'canceled' }
    }
    return ctx.openWorkspace(result.filePaths[0])
  })
  ipcMain.handle('workspace:openPath', (_e, path: string) => ctx.openWorkspace(path))
  ipcMain.handle('workspace:close', () => {
    ctx.currentWorkspace = null
    ctx.fsService = null
    ctx.diffs = null
    const state = ctx.workspaceStore.clearLast()
    ctx.broadcast('workspace:changed', { currentWorkspace: null, state })
    return { ok: true as const }
  })
  ipcMain.handle('workspace:reveal', (_e, path: string) => {
    ctx.revealInFinder(path)
  })

  ipcMain.handle('fs:list', (_e, rel: string, depth?: number) => {
    if (!ctx.fsService) throw new Error('无工作区')
    return ctx.fsService.listDir(rel || '.', depth ?? 2)
  })
  /**
   * T027：读写**不再限制工作区**（任意绝对路径可读可写；相对路径仍以工作区为基准）。
   * 没有打开工作区时也能按绝对路径读写 —— 回退到以用户主目录为基准的服务实例。
   */
  ipcMain.handle('fs:read', (_e, rel: string) => ctx.fsAnyPath().readText(rel))
  ipcMain.handle('fs:write', (_e, rel: string, content: string) => {
    return { path: ctx.fsAnyPath().writeText(rel, content) }
  })
  /** T027：Finder 中显示——与 workspace:reveal 同一个实现（不造第二套） */
  ipcMain.handle('system:revealInFinder', (_e, p: string) => ctx.revealInFinder(p))
  /** T027：系统默认应用打开（应用内读不了时的兜底） */
  ipcMain.handle('system:openPath', async (_e, p: string) => {
    const target = String(p ?? '')
    if (!target) return { ok: false as const, reason: '空路径' }
    if (!existsSync(target)) return { ok: false as const, reason: `文件不存在: ${target}` }
    const reason = await shell.openPath(target)
    return reason ? { ok: false as const, reason } : { ok: true as const }
  })
  ipcMain.handle('md:render', (_e, source: string) => renderMarkdown(source))

  ipcMain.handle('session:list', () => ctx.sessions.list())
  ipcMain.handle('session:get', (_e, id: string) => ctx.sessions.get(id) ?? null)
  /** T008：标记会话已读 → attention=read（若无新活动） */
  ipcMain.handle('session:markRead', (_e, sessionId: string) => {
    const rec = ctx.sessions.markRead(String(sessionId || ''))
    if (rec) {
      ctx.persistSession(rec)
      ctx.broadcast('session:updated', ctx.sessions.list())
    }
    return { ok: !!rec }
  })
  /** T008/T011：用量聚合——token 以 usage-ledger 账本为准；messages/CLI 照旧 */
  ipcMain.handle('stats:usage', (_e, range?: UsageRange) => {
    const userData = app.getPath('userData')
    const tdir = join(userData, 'transcripts')
    ctx.usageLedger.ensureMigrated(tdir)
    const r = range === '7d' || range === '30d' || range === 'all' ? range : 'all'
    const sinceMs =
      r === 'all'
        ? null
        : Date.now() - (r === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000
    const ledgerEntries = ctx.usageLedger.readAll({ sinceMs }).map((e) => ({
      date: e.date,
      totalTokens: e.totalTokens,
      model: e.model,
      ts: e.ts,
      hour: e.hour,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens
    }))
    const meta = ctx.sessionStore.load().sessions
    return aggregateUsageStats({
      transcriptDir: tdir,
      desktopSessions: meta.map((s) => ({
        id: s.id,
        engineSessionId: s.engineSessionId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      range: r,
      ledgerEntries
    })
  })
  /** T008：通用 UI 状态桶 */
  ipcMain.handle('uiState:get', (_e, key: string) => ctx.uiStateStore.get(String(key ?? '')))
  ipcMain.handle('uiState:set', (_e, key: string, value: unknown) => {
    ctx.uiStateStore.set(String(key ?? ''), value)
    return { ok: true as const }
  })
  /** CLI ~/.grok/ctx.sessions 枚举（磁盘，不依赖 ACP 活进程） */
  ipcMain.handle(
    'session:listExternal',
    (_e, opts?: { cwd?: string; limit?: number }) =>
      listExternalCliSessions({
        cwd: opts?.cwd,
        limit: opts?.limit
      })
  )
  /**
   * 恢复 CLI 会话：ACP session/load + 历史事件回放。
   * 会打开/对齐工作区为 CLI cwd（若与当前不同则 ctx.openWorkspace）。
   */
  ipcMain.handle('session:resumeExternal', async (_e, cliSessionId: string) => {
    const ext = findExternalCliSession(String(cliSessionId || ''))
    if (!ext) {
      return {
        ok: false as const,
        reason: 'not_found',
        detail: `CLI 会话不存在: ${cliSessionId}`
      }
    }
    if (!ctx.engine.acp) {
      return {
        ok: false as const,
        reason: 'unsupported',
        detail: '需 ACP 引擎（设置 engineMode=acp）。headless 无 session/load'
      }
    }
    if (!ctx.currentWorkspace || ctx.currentWorkspace !== ext.cwd) {
      const opened = ctx.openWorkspace(ext.cwd)
      if (!opened?.ok) {
        return {
          ok: false as const,
          reason: 'workspace',
          detail: `无法打开工作区 ${ext.cwd}`
        }
      }
    }
    try {
      const s = ctx.settingsStore.load()
      const rec = await ctx.sessions.resumeCli(ext.id, ext.cwd, {
        title: ext.title || `CLI · ${ext.id.slice(0, 8)}`,
        primaryWorkspacePath: ext.cwd
      })
      ctx.termBuffers.set(rec.id, '')
      ctx.persistSession(rec)
      ctx.broadcast('session:updated', ctx.sessions.list())
      return { ok: true as const, session: rec, external: ext }
    } catch (e) {
      return {
        ok: false as const,
        reason: 'load_failed',
        detail: e instanceof Error ? e.message : String(e)
      }
    }
  })
  ipcMain.handle('session:commandCapabilities', () => sessionCommandCapabilities())
  ipcMain.handle(
    'session:command',
    async (_e, sessionId: string, cmd: string): Promise<SessionCommandResult> => {
      const raw = String(cmd ?? '')
      const parsed = parseSessionCommand(raw)
      const rec = ctx.sessions.get(sessionId)
      if (!rec && parsed.kind !== 'mcps') {
        return errorResult(raw, 'session not found')
      }

      if (parsed.kind === 'unknown') {
        return errorResult(raw, '无法解析命令')
      }
      if (parsed.kind === 'rewind') {
        return unsupportedResult(
          raw,
          'CLI /rewind 无 ACP session/rewind；文件级请用 diff.revertTurn。探针：Method not found + AvailableCommands 无 rewind'
        )
      }
      if (parsed.kind === 'model') {
        if (!ctx.engine.acp) {
          // settings 仍可记
          await ctx.settingsStore.update({ model: parsed.modelId })
          return okResult(raw, `已写入 settings.model=${parsed.modelId}（非 ACP 无法热切）`)
        }
        const r = await ctx.engine.acp!.setModel(parsed.modelId)
        await ctx.settingsStore.update({ model: parsed.modelId })
        ctx.broadcast('settings:changed', ctx.settingsStore.load())
        return r.ok
          ? okResult(raw, r.detail, r)
          : errorResult(raw, r.detail)
      }
      if (parsed.kind === 'effort') {
        if (!ctx.engine.acp) {
          return unsupportedResult(raw, 'effort 需 ACP session/set_model + _meta.reasoningEffort')
        }
        const r = await ctx.engine.acp!.setReasoningEffort(sessionId, parsed.effort)
        return r.ok ? okResult(raw, r.detail, r) : errorResult(raw, r.detail)
      }
      if (parsed.kind === 'compact') {
        if (!rec) return errorResult(raw, 'session not found')
        const text = parsed.preserveHint
          ? `/compact ${parsed.preserveHint}`
          : '/compact'
        try {
          await ctx.sessions.send(sessionId, text, text)
          return okResult(raw, '已发送 /compact（AvailableCommand 路径）')
        } catch (e) {
          return errorResult(raw, e instanceof Error ? e.message : String(e))
        }
      }
      if (parsed.kind === 'skill') {
        if (!rec) return errorResult(raw, 'session not found')
        const text = parsed.args
          ? `/${parsed.skillName} ${parsed.args}`
          : `/${parsed.skillName}`
        try {
          await ctx.sessions.send(sessionId, text, text)
          return okResult(raw, `已发送 ${text}（skill/AvailableCommand）`)
        } catch (e) {
          return errorResult(raw, e instanceof Error ? e.message : String(e))
        }
      }
      if (parsed.kind === 'mcps') {
        const snap = loadGrokConfigSnapshot({ preferCliList: true })
        if (parsed.action === 'list') {
          return okResult(raw, `MCP ${snap.mcpServers.length} 项`, {
            servers: snap.mcpServers
          })
        }
        if (!parsed.name) {
          return errorResult(raw, '用法: mcps enable|disable <name>')
        }
        const enabled = parsed.action === 'enable'
        const r = setCliMcpEnabled(parsed.name, enabled)
        if (!r.ok) {
          return errorResult(raw, r.detail || 'mcp 切换失败')
        }
        // 与 integrations:setMcpEnabled 对齐：CLI 为准 + ACP 热更
        const agent = ctx.agentConfigFromCli()
        if (ctx.engine.acp) {
          try {
            await ctx.engine.acp!.applyMcpServers(agent.mcpServers)
          } catch {
            /* best-effort */
          }
        }
        const shell = ctx.settingsStore.load()
        ctx.broadcast('settings:changed', {
          ...shell,
          mcp: { servers: agent.mcpServers },
          agentConfigSource: 'cli' as const
        })
        return okResult(
          raw,
          r.detail || `${parsed.name} → ${enabled ? 'on' : 'off'}`,
          { servers: agent.mcpServers }
        )
      }
      return errorResult(raw, '未处理的命令')
    }
  )
  ipcMain.handle('session:create', async (_e, title?: string) => {
    if (!ctx.currentWorkspace) throw new Error('请先打开工作区')
    const s = ctx.settingsStore.load()
    let engineCwd = ctx.currentWorkspace
    let worktreePath: string | undefined
    let worktreeBranch: string | undefined
    const sessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    if (s.useWorktree && ctx.worktrees) {
      const wt = ctx.worktrees.create(ctx.currentWorkspace, sessionId)
      if (wt) {
        engineCwd = wt.worktreePath
        worktreePath = wt.worktreePath
        worktreeBranch = wt.branch
      }
    }
    const rec = await ctx.sessions.create(engineCwd, {
      id: sessionId,
      title,
      kind: 'main',
      primaryWorkspacePath: ctx.currentWorkspace,
      engineCwd,
      worktreePath,
      worktreeBranch
    })
    ctx.termBuffers.set(rec.id, '')
    ctx.persistSession(rec)
    ctx.broadcast('session:updated', ctx.sessions.list())
    return rec
  })
  /** 侧问：第二 ACP 会话，不写回主 ctx.transcript */
  ipcMain.handle('session:createSide', async (_e, parentSessionId: string) => {
    const parent = ctx.sessions.get(parentSessionId)
    if (!parent) throw new Error('parent session not found')
    const s = ctx.settingsStore.load()
    const rec = await ctx.sessions.create(parent.workspacePath, {
      title: `侧问 · ${parent.title}`,
      kind: 'side',
      parentSessionId,
      primaryWorkspacePath: parent.primaryWorkspacePath,
      engineCwd: parent.workspacePath,
      worktreePath: parent.worktreePath
    })
    ctx.termBuffers.set(rec.id, '')
    ctx.broadcast('session:updated', ctx.sessions.list())
    return rec
  })
  ipcMain.handle('session:revealWorktree', async (_e, sessionId: string) => {
    const rec = ctx.sessions.get(sessionId)
    if (!rec?.worktreePath) return { ok: false as const, reason: 'no worktree' }
    await shell.openPath(rec.worktreePath)
    return { ok: true as const, path: rec.worktreePath }
  })
  /**
   * 丢弃 worktree 改动并删除会话（ADR 0009：不自动 merge 主仓）。
   * 对齐 T029/T030 remove：先墓碑+UI 消失，引擎 dispose 后台做（审计 Z1-07）。
   */
  ipcMain.handle('session:discardWorktree', async (_e, sessionId: string) => {
    const id = String(sessionId || '')
    const rec = ctx.sessions.get(id)
    if (!rec) return { ok: false as const, reason: 'not_found' }
    ctx.sessionStore.remove(id)
    const sideIds = ctx.sessions.forget(id)
    ctx.termBuffers.delete(id)
    ctx.diffs?.clearSession(id)
    try {
      ctx.transcript.remove(id)
    } catch {
      /* */
    }
    if (rec.engineSessionId) {
      try {
        removeExternalCliSession(rec.engineSessionId)
      } catch {
        /* */
      }
    }
    ctx.broadcast('session:updated', ctx.sessions.list())
    ctx.broadcastDiffs()
    void (async () => {
      try {
        ctx.ptyService.kill(id)
        ctx.shellRunner.kill(id)
        for (const sid of sideIds) {
          try {
            ctx.ptyService.kill(sid)
            ctx.shellRunner.kill(sid)
          } catch {
            /* */
          }
        }
        await ctx.sessions.dispose(id, sideIds)
        if (rec.worktreePath && rec.primaryWorkspacePath && ctx.worktrees) {
          ctx.worktrees.remove(rec.primaryWorkspacePath, rec.worktreePath)
        }
      } catch {
        /* 清理失败不回滚删除 */
      }
    })()
    return { ok: true as const, discarded: !!rec.worktreePath }
  })
  ipcMain.handle('session:worktreeStatus', (_e, sessionId: string) => {
    const rec = ctx.sessions.get(sessionId)
    if (!rec?.worktreePath) {
      return { ok: false as const, reason: 'no_worktree' }
    }
    if (!ctx.worktrees) return { ok: false as const, reason: 'no_service' }
    return ctx.worktrees.status(rec.primaryWorkspacePath, rec.worktreePath)
  })
  /** promote = push + 可选 gh pr；永不 merge 主仓 */
  ipcMain.handle(
    'session:promote',
    async (
      _e,
      sessionId: string,
      opts?: { pushOnly?: boolean; title?: string; body?: string; base?: string }
    ) => {
      const rec = ctx.sessions.get(sessionId)
      if (!rec?.worktreePath) {
        return { ok: false as const, reason: 'no_worktree', detail: '无 worktree' }
      }
      if (!ctx.worktrees) {
        return { ok: false as const, reason: 'no_service', detail: 'WorktreeService 未初始化' }
      }
      const result = ctx.worktrees.promote({
        primaryWorkspacePath: rec.primaryWorkspacePath,
        worktreePath: rec.worktreePath,
        branch: rec.worktreeBranch,
        title: opts?.title ?? rec.title,
        body: opts?.body,
        base: opts?.base,
        pushOnly: opts?.pushOnly
      })
      return result
    }
  )
  /** F2 跨会话发送（settings.crossSessionSendEnabled） */
  ipcMain.handle(
    'session:sendCross',
    async (_e, fromSessionId: string, toSessionId: string, text: string) => {
      const s = ctx.settingsStore.load()
      const from = ctx.sessions.get(fromSessionId)
      const to = ctx.sessions.get(toSessionId)
      const gate = gateCrossSessionSend(
        { enabled: !!s.crossSessionSendEnabled },
        {
          fromSessionId,
          toSessionId,
          text,
          fromKind: from?.kind,
          toKind: to?.kind
        }
      )
      if (!gate.ok) return { ok: false as const, reason: gate.reason }
      if (!to) return { ok: false as const, reason: 'target_not_found' }
      await ctx.sessions.send(toSessionId, gate.displayText, gate.engineText)
      ctx.broadcast('session:updated', ctx.sessions.list())
      return { ok: true as const }
    }
  )
  ipcMain.handle(
    'session:send',
    async (
      _e,
      sessionId: string,
      text: string,
      opts?: { mediaPaths?: string[] }
    ) => {
      const sess = ctx.sessions.get(sessionId)
      if (ctx.diffs && ctx.fsService && sess?.kind !== 'side') {
        try {
          const top = ctx.fsService.listDir('.', 1)
          for (const e of top) {
            if (!e.isDirectory) ctx.diffs.captureBefore(sessionId, e.relativePath)
          }
        } catch {
          /* ignore */
        }
      }
      let displayText = text
      let engineText = text
      // 侧问：展示原文，引擎拿约束包装（不污染主 session）
      if (sess?.kind === 'side') {
        const t = text.trim()
        displayText = t
        engineText =
          `【侧问 / side question · 独立会话】请简短回答。` +
          `不要开始改代码、不要跑破坏性命令、不要写文件；` +
          `若需要改动请只给建议，由用户在主会话下达。\n\n${t}`
      } else if (ctx.fsService) {
        // 文本 @mention 展开（非图片）
        const paths = extractMentions(text)
        const textFiles: MentionFile[] = []
        for (const p of paths) {
          const kind = classifyMediaPath(p)
          if (kind === 'image' || kind === 'pdf') continue
          try {
            const r = ctx.fsService.readText(p, MENTION_MAX_BYTES)
            textFiles.push({ path: p, content: r.content, truncated: r.truncated })
          } catch {
            /* skip */
          }
        }
        if (textFiles.length > 0) engineText = buildMentionPrompt(text, textFiles)
      }

      // D1-B：媒体路径 → ACP content blocks
      const mediaPaths = [
        ...(opts?.mediaPaths ?? []),
        ...extractMentions(text).filter((p) => {
          const k = classifyMediaPath(p)
          return k === 'image' || k === 'pdf'
        })
      ]
      const media = ctx.loadMediaParts(mediaPaths, sess?.workspacePath ?? ctx.currentWorkspace)

      /**
       * T029：首条消息回填标题。Desktop 原生会话的标题一直停在默认的「会话 N」——
       * 侧栏一排同名会话正是「幽灵增殖」观感的另一半。只在**仍是默认名**时回填，
       * 用户手动改过的名字绝不覆盖。
       */
      if (sess && /^会话 \d+$/.test(sess.title.trim())) {
        const line = displayText.trim().split('\n').find((l) => l.trim()) ?? ''
        const auto = line.replace(/\s+/g, ' ').trim().slice(0, 24)
        if (auto) {
          const renamed = ctx.sessions.rename(sessionId, auto)
          if (renamed) ctx.persistSession(renamed)
        }
      }

      await ctx.sessions.send(sessionId, displayText, engineText, media.length ? media : undefined)
      /* T029：轮次可能跑很久，期间会话可能被删——重新取一次，别用旧引用把它写回盘 */
      const still = ctx.sessions.get(sessionId)
      if (still) ctx.persistSession(still)
      ctx.broadcast('session:updated', ctx.sessions.list())
      return { ok: true, mediaCount: media.length }
    }
  )
  ipcMain.handle('session:restart', async (_e, sessionId: string) => {
    const rec = ctx.sessions.get(sessionId)
    if (!rec) throw new Error('session not found')
    await ctx.sessions.dispose(sessionId)
    await ctx.engine.startSession({
      sessionId: rec.id,
      workspacePath: rec.workspacePath
    })
    ctx.sessions.hydrate({ ...rec, status: 'idle', engineId: ctx.engine.id })
    ctx.broadcast('session:updated', ctx.sessions.list())
    return { ok: true }
  })
  /**
   * T029：会话历史 = 内存 ctx.bus 优先，**为空时从 ctx.transcript 回灌**。
   * 根因：EventBus 是纯进程内的，重启后 Desktop 原生会话历史全丢，
   * 而 ctx.transcript 一直只写不读 —— 点进去就是空白（被当成「幽灵空会话」）。
   */
  ipcMain.handle('session:history', (_e, sessionId: string) => {
    const id = String(sessionId || '')
    if (!ctx.bus.hasHistory(id)) {
      try {
        const persisted = ctx.transcript.readAll(id)
        if (persisted.length > 0) ctx.bus.seed(id, persisted)
      } catch {
        /* ctx.transcript 损坏/缺失：退回空历史，不炸 */
      }
    }
    return ctx.bus.history(id)
  })
  ipcMain.handle('session:cancel', async (_e, sessionId: string) => {
    await ctx.sessions.cancel(sessionId)
    return { ok: true }
  })
  ipcMain.handle('session:export', async (_e, sessionId: string) => {
    const rec = ctx.sessions.get(sessionId)
    if (!rec) throw new Error('session not found')
    const { filePath, canceled } = await dialog.showSaveDialog(ctx.mainWindow!, {
      defaultPath: join(homedir(), 'Desktop', `${rec.title.replace(/\s+/g, '-')}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return { ok: false as const }
    ctx.transcript.writeExport(sessionId, rec.title, filePath)
    return { ok: true as const, path: filePath }
  })

  ipcMain.handle('session:rename', (_e, sessionId: string, title: string) => {
    const rec = ctx.sessions.rename(sessionId, title)
    if (!rec) throw new Error('session not found')
    ctx.persistSession(rec)
    ctx.broadcast('session:updated', ctx.sessions.list())
    return rec
  })
  /**
   * T029 删除：**先落盘 + 先广播**（UI 当下消失），引擎 dispose 放后台。
   * 旧实现先 `await sessions.dispose()`，而 ACP dispose 内部会等 `session/cancel`（最长 5s），
   * 期间 UI 毫无反馈 —— 用户以为「点了没反应」，连点几次。
   * 落盘删除同时打墓碑，迟到的 ctx.persistSession 再也写不回来（治「重开又复现」）。
   */
  ipcMain.handle('session:remove', async (_e, sessionId: string) => {
    const id = String(sessionId || '')
    const rec = ctx.sessions.get(id)
    ctx.sessionStore.remove(id) // 打墓碑 + 落盘移除
    const sideIds = ctx.sessions.forget(id) // 内存态立即移除；返回 side 供后台 dispose
    ctx.termBuffers.delete(id)
    ctx.diffs?.clearSession(id)
    ctx.broadcast('session:updated', ctx.sessions.list())
    ctx.broadcastDiffs()
    /* T030：确认删除 = 物理删除（维护者拍板推翻 T029 的保守语义）
       —— 本会话自己的 ctx.transcript + 关联的 CLI ctx.transcript 目录都从磁盘删掉 */
    try {
      ctx.transcript.remove(id)
    } catch {
      /* ctx.transcript 不存在/已删：忽略 */
    }
    let removedCli: string | undefined
    // 优先 rec；若运行中刚回写了 engineSessionId 已随 rec 捕获
    const cliId = rec?.engineSessionId
    if (cliId) {
      const r = removeExternalCliSession(cliId)
      if (r.ok) removedCli = r.removed
    }
    /* 引擎/子进程清理：不阻塞返回；dispose 必须带 sideIds（forget 后 Map 已无 side） */
    void (async () => {
      try {
        ctx.ptyService.kill(id)
        ctx.shellRunner.kill(id)
        for (const sid of sideIds) {
          try {
            ctx.ptyService.kill(sid)
            ctx.shellRunner.kill(sid)
          } catch {
            /* */
          }
        }
        await ctx.sessions.dispose(id, sideIds)
        if (rec?.worktreePath && rec.primaryWorkspacePath && ctx.worktrees) {
          ctx.worktrees.remove(rec.primaryWorkspacePath, rec.worktreePath)
        }
      } catch {
        /* 清理失败不回滚删除：记录已从盘上移除，重启不会复活 */
      }
    })()
    return { ok: true as const, removedCli }
  })

  /**
   * T030：物理删除外部 CLI 会话（`~/.grok/sessions/<cwd-key>/<id>/` 整目录）。
   * 破坏性操作，路径安全闸在 host-core `removeExternalCliSession`（realpath + 根包含 + 深度 + 名字匹配）。
   */
  ipcMain.handle('session:removeExternal', (_e, cliSessionId: string) => {
    const id = String(cliSessionId ?? '')
    const r = removeExternalCliSession(id)
    if (r.ok) {
      /* 该 CLI 会话若已被恢复成 Desktop 会话，它们的 engineSessionId 就此指空——记录本身不动 */
      ctx.broadcast('session:updated', ctx.sessions.list())
    }
    return r
  })

  ipcMain.handle('diff:list', (_e, sessionId?: string) => ctx.diffs?.list(sessionId) ?? [])
  ipcMain.handle('diff:unified', (_e, id: string) => {
    const d = ctx.diffs?.get(id)
    if (!d) throw new Error('diff not found')
    return unifiedDiff(d.relativePath, d.before, d.after)
  })
  ipcMain.handle('diff:accept', (_e, id: string) => {
    if (!ctx.diffs) throw new Error('no diffs')
    const d = ctx.diffs.accept(id)
    ctx.broadcastDiffs()
    return d
  })
  ipcMain.handle('diff:reject', (_e, id: string) => {
    if (!ctx.diffs) throw new Error('no diffs')
    const d = ctx.diffs.reject(id)
    ctx.broadcastDiffs()
    return d
  })
  ipcMain.handle('diff:acceptAll', (_e, sessionId: string) => {
    if (!ctx.diffs) return []
    const r = ctx.diffs.acceptAll(sessionId)
    ctx.broadcastDiffs()
    return r
  })
  ipcMain.handle('diff:rejectAll', (_e, sessionId: string) => {
    if (!ctx.diffs) return []
    const r = ctx.diffs.rejectAll(sessionId)
    ctx.broadcastDiffs()
    return r
  })
  ipcMain.handle('diff:revertTurn', (_e, sessionId: string, turnId: string) => {
    if (!ctx.diffs) return []
    const r = ctx.diffs.revertTurn(sessionId, turnId)
    ctx.broadcastDiffs()
    return r
  })

  ipcMain.handle('approval:list', (_e, sessionId?: string) =>
    ctx.approvals.listPending(sessionId)
  )
  ipcMain.handle(
    'approval:resolve',
    (_e, id: string, approved: boolean, policy?: 'always-ask' | 'session-allow' | 'always-allow') => {
      const req = ctx.approvals.resolve(id, approved, policy ?? 'always-ask')
      if (req) {
        // 回写 ACP（engineRequestId 在 request 时已登记，无需反查历史）
        if (req.engineRequestId && ctx.engine.acp) {
          ctx.engine.acp.resolvePermission(
            req.sessionId,
            req.engineRequestId,
            approved
          )
        }
        ctx.bus.publish({
          type: 'approval.resolved',
          schemaVersion: EVENT_SCHEMA_VERSION,
          sessionId: req.sessionId,
          id: newEventId('ar'),
          requestId: id,
          ts: nowIso(),
          approved
        })
      }
      ctx.broadcast('approval:updated', ctx.approvals.listPending())
      return req
    }
  )

  ipcMain.handle('diagnostics:export', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(ctx.mainWindow!, {
      properties: ['openDirectory', 'createDirectory']
    })
    const base =
      !canceled && filePaths[0]
        ? filePaths[0]
        : join(app.getPath('desktop'), 'perigee-diagnostics')
    const out = exportDiagnostics({
      userDataDir: app.getPath('userData'),
      outDir: base,
      settings: ctx.settingsStore.load(),
      sessionsMeta: ctx.sessionStore.load(),
      engineInfo: {
        engineModeActual: ctx.engineModeActual,
        engineId: ctx.engine.id,
        grokVersion: ctx.grokVersion()
      }
    })
    shell.showItemInFolder(out)
    return { ok: true, path: out }
  })

  ipcMain.handle('terminal:read', (_e, sessionId: string) => ctx.termBuffers.get(sessionId) ?? '')
  ipcMain.handle('terminal:clear', (_e, sessionId: string) => {
    ctx.termBuffers.set(sessionId, '')
    return { ok: true }
  })
  ipcMain.handle('terminal:availability', () => ctx.ptyService.availability())
  ipcMain.handle('terminal:attach', (_e, sessionId: string, size?: { cols: number; rows: number }) => {
    const s = ctx.settingsStore.load()
    const rec = ctx.sessions.get(sessionId)
    const cwd = rec?.workspacePath ?? ctx.currentWorkspace
    const mode = s.terminalMode ?? (s.terminalShellEnabled ? 'shell-c' : 'echo')
    if (mode !== 'pty') {
      return { ok: true, mode: mode as string }
    }
    if (!cwd) return { ok: false, mode: 'pty', reason: 'no_cwd' }
    const av = ctx.ptyService.availability()
    if (!av.pty) {
      return { ok: false, mode: 'pty-fallback', reason: av.reason }
    }
    const r = ctx.ptyService.attach(sessionId, cwd, size)
    if (!r.ok) return { ok: false, mode: 'pty-fallback', reason: r.reason }
    return { ok: true, mode: 'pty' as const }
  })
  ipcMain.handle('terminal:writeRaw', (_e, sessionId: string, data: string) => {
    if (typeof data !== 'string') return { ok: false, reason: 'bad_data' }
    const s = ctx.settingsStore.load()
    const mode = s.terminalMode ?? (s.terminalShellEnabled ? 'shell-c' : 'echo')
    if (mode === 'pty' && ctx.ptyService.isAlive(sessionId)) {
      return ctx.ptyService.write(sessionId, data)
    }
    // 未 attach 时尝试 attach
    if (mode === 'pty') {
      const rec = ctx.sessions.get(sessionId)
      const cwd = rec?.workspacePath ?? ctx.currentWorkspace
      if (cwd && ctx.ptyService.availability().pty) {
        const a = ctx.ptyService.attach(sessionId, cwd)
        if (a.ok) return ctx.ptyService.write(sessionId, data)
      }
      return { ok: false, reason: 'pty_unavailable' }
    }
    return { ok: false, reason: 'not_pty_mode' }
  })
  ipcMain.handle(
    'terminal:resize',
    (_e, sessionId: string, cols: number, rows: number) => {
      if (ctx.ptyService.isAlive(sessionId)) return ctx.ptyService.resize(sessionId, cols, rows)
      return { ok: false, reason: 'not_attached' }
    }
  )
  ipcMain.handle('terminal:write', (_e, sessionId: string, line: string) => {
    const s = ctx.settingsStore.load()
    const rec = ctx.sessions.get(sessionId)
    const cwd = rec?.workspacePath ?? ctx.currentWorkspace
    const mode = s.terminalMode ?? (s.terminalShellEnabled ? 'shell-c' : 'echo')
    if (mode === 'pty') {
      const av = ctx.ptyService.availability()
      if (av.pty && cwd) {
        if (!ctx.ptyService.isAlive(sessionId)) {
          const a = ctx.ptyService.attach(sessionId, cwd)
          if (!a.ok) {
            ctx.appendTerm(
              sessionId,
              `› ${line}\n[pty attach 失败: ${a.reason}；降级 shell-c]\n`
            )
          }
        }
        if (ctx.ptyService.isAlive(sessionId)) {
          const data = line.endsWith('\n') ? line : `${line}\n`
          const w = ctx.ptyService.write(sessionId, data)
          if (w.ok) return { ok: true, mode: 'pty' as const }
        }
      } else {
        ctx.appendTerm(
          sessionId,
          `› ${line}\n[pty 不可用: ${av.reason ?? 'unknown'}；降级 shell-c]\n`
        )
      }
      // 降级 shell-c
      if (cwd) {
        ctx.shellRunner.setEnabled(true)
        const r = ctx.shellRunner.run(sessionId, cwd, line)
        if (r.ok) return { ok: true, mode: 'shell-c-fallback' as const }
      }
      return { ok: true, mode: 'pty-unavailable' as const }
    }
    if ((mode === 'shell-c' || s.terminalShellEnabled) && cwd) {
      ctx.shellRunner.setEnabled(true)
      const r = ctx.shellRunner.run(sessionId, cwd, line)
      if (r.ok) return { ok: true, mode: 'shell' as const }
      ctx.appendTerm(sessionId, `› ${line}\n[shell 失败: ${r.reason}]\n`)
      return { ok: true, mode: 'echo' as const, reason: r.reason }
    }
    ctx.appendTerm(sessionId, `› ${line}\n`)
    return { ok: true, mode: 'echo' as const }
  })
  ipcMain.handle('terminal:kill', (_e, sessionId: string) => {
    if (ctx.ptyService.isAlive(sessionId)) {
      ctx.ptyService.kill(sessionId)
      ctx.appendTerm(sessionId, '\n^C\n')
      return { ok: true }
    }
    ctx.shellRunner.kill(sessionId)
    ctx.appendTerm(sessionId, '\n^C\n')
    return { ok: true }
  })
  ipcMain.handle('terminal:status', (_e, sessionId: string) => {
    const s = ctx.settingsStore.load()
    const rec = ctx.sessions.get(sessionId)
    const mode = s.terminalMode ?? (s.terminalShellEnabled ? 'shell-c' : 'echo')
    const ptyAlive = ctx.ptyService.isAlive(sessionId)
    let effective: string = mode
    if (mode === 'pty' && !ctx.ptyService.availability().pty) effective = 'pty-fallback'
    else if (mode === 'pty' && ptyAlive) effective = 'pty'
    return {
      cwd: rec?.workspacePath ?? ctx.currentWorkspace,
      shellEnabled: !!s.terminalShellEnabled || mode === 'shell-c' || mode === 'pty',
      running: ctx.shellRunner.isRunning(sessionId) || ptyAlive,
      mode: effective,
      ptyAlive
    }
  })
  /** 预览：系统浏览器打开 URL（≠ GCU） */
  ipcMain.handle('preview:open', async (_e, url: string) => {
    const { validatePreviewUrl } = await import('../preview-url.js')
    const v = validatePreviewUrl(url)
    if (!v.ok) return { ok: false as const, reason: v.reason }
    await shell.openExternal(v.url)
    ctx.settingsStore.update({ lastPreviewUrl: v.url })
    return { ok: true as const, url: v.url }
  })

  ipcMain.handle('integrations:status', async () => {
    const s = ctx.settingsStore.load()
    const agent = ctx.agentConfigFromCli()
    const gcuMcp = agent.mcpServers.find(
      (m) => m.name === 'grok-computer-use' || m.name === 'gcu'
    )
    const gcu = await probeGcu(s.gcu.bridgeUrl, gcuMcp?.command)
    const gh = fetchGhStatus(ctx.currentWorkspace)
    return {
      gcu,
      mcp: agent.mcpServers,
      grokBinary: s.grokBinary || resolveGrokBinary(),
      grokAvailable: GrokBuildEngine.isAvailable(s.grokBinary || resolveGrokBinary()),
      skills: scanGrokSkills(),
      multimodal: (() => {
        const caps = ctx.engine.acp?.getPromptCapabilities()
        return {
          supported: !!(caps?.image || caps?.embeddedContext),
          image: caps?.image === true,
          embeddedContext: caps?.embeddedContext === true,
          detail: caps
            ? `ACP promptCapabilities image=${caps.image} embeddedContext=${caps.embeddedContext}`
            : '尚未 initialize ACP；发送图/PDF 时按能力协商，失败降级 resource_link'
        }
      })(),
      modelHotSwitch: (() => {
        if (ctx.engine.acp) {
          const h = ctx.engine.acp!.getHotStatus().model
          return {
            policy: 'hot' as const,
            detail: h.detail || 'ACP 活会话走 session/set_model；失败不自动 rebuild'
          }
        }
        return {
          policy: 'rebuild' as const,
          detail: '非 ACP 主路径：改 model 会重建引擎'
        }
      })(),
      terminalShell: {
        enabled: !!s.terminalShellEnabled,
        detail: s.terminalShellEnabled
          ? '会话 cwd 下 shell -c 执行（非交互式完整 PTY）'
          : '关闭（echo 模式）'
      },
      crossSession: {
        enabled: !!s.crossSessionSendEnabled,
        detail: s.crossSessionSendEnabled
          ? '允许跨主会话投递文本'
          : '关闭（session.sendCross 拒绝）'
      },
      mcpHotReload: (() => {
        if (!ctx.engine.acp) {
          return { ok: false, detail: '非 ACP，无热更' }
        }
        const h = ctx.engine.acp!.getHotStatus().mcp
        return { ok: h.ok, detail: h.detail, at: h.at }
      })(),
      permissionHot: (() => {
        if (!ctx.engine.acp) {
          return { ok: false, detail: '非 ACP' }
        }
        const h = ctx.engine.acp!.getHotStatus().mode
        return { ok: h.ok, detail: h.detail, at: h.at }
      })(),
      acpHot: ctx.engine.acp?.getHotStatus() ?? null,
      liveSessionCount: ctx.sessions.list({ includeSide: true }).length,
      gh
    }
  })
  ipcMain.handle('integrations:listSkills', () => scanGrokSkills())
  /** ADR 0011：模型列表来自 `grok models`，不另建目录 */
  ipcMain.handle('integrations:listModels', () => {
    const listed = listModelsViaCli()
    if (listed) return listed
    const snap = loadGrokConfigSnapshot({ preferCliList: false })
    const id = snap.forkSecondaryModel
    return {
      defaultModel: id,
      models: id ? [{ id, isDefault: true }] : [],
      detail: 'grok models 不可用；回退 config fork_secondary_model'
    }
  })
  ipcMain.handle('integrations:setMcpEnabled', async (_e, name: string, enabled: boolean) => {
    // ADR 0011：写 CLI（grok mcp enable/disable），不写 settings.json
    const w = setCliMcpEnabled(name, enabled)
    if (!w.ok) {
      throw new Error(w.detail || 'MCP 启停失败')
    }
    const agent = ctx.agentConfigFromCli()
    if (ctx.engine.acp) await ctx.engine.acp!.applyMcpServers(agent.mcpServers)
    const shell = ctx.settingsStore.load()
    const view = {
      ...shell,
      mcp: { servers: agent.mcpServers },
      permissionPolicy: cliPermissionToDesktop(agent.snap.permissionMode).policy,
      agentConfigSource: 'cli' as const
    }
    ctx.broadcast('settings:changed', view)
    return agent.mcpServers
  })
  ipcMain.handle('integrations:ghStatus', () => fetchGhStatus(ctx.currentWorkspace))
  ipcMain.handle('integrations:gcuStatus', async () => {
    const s = ctx.settingsStore.load()
    const agent = ctx.agentConfigFromCli()
    const gcuMcp = agent.mcpServers.find(
      (m) => m.name === 'grok-computer-use' || m.name === 'gcu'
    )
    return probeGcu(s.gcu.bridgeUrl, gcuMcp?.command)
  })
  /** 打开 / 展示 CLI 配置路径（不再写 Desktop settings） */
  ipcMain.handle('integrations:gcuAlignMcpCommand', () => {
    const agent = ctx.agentConfigFromCli()
    const gcu = agent.mcpServers.find((m) => m.name === 'grok-computer-use')
    return {
      ok: true as const,
      command: gcu?.command || '',
      resolved: !!gcu?.command,
      source: agent.snap.mcpSource,
      servers: agent.mcpServers,
      cliConfigPath: userConfigPath(),
      detail: 'MCP 以 ~/.grok 为准；请用 grok mcp 或编辑 config.toml'
    }
  })
  /** 显式重建引擎（模型热切失败时的降级出口） */
  ipcMain.handle('integrations:rebuildEngine', async () => {
    const s = ctx.settingsStore.load()
    ctx.engine = ctx.createEngine(s)
    ctx.sessions.setEngine(ctx.engine)
    ctx.broadcast('settings:changed', s)
    return {
      ok: true as const,
      engineId: ctx.engine.id,
      engineModeActual: ctx.engineModeActual
    }
  })

  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(text)
    return { ok: true }
  })

  /**
   * T006：剪贴板图片落盘 → 绝对路径，供 mediaPaths 多模态管线。
   * 无图返回 null。
   */
  ipcMain.handle('clipboard:saveImage', () => {
    try {
      const img = clipboard.readImage()
      if (!img || img.isEmpty()) return null
      const png = img.toPNG()
      if (!png || png.length === 0) return null
      const dir = join(app.getPath('userData'), 'attachments')
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
      const file = join(dir, `paste-${stamp}-${Math.random().toString(36).slice(2, 7)}.png`)
      writeFileSync(file, png)
      return file
    } catch (e) {
      console.warn('[clipboard:saveImage]', e)
      return null
    }
  })

  /**
   * T006：上下文占比。
   * 窗口：ACP models._meta.totalContextTokens（探针 grok-4.5=500000）
   * 已用：usage / prompt _meta.totalTokens
   * 无数据 → ok:false + detail，不编造窗口。
   */
  ipcMain.handle('session:contextInfo', (_e, sessionId: string) => {
    const sid = String(sessionId || '')
    // 优先 ACP 引擎内存
    if (ctx.engine.acp) {
      const fromEng = ctx.engine.acp!.getContextInfo(sid)
      if (fromEng.ok) return fromEng
      // 引擎有窗口但尚无 usage：仍返回窗口（pct 可缺）
      if (fromEng.windowTokens != null) return { ...fromEng, ok: true }
    }
    // 回退：扫 EventBus history 的 usage 事件
    // 分子 = 上下文占用（input/prompt），勿用 in+out 账单合计
    const hist = ctx.bus.history(sid)
    let usedTokens: number | undefined
    let raw: unknown
    for (let i = hist.length - 1; i >= 0; i--) {
      const ev = hist[i]
      if (ev.type !== 'usage') continue
      const u = ev as {
        inputTokens?: number
        outputTokens?: number
        raw?: Record<string, unknown>
      }
      const r = u.raw ?? {}
      const used =
        ctx.numOrUndef(
          r.contextTokens ??
            r.context_tokens ??
            r.promptTokens ??
            r.prompt_tokens ??
            r.inputTokens ??
            r.input_tokens
        ) ?? ctx.numOrUndef(u.inputTokens)
      if (used != null) {
        usedTokens = used
        raw = u.raw
        break
      }
    }
    // headless / 无 ACP 窗口：只用到 tokens 时 ok 部分信息；窗口缺失不编造
    if (usedTokens == null) {
      return {
        ok: false as const,
        source: ctx.engineModeActual,
        detail:
          '尚无 usage 事件，且 ACP 未提供 totalContextTokens。发一轮消息或确认 engineMode=acp'
      }
    }
    return {
      ok: true as const,
      usedTokens,
      windowTokens: undefined as number | undefined,
      usagePct: undefined as number | undefined,
      source: 'usage-history',
      detail: '仅有已用 tokens；窗口总量需 ACP models._meta.totalContextTokens',
      raw
    }
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    openExternalSafe(String(url ?? ''))
  })

  // ── T018 Routines ──────────────────────────────────────────
  ipcMain.handle('routines:list', () => ctx.routineScheduler.list())
  ipcMain.handle('routines:create', (_e, input: RoutineCreateInput) => {
    return ctx.routineScheduler.create(input)
  })
  ipcMain.handle('routines:update', (_e, id: string, patch: RoutinePatch) => {
    return ctx.routineScheduler.update(String(id ?? ''), patch ?? {})
  })
  ipcMain.handle('routines:remove', (_e, id: string) => {
    ctx.routineScheduler.remove(String(id ?? ''))
  })
  ipcMain.handle('routines:toggle', (_e, id: string, enabled: boolean) => {
    return ctx.routineScheduler.toggle(String(id ?? ''), !!enabled)
  })
  ipcMain.handle('routines:runNow', async (_e, id: string) => {
    return ctx.routineScheduler.runNow(String(id ?? ''))
  })
}
