/**
 * 第 3 波 H：两套定时对齐。
 * 官方没有 `grok loop` / `grok workflow` 子命令；/loop 只活在终端会话里。
 * 能列的只有磁盘上已存的 workflow 定义（.rhai），不读 routines.json，不调度。
 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export type WorkflowScope = 'project' | 'user'

export type WorkflowFile = {
  name: string
  file: string
  path: string
  scope: WorkflowScope
}

export type WorkflowList = {
  cwd: string
  cwdSource: 'workspace' | 'process'
  home: string
  projectDir: string
  userDir: string
  items: WorkflowFile[]
}

export const LOOP_TEXT = [
  '官方没有 grok loop 子命令，也没有列出 /loop 的命令。',
  '/loop 只活在终端那条会话里（例如 /loop 5m 检查测试），用 /tasks 看，7 天到期。',
  '这里看不到，也不会写进 Perigee 的 routines.json。'
].join('\n')

export const WORKFLOW_HELP = [
  '官方没有 grok workflow 子命令。',
  '会话里用 /create-workflow 存成 .rhai，用 /workflow <名> 启动；/workflows 看正在跑的（TUI，不是文件列表）。',
  'workbench grok workflow 只读磁盘上的已存定义：<文件夹>/.grok/workflows/ 和 ~/.grok/workflows/。',
  '不启动、不暂停、不和 Perigee 定时混存。'
].join('\n')

function tidy(raw: string[]): string[] {
  return raw.map((a) => String(a).trim()).filter(Boolean)
}

function displayPath(path: string, home: string): string {
  if (home && (path === home || path.startsWith(`${home}/`))) {
    return `~${path.slice(home.length)}`
  }
  return path
}

function readRhai(dir: string, scope: WorkflowScope): WorkflowFile[] {
  if (!dir || !existsSync(dir)) return []
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const rows: WorkflowFile[] = []
  for (const file of names) {
    if (!file.endsWith('.rhai') || file.startsWith('.')) continue
    const name = basename(file, '.rhai')
    if (!name) continue
    rows.push({ name, file, path: join(dir, file), scope })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return rows
}

export function listWorkflowFiles(
  cwd: string,
  cwdSource: 'workspace' | 'process' = 'process',
  home = homedir()
): WorkflowList {
  const root = cwd.trim() || process.cwd()
  const projectDir = join(root, '.grok', 'workflows')
  const userDir = join(home, '.grok', 'workflows')
  return {
    cwd: root,
    cwdSource,
    home,
    projectDir,
    userDir,
    items: [...readRhai(projectDir, 'project'), ...readRhai(userDir, 'user')]
  }
}

export function formatWorkflowList(pack: WorkflowList): string {
  const home = pack.home
  const projectN = pack.items.filter((x) => x.scope === 'project').length
  const userN = pack.items.filter((x) => x.scope === 'user').length
  const folderNote =
    pack.cwdSource === 'workspace' ? '当前打开的文件夹' : '没打开文件夹，用了进程目录'
  const lines = [
    '官方没有 grok workflow / grok loop 子命令。下面是磁盘上的已存 workflow 定义（.rhai），不是活着的运行。',
    '活着的运行在终端 /workflows；启动用 /workflow <名>。/loop 在终端那条会话里，这里看不到。',
    `ok  source=disk  ${folderNote}  project=${projectN}  user=${userN}`,
    `  projectDir  ${displayPath(pack.projectDir, home)}`,
    `  userDir     ${displayPath(pack.userDir, home)}`
  ]
  if (pack.items.length === 0) {
    lines.push('  （还没有 .rhai。要先在终端会话里 /create-workflow。）')
  } else {
    for (const row of pack.items) {
      lines.push(`  ${row.scope.padEnd(7)}  ${row.name}  ${displayPath(row.path, home)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export type LoopPlan =
  | { kind: 'list-workflows'; argv: string[] }
  | { kind: 'message'; ok: boolean; text: string; argv: string[] }

function planWorkflow(rest: string[]): LoopPlan {
  const sub = rest[0]
  if (!sub || sub === 'list' || sub === 'ls') {
    const extra = rest.slice(sub ? 1 : 0)
    if (extra.some((a) => !a.startsWith('-'))) {
      return {
        kind: 'message',
        ok: false,
        argv: ['workflow', ...rest],
        text: `workbench grok workflow 只列磁盘上的 .rhai，没有 ${extra.join(' ')}。\n${WORKFLOW_HELP}`
      }
    }
    return { kind: 'list-workflows', argv: ['workflow', 'list'] }
  }
  if (sub === '--help' || sub === '-h' || sub === 'help') {
    return { kind: 'message', ok: true, argv: ['workflow', '--help'], text: WORKFLOW_HELP }
  }
  return {
    kind: 'message',
    ok: false,
    argv: ['workflow', ...rest],
    text: `官方没有 grok workflow ${sub}。只要列表：workbench grok workflow。\n${WORKFLOW_HELP}`
  }
}

function planLoop(rest: string[]): LoopPlan {
  const sub = rest[0]
  if (sub === '--help' || sub === '-h' || sub === 'help') {
    return { kind: 'message', ok: true, argv: ['loop', '--help'], text: LOOP_TEXT }
  }
  if (rest.length === 0 || sub === 'list' || sub === 'ls') {
    return { kind: 'message', ok: true, argv: ['loop', ...rest], text: LOOP_TEXT }
  }
  return {
    kind: 'message',
    ok: false,
    argv: ['loop', ...rest],
    text: `${LOOP_TEXT}\n不要把 /loop 写进 Perigee 定时。`
  }
}

/** 认出 loop/workflow 就接管；其余交回 grok-cmd。 */
export function planLoops(raw: string[]): LoopPlan | null {
  const args = tidy(raw)
  const head = args[0] ?? ''
  const rest = args.slice(1)
  if (head === 'workflow' || head === 'workflows') return planWorkflow(rest)
  if (head === 'loop' || head === 'loops') return planLoop(rest)
  return null
}
