/**
 * 引擎工厂：agent 配置来自 ~/.grok（ADR 0011），与 settings 壳字段分离。
 */
import { StubEngine } from '@perigee/engine-protocol'
import { GrokBuildEngine } from '@perigee/engine-grok-build'
import { GrokAcpEngine } from '@perigee/engine-grok-acp'
import {
  loadGrokConfigSnapshot,
  toAcpMcpServers,
  cliPermissionToDesktop,
  type AppSettings
} from '@perigee/host-core'
import type { AgentEngine } from '@perigee/engine-protocol'
import { resolveEngineBinary } from './security.js'
import type { MainCtx, AgentConfigFromCli } from './ctx.js'

/** ADR 0011：agent 侧配置来自 ~/.grok / grok mcp，非 settings.json */
export function agentConfigFromCli(): AgentConfigFromCli {
  const snap = loadGrokConfigSnapshot({ preferCliList: true })
  const perm = cliPermissionToDesktop(snap.permissionMode)
  return {
    snap,
    permissionPolicy: perm.policy,
    permissionNote: perm.sessionOnlyNote,
    cliPermissionRaw: perm.cliRaw,
    // 主模型勿用 fork_secondary_model（那是旁路模型提示）
    model: '',
    mcpServers: snap.mcpServers.map((s) => ({
      name: s.name,
      command: s.command || s.url || '',
      enabled: s.enabled,
      args: s.args,
      env: s.env,
      headers: s.headers,
      url: s.url,
      type: s.url ? ('http' as const) : ('stdio' as const)
    })),
    acpMcp: toAcpMcpServers(snap.mcpServers, true)
  }
}

export function createEngine(settings: AppSettings, ctx: MainCtx): AgentEngine {
  ctx.shellRunner.setEnabled(!!settings.terminalShellEnabled)
  const agent = agentConfigFromCli()
  const mode =
    settings.engineMode === 'grok-build' ? 'headless' : settings.engineMode
  if (mode === 'stub') {
    ctx.engineModeActual = 'stub'
    return new StubEngine()
  }
  const bin = resolveEngineBinary(settings.grokBinary)
  // ADR 0011：引擎权限基线以 CLI 为准；仅当用户在 Desktop 显式设为 yolo 时抬升
  const enginePerm =
    settings.permissionPolicy === 'yolo' || settings.alwaysApproveTools
      ? 'yolo'
      : agent.permissionPolicy || settings.permissionPolicy || 'ask'
  if (mode === 'acp') {
    if (!GrokAcpEngine.isAvailable(bin)) {
      console.warn('[perigee] acp: grok missing, fallback stub')
      ctx.engineModeActual = 'stub'
      return new StubEngine()
    }
    try {
      // 闭包用局部 acp，避免平行 acpEngineRef；对外一律 engine.acp
      const acp = new GrokAcpEngine({
        binary: bin,
        model: settings.model || agent.model || undefined,
        permissionPolicy: enginePerm,
        clientVersion: 'perigee/0.2.0',
        mcpServers: agent.mcpServers,
        onPermissionRequest: (req) => {
          // T018：Routine 会话强制免询问（无人在场；与 session meta permissionPolicy=yolo 双保险）
          if (ctx.routineSessionIds.has(req.sessionId)) {
            try {
              acp.resolvePermission(
                req.sessionId,
                req.engineRequestId ?? req.id,
                true
              )
            } catch {
              /* */
            }
            return
          }
          const engKey =
            req.engineRequestId != null ? String(req.engineRequestId) : String(req.id)
          // session-allow / always-allow：短路时必须立刻 resolvePermission，否则 ACP 挂死
          if (ctx.approvals.isPreapproved(req.sessionId, req.action)) {
            try {
              acp.resolvePermission(req.sessionId, engKey, true)
            } catch {
              /* */
            }
            return
          }
          // T021：必须传引擎 JSON-RPC id，不是 UI apr_*。
          ctx.approvals.request({
            id: req.id,
            sessionId: req.sessionId,
            action: req.action,
            detail: req.detail,
            risk: req.risk,
            engineRequestId: engKey
          })
          ctx.broadcast('approval:updated', ctx.approvals.listPending())
        }
      })
      ctx.engineModeActual = 'acp'
      return acp
    } catch (e) {
      console.warn('[perigee] acp construct failed', e)
      if (!settings.acpFallbackHeadless) {
        ctx.engineModeActual = 'stub'
        return new StubEngine()
      }
    }
  }

  // headless 或 acp fallback
  if (!GrokBuildEngine.isAvailable(bin)) {
    console.warn('[perigee] grok binary missing, fallback StubEngine')
    ctx.engineModeActual = 'stub'
    return new StubEngine()
  }
  ctx.engineModeActual = mode === 'acp' ? 'headless-fallback' : 'headless'
  // headless 无 request_permission 桥：必须 --always-approve，否则 ask 会卡到超时
  if (enginePerm !== 'yolo' && !settings.alwaysApproveTools) {
    console.warn(
      '[perigee] headless 无权限桥，强制 --always-approve（展示策略=',
      enginePerm,
      '；完整人审请用 ACP）'
    )
  }
  return new GrokBuildEngine({
    binary: bin,
    alwaysApprove: true,
    maxTurns: settings.maxTurns,
    model: settings.model || undefined,
    turnTimeoutMs: settings.turnTimeoutMs
  })
}
