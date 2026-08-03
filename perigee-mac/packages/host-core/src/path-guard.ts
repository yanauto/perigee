import { resolve, relative, isAbsolute, sep, dirname, basename, join } from 'node:path'
import { realpathSync } from 'node:fs'

/**
 * 归一到真实路径：解析符号链接（如 macOS /var → /private/var）。
 * target 可能尚不存在（写前 capture），逐级向上找已存在的祖先做 realpath。
 */
export function canonicalPath(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    const parent = dirname(p)
    if (parent === p) return p
    return join(canonicalPath(parent), basename(p))
  }
}

/**
 * 解析为绝对真实路径，**不做工作区包含检查**（T027：本机桌面应用，用户即机主，
 * 「查看/编辑任意路径」是产品要求；引擎本就在任意路径干活，查看器不该只认工作区）。
 * 相对路径仍以工作区根为基准解析——保证既有的「相对路径」调用语义不变。
 */
export function resolveAnyPath(workspaceRoot: string, target: string): string {
  const root = canonicalPath(resolve(workspaceRoot))
  return canonicalPath(isAbsolute(target) ? resolve(target) : resolve(root, target))
}

/**
 * 确保 target 在 workspace 根下（防 path traversal；符号链接按真实路径判定）。
 * T027 后仅用于**导航/归属语义**（文件树列目录、diff 归一到工作区相对路径），
 * 不再用于「能不能读写这个文件」。
 */
export function resolveInWorkspace(workspaceRoot: string, target: string): string {
  const root = canonicalPath(resolve(workspaceRoot))
  const abs = canonicalPath(isAbsolute(target) ? resolve(target) : resolve(root, target))
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`路径越界工作区: ${target}`)
  }
  // Windows 盘符等
  if (rel.split(sep).includes('..')) {
    throw new Error(`路径越界工作区: ${target}`)
  }
  return abs
}

export function isInsideWorkspace(workspaceRoot: string, absPath: string): boolean {
  try {
    resolveInWorkspace(workspaceRoot, absPath)
    return true
  } catch {
    return false
  }
}
