import type { DirEntry } from './perigee-api'

export type TreeNode = {
  name: string
  rel: string
  isDir: boolean
  children: TreeNode[]
}

/** 把 fs.list 的扁平结果按 relativePath 组装成树（跳过 .git） */
export function buildTree(entries: DirEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', rel: '', isDir: true, children: [] }
  const dirMap = new Map<string, TreeNode>([['', root]])
  const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  for (const e of sorted) {
    const rel = e.relativePath.replace(/^\.\//, '').replace(/\/$/, '')
    if (!rel || rel.startsWith('.git/') || rel === '.git') continue
    const parts = rel.split('/')
    const parentRel = parts.slice(0, -1).join('/')
    const parent = dirMap.get(parentRel) ?? root
    const node: TreeNode = { name: e.name, rel, isDir: e.isDirectory, children: [] }
    parent.children.push(node)
    if (e.isDirectory) dirMap.set(rel, node)
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(root.children)
  return root.children
}
