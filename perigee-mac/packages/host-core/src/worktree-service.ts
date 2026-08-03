import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export function isGitRepo(root: string): boolean {
  if (existsSync(join(root, '.git'))) return true
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export type WorktreeCreateResult = {
  worktreePath: string
  branch: string
  primaryWorkspacePath: string
}

export type WorktreeStatus = {
  ok: boolean
  reason?: string
  worktreePath?: string
  branch?: string
  dirty?: boolean
  dirtyCount?: number
  ahead?: number
  behind?: number
  shortstat?: string
  /** 相对 primary HEAD 的提交数（wt 独有 commits） */
  commitsAheadOfPrimary?: number
}

export type PromoteOptions = {
  primaryWorkspacePath: string
  worktreePath: string
  /** 已知分支名；缺省则从 wt 探测 */
  branch?: string
  title?: string
  body?: string
  /** 默认 origin */
  remote?: string
  /** 默认不传，gh 用仓库 default */
  base?: string
  /** 仅 push 不开 PR */
  pushOnly?: boolean
}

export type PromoteResult = {
  ok: boolean
  reason?: string
  branch?: string
  pushed?: boolean
  prUrl?: string
  prCreated?: boolean
  detail: string
}

function git(
  cwd: string,
  args: string[],
  timeout = 15_000
): { ok: true; out: string } | { ok: false; err: string } {
  try {
    const out = execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
    return { ok: true, out }
  } catch (e) {
    const err =
      e && typeof e === 'object' && 'stderr' in e
        ? String((e as { stderr?: Buffer | string }).stderr ?? '')
        : e instanceof Error
          ? e.message
          : String(e)
    return { ok: false, err: err.slice(0, 800) || 'git failed' }
  }
}

function ghAvailable(): boolean {
  try {
    execFileSync('gh', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return true
  } catch {
    return false
  }
}

/**
 * Host 管理的 git worktree（ADR 0009）。
 * 根目录：userData/worktrees
 * promote = push + 可选 gh pr create；**永不** merge 进 primary。
 */
export class WorktreeService {
  constructor(private rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true })
  }

  get root(): string {
    return this.rootDir
  }

  /** 安全：仅托管目录下的路径（realpath + relative，防 ../ 与前缀欺骗） */
  isManaged(worktreePath: string): boolean {
    try {
      const root = realpathSync(this.rootDir)
      let abs: string
      try {
        abs = realpathSync(worktreePath)
      } catch {
        abs = resolve(worktreePath)
      }
      if (abs === root) return true
      const rel = relative(root, abs)
      if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) return false
      // Windows 绝对盘符误判
      if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return false
      return true
    } catch {
      return false
    }
  }

  /**
   * 为会话创建 worktree。非 Git 仓返回 null。
   */
  create(primaryWorkspacePath: string, sessionId: string): WorktreeCreateResult | null {
    if (!isGitRepo(primaryWorkspacePath)) return null
    const slug = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
    const worktreePath = join(this.rootDir, slug)
    const branch = `perigee/${slug}`

    if (existsSync(worktreePath)) {
      const st = this.status(primaryWorkspacePath, worktreePath)
      return {
        worktreePath,
        branch: st.branch || branch,
        primaryWorkspacePath
      }
    }

    try {
      execFileSync(
        'git',
        ['-C', primaryWorkspacePath, 'worktree', 'add', '-b', branch, worktreePath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      return { worktreePath, branch, primaryWorkspacePath }
    } catch {
      try {
        execFileSync(
          'git',
          ['-C', primaryWorkspacePath, 'worktree', 'add', worktreePath, branch],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        )
        return { worktreePath, branch, primaryWorkspacePath }
      } catch {
        try {
          execFileSync(
            'git',
            ['-C', primaryWorkspacePath, 'worktree', 'add', '--detach', worktreePath, 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
          )
          return { worktreePath, branch: 'HEAD-detached', primaryWorkspacePath }
        } catch {
          return null
        }
      }
    }
  }

  /**
   * 会话 worktree 状态摘要（审查闭环）。
   */
  status(primaryWorkspacePath: string, worktreePath: string): WorktreeStatus {
    if (!worktreePath || !existsSync(worktreePath)) {
      return { ok: false, reason: 'no_worktree' }
    }
    if (!this.isManaged(worktreePath)) {
      return { ok: false, reason: 'not_managed' }
    }
    if (!isGitRepo(worktreePath)) {
      return { ok: false, reason: 'not_git', worktreePath }
    }

    const br = git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = br.ok ? br.out : undefined
    const por = git(worktreePath, ['status', '--porcelain'])
    const dirtyLines = por.ok && por.out ? por.out.split('\n').filter(Boolean) : []
    const dirty = dirtyLines.length > 0

    let ahead = 0
    let behind = 0
    const ab = git(worktreePath, [
      'rev-list',
      '--left-right',
      '--count',
      '@{upstream}...HEAD'
    ])
    if (ab.ok) {
      const [b, a] = ab.out.split(/\s+/).map((n) => Number(n) || 0)
      behind = b ?? 0
      ahead = a ?? 0
    }

    let commitsAheadOfPrimary: number | undefined
    let shortstat: string | undefined
    if (isGitRepo(primaryWorkspacePath)) {
      const primHead = git(primaryWorkspacePath, ['rev-parse', 'HEAD'])
      if (primHead.ok) {
        const cnt = git(worktreePath, ['rev-list', '--count', `${primHead.out}..HEAD`])
        if (cnt.ok) commitsAheadOfPrimary = Number(cnt.out) || 0
        const st = git(worktreePath, ['diff', '--shortstat', primHead.out])
        if (st.ok && st.out) shortstat = st.out
      }
    }

    return {
      ok: true,
      worktreePath,
      branch,
      dirty,
      dirtyCount: dirtyLines.length,
      ahead,
      behind,
      shortstat,
      commitsAheadOfPrimary
    }
  }

  /**
   * Promote：在 worktree 上 push 分支，可选 gh pr create。
   * **永不** merge 进 primaryWorkspacePath。
   * 未提交变更 → 拒绝（reason: uncommitted）。
   */
  promote(opts: PromoteOptions): PromoteResult {
    const {
      primaryWorkspacePath,
      worktreePath,
      title,
      body,
      remote = 'origin',
      base,
      pushOnly
    } = opts

    if (!this.isManaged(worktreePath)) {
      return { ok: false, reason: 'not_managed', detail: '路径不在 Desktop 托管 worktree 根下' }
    }
    if (worktreePath === primaryWorkspacePath) {
      return { ok: false, reason: 'is_primary', detail: '禁止对主工作区路径 promote' }
    }

    const st = this.status(primaryWorkspacePath, worktreePath)
    if (!st.ok) {
      return { ok: false, reason: st.reason, detail: st.reason ?? 'status failed' }
    }
    if (st.dirty) {
      return {
        ok: false,
        reason: 'uncommitted',
        branch: st.branch,
        detail: `有 ${st.dirtyCount ?? 0} 个未提交变更；请先在会话内 commit，再推送开 PR`
      }
    }

    const branch = opts.branch || st.branch
    if (!branch || branch === 'HEAD' || branch === 'HEAD-detached') {
      return {
        ok: false,
        reason: 'no_branch',
        detail: 'detached HEAD 无法 promote；请在 worktree 上建分支'
      }
    }

    if ((st.commitsAheadOfPrimary ?? 0) === 0 && (st.ahead ?? 0) === 0) {
      // 相对 primary 无新提交，也无 upstream ahead —— 仍允许 push（可能仅同步空分支），但提示
      // 若完全无差异，用户可能误点；仍允许 push 以便开 PR 空窗？更严：无 commits 则拒
      if ((st.commitsAheadOfPrimary ?? 0) === 0) {
        return {
          ok: false,
          reason: 'no_commits',
          branch,
          detail: '相对主工作区 HEAD 无新提交，无需开 PR'
        }
      }
    }

    const push = git(
      worktreePath,
      ['push', '-u', remote, branch],
      120_000
    )
    if (!push.ok) {
      return {
        ok: false,
        reason: 'push_failed',
        branch,
        pushed: false,
        detail: `git push 失败：${push.err}`
      }
    }

    if (pushOnly || !ghAvailable()) {
      return {
        ok: true,
        branch,
        pushed: true,
        prCreated: false,
        detail: pushOnly
          ? `已 push ${remote}/${branch}（pushOnly）`
          : `已 push ${remote}/${branch}；本机无 gh，未开 PR`
      }
    }

    const prArgs = [
      'pr',
      'create',
      '--head',
      branch,
      '--title',
      title || `Perigee: ${branch}`,
      '--body',
      body ||
        `## Promote from Perigee\n\nBranch: \`${branch}\`\n\n_Auto-created; not merged into default branch._`
    ]
    if (base) {
      prArgs.push('--base', base)
    }

    try {
      const out = execFileSync('gh', prArgs, {
        cwd: worktreePath,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
      const urlMatch = out.match(/https:\/\/\S+/)
      const prUrl = urlMatch?.[0]
      return {
        ok: true,
        branch,
        pushed: true,
        prCreated: true,
        prUrl,
        detail: prUrl ? `已 push 并开 PR：${prUrl}` : `已 push；gh 输出：${out.slice(0, 200)}`
      }
    } catch (e) {
      const err =
        e && typeof e === 'object' && 'stderr' in e
          ? String((e as { stderr?: Buffer | string }).stderr ?? '')
          : e instanceof Error
            ? e.message
            : String(e)
      // push 已成功；PR 失败仍部分成功
      return {
        ok: true,
        branch,
        pushed: true,
        prCreated: false,
        detail: `已 push ${remote}/${branch}；开 PR 失败：${err.slice(0, 400)}`
      }
    }
  }

  /**
   * 删除 worktree。仅应传入本服务创建的路径。
   */
  remove(primaryWorkspacePath: string, worktreePath: string): void {
    if (!this.isManaged(worktreePath)) {
      return
    }
    try {
      execFileSync(
        'git',
        ['-C', primaryWorkspacePath, 'worktree', 'remove', '--force', worktreePath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch {
      try {
        rmSync(worktreePath, { recursive: true, force: true })
        execFileSync('git', ['-C', primaryWorkspacePath, 'worktree', 'prune'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        })
      } catch {
        /* ignore */
      }
    }
  }
}
