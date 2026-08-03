import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  renameSync,
  copyFileSync
} from 'node:fs'
import { dirname, join, basename, extname, relative } from 'node:path'
import { resolveAnyPath, resolveInWorkspace } from './path-guard.js'

const IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.vite',
  'coverage',
  '.DS_Store'
])

export interface DirEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size?: number
}

/** 带 code 的 fs 错误（渲染层可据此分支：不存在 / 无权限 / 目录…） */
export function fsError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

/** 把 node 的 errno 翻成人话 + 稳定 code（T027：放开越界后，错误必须自己说清楚） */
export function wrapFsError(e: unknown, abs: string, op: 'read' | 'write'): Error {
  const code = (e as { code?: string } | null)?.code
  if (code === 'ENOENT') return fsError(`文件不存在: ${abs}`, 'fs.not_found')
  if (code === 'EACCES' || code === 'EPERM') {
    return fsError(`没有${op === 'read' ? '读取' : '写入'}权限: ${abs}`, 'fs.permission_denied')
  }
  if (code === 'EISDIR') return fsError(`不能把目录当文件${op === 'read' ? '读' : '写'}: ${abs}`, 'fs.is_directory')
  if (code === 'ELOOP') return fsError(`符号链接成环: ${abs}`, 'fs.symlink_loop')
  const msg = e instanceof Error ? e.message : String(e)
  return fsError(`${op === 'read' ? '读取' : '写入'}失败: ${abs}（${msg}）`, 'fs.io_error')
}

function statFile(abs: string, op: 'read' | 'write'): import('node:fs').Stats {
  try {
    return statSync(abs)
  } catch (e) {
    throw wrapFsError(e, abs, op)
  }
}

export class FsService {
  constructor(private workspaceRoot: string) {}

  setRoot(root: string): void {
    this.workspaceRoot = root
  }

  get root(): string {
    return this.workspaceRoot
  }

  /**
   * 列目录：**仍以工作区为根**（T027 明确：放开的是「按任意绝对路径打开/保存」，
   * 文件树的导航语义不变），越界仍拒绝。
   */
  listDir(relOrAbs: string, depth = 1): DirEntry[] {
    const abs = resolveInWorkspace(this.workspaceRoot, relOrAbs || '.')
    return this.walk(abs, depth)
  }

  private walk(abs: string, depth: number): DirEntry[] {
    if (depth < 0) return []
    const st = statSync(abs)
    if (!st.isDirectory()) return []
    const names = readdirSync(abs)
    const out: DirEntry[] = []
    for (const name of names) {
      if (IGNORE.has(name) || name.startsWith('.')) continue
      const child = join(abs, name)
      let cst
      try {
        cst = statSync(child)
      } catch {
        continue
      }
      out.push({
        name,
        path: child,
        relativePath: relative(this.workspaceRoot, child),
        isDirectory: cst.isDirectory(),
        size: cst.isFile() ? cst.size : undefined
      })
      if (cst.isDirectory() && depth > 1) {
        out.push(...this.walk(child, depth - 1))
      }
    }
    return out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * 读文本（T027：**不再限制工作区**，任意绝对路径可读；相对路径仍以工作区为基准）。
   * 错误语义显式化：不存在 / 无权限 / 目录当文件读，各报各的，不再是「越界」。
   */
  readText(relOrAbs: string, maxBytes = 2_000_000): { path: string; content: string; truncated: boolean } {
    const abs = resolveAnyPath(this.workspaceRoot, relOrAbs)
    const st = statFile(abs, 'read')
    if (st.isDirectory()) throw fsError(`不能把目录当文件读: ${abs}`, 'fs.is_directory')
    if (!st.isFile()) throw fsError(`不是普通文件: ${abs}`, 'fs.not_file')
    let buf: Buffer
    try {
      buf = readFileSync(abs)
    } catch (e) {
      throw wrapFsError(e, abs, 'read')
    }
    const truncated = buf.length > maxBytes
    const content = buf.subarray(0, maxBytes).toString('utf8')
    return { path: abs, content, truncated }
  }

  /** 写文本（T027：同上放开工作区限制；父目录自动创建） */
  writeText(relOrAbs: string, content: string): string {
    const abs = resolveAnyPath(this.workspaceRoot, relOrAbs)
    try {
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content, 'utf8')
    } catch (e) {
      throw wrapFsError(e, abs, 'write')
    }
    return abs
  }

  exists(relOrAbs: string): boolean {
    try {
      return existsSync(resolveAnyPath(this.workspaceRoot, relOrAbs))
    } catch {
      return false
    }
  }

  isMarkdown(path: string): boolean {
    return ['.md', '.mdx', '.markdown'].includes(extname(path).toLowerCase())
  }

  basename(path: string): string {
    return basename(path)
  }
}

export function snapshotFile(absPath: string, backupDir: string): string | null {
  if (!existsSync(absPath)) return null
  mkdirSync(backupDir, { recursive: true })
  const dest = join(backupDir, `${Date.now()}_${basename(absPath)}.bak`)
  copyFileSync(absPath, dest)
  return dest
}

export function restoreSnapshot(backupPath: string, originalPath: string): void {
  mkdirSync(dirname(originalPath), { recursive: true })
  copyFileSync(backupPath, originalPath)
}

export function removeFile(absPath: string): void {
  if (existsSync(absPath)) unlinkSync(absPath)
}

export function moveFile(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true })
  renameSync(from, to)
}
