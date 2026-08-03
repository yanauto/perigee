/**
 * F1：仓库 GitHub 状态条（best-effort，依赖本机 `gh` + git）。
 * 失败不抛；UI 显示「未连接」即可。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isGitRepo } from './worktree-service.js'

export type GhRepoStatus = {
  ok: boolean
  detail: string
  /** 当前工作区是否为 git 仓（与 WorktreeService 同一判据） */
  isGit: boolean
  branch?: string
  remote?: string
  ahead?: number
  behind?: number
  dirty?: boolean
  prUrl?: string
  prNumber?: number
  prTitle?: string
  ghAvailable: boolean
}

function run(
  bin: string,
  args: string[],
  cwd: string,
  timeout = 8000
): string | null {
  try {
    return execFileSync(bin, args, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  } catch {
    return null
  }
}

export function fetchGhStatus(workspacePath: string | null | undefined): GhRepoStatus {
  if (!workspacePath || !existsSync(workspacePath)) {
    return { ok: false, detail: '无工作区', ghAvailable: false, isGit: false }
  }
  if (!isGitRepo(workspacePath)) {
    return { ok: false, detail: '非 Git 仓', ghAvailable: false, isGit: false }
  }

  const ghAvailable = run('which', ['gh'], workspacePath) !== null ||
    run('gh', ['--version'], workspacePath) !== null

  const branch =
    run('git', ['-C', workspacePath, 'rev-parse', '--abbrev-ref', 'HEAD'], workspacePath) ??
    undefined
  const remote =
    run('git', ['-C', workspacePath, 'remote', 'get-url', 'origin'], workspacePath) ??
    undefined
  const statusPorcelain =
    run('git', ['-C', workspacePath, 'status', '--porcelain'], workspacePath) ?? ''
  const dirty = statusPorcelain.length > 0

  let ahead = 0
  let behind = 0
  const ab = run(
    'git',
    ['-C', workspacePath, 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
    workspacePath
  )
  if (ab) {
    const [b, a] = ab.split(/\s+/).map((n) => Number(n) || 0)
    behind = b ?? 0
    ahead = a ?? 0
  }

  let prUrl: string | undefined
  let prNumber: number | undefined
  let prTitle: string | undefined
  if (ghAvailable) {
    const prJson = run(
      'gh',
      ['pr', 'view', '--json', 'url,number,title', '-q', '.'],
      workspacePath,
      10_000
    )
    // gh -q '.' may still dump json; try without -q if needed
    const raw =
      prJson ||
      run('gh', ['pr', 'view', '--json', 'url,number,title'], workspacePath, 10_000)
    if (raw) {
      try {
        // 可能多行；取第一段 JSON
        const start = raw.indexOf('{')
        const end = raw.lastIndexOf('}')
        if (start >= 0 && end > start) {
          const j = JSON.parse(raw.slice(start, end + 1)) as {
            url?: string
            number?: number
            title?: string
          }
          prUrl = j.url
          prNumber = j.number
          prTitle = j.title
        }
      } catch {
        /* ignore parse */
      }
    }
  }

  const parts = [
    branch ? `分支 ${branch}` : null,
    dirty ? '有未提交改动' : '工作区干净',
    ahead ? `↑${ahead}` : null,
    behind ? `↓${behind}` : null,
    prNumber ? `PR #${prNumber}` : ghAvailable ? '无打开 PR' : 'gh 不可用'
  ].filter(Boolean)

  return {
    ok: true,
    isGit: true,
    detail: parts.join(' · '),
    branch,
    remote,
    ahead,
    behind,
    dirty,
    prUrl,
    prNumber,
    prTitle,
    ghAvailable: !!ghAvailable
  }
}
