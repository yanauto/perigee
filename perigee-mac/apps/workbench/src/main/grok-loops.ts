/**
 * 第 3 波 H：只读列出磁盘上的 workflow 定义，或回人话说明 /loop 看不见。
 * 不跑 grok 二进制（官方没有这两个子命令），不改 routines.json。
 */

import type { GrokCmdResult } from '../shared/grok-cmd'
import { formatWorkflowList, listWorkflowFiles, type LoopPlan } from '../shared/grok-loops'

export { planLoops } from '../shared/grok-loops'

function failResult(
  error: string,
  extra: Partial<GrokCmdResult> = {}
): GrokCmdResult {
  return {
    ok: false,
    code: extra.code ?? 1,
    stdout: extra.stdout ?? '',
    stderr: extra.stderr ?? '',
    cwd: extra.cwd ?? process.cwd(),
    cwdSource: extra.cwdSource ?? 'process',
    argv: extra.argv ?? [],
    error,
    note: extra.note
  }
}

function messageResult(
  extra: { ok: boolean; text: string; argv: string[] },
  cwd: string,
  cwdSource: 'workspace' | 'process'
): GrokCmdResult {
  const text = extra.text.endsWith('\n') ? extra.text : `${extra.text}\n`
  if (extra.ok) {
    return {
      ok: true,
      code: 0,
      stdout: text,
      stderr: '',
      cwd,
      cwdSource,
      argv: extra.argv,
      note: extra.text
    }
  }
  return failResult(extra.text, { cwd, cwdSource, argv: extra.argv, stdout: extra.text })
}

export function executeLoopPlan(
  plan: LoopPlan,
  cwd: string,
  cwdSource: 'workspace' | 'process'
): GrokCmdResult {
  if (plan.kind === 'message') return messageResult(plan, cwd, cwdSource)
  const pack = listWorkflowFiles(cwd, cwdSource)
  const stdout = formatWorkflowList(pack)
  return {
    ok: true,
    code: 0,
    stdout,
    stderr: '',
    cwd,
    cwdSource,
    argv: plan.argv,
    note: '官方没有 grok workflow；列表来自磁盘 .rhai，不是 TUI /workflows'
  }
}
