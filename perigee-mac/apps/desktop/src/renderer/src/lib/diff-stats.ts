/** 简易行 diff 统计：+add -del（对齐 CCD +12 -1 指示） */

export function lineDiffStats(
  before: string | null | undefined,
  after: string | null | undefined
): { add: number; del: number } {
  const a = (before ?? '').split('\n')
  const b = (after ?? '').split('\n')
  // 空文件归一：'' → 一行空串；双方都空则 0
  if (before == null && after == null) return { add: 0, del: 0 }
  if (before == null) return { add: b.length === 1 && b[0] === '' ? 0 : b.length, del: 0 }
  if (after == null) return { add: 0, del: a.length === 1 && a[0] === '' ? 0 : a.length }

  // 大文件保护：完整 LCS 为 O(n·m)，超阈值用前后缀剥离 + 中段近似（审计 C2-04）
  if (a.length * b.length > 400_000) {
    return approxLineDiffStats(a, b)
  }
  const lcs = lcsLength(a, b)
  return { add: b.length - lcs, del: a.length - lcs }
}

/** 剥离公共前后缀后，中段按行集近似（偏高估变更量，不低估「有改」） */
function approxLineDiffStats(a: string[], b: string[]): { add: number; del: number } {
  let i = 0
  let j = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  while (
    j < a.length - i &&
    j < b.length - i &&
    a[a.length - 1 - j] === b[b.length - 1 - j]
  ) {
    j++
  }
  const midA = a.length - i - j
  const midB = b.length - i - j
  if (midA <= 0 && midB <= 0) return { add: 0, del: 0 }
  if (midA * midB <= 80_000 && midA > 0 && midB > 0) {
    const lcs = lcsLength(a.slice(i, a.length - j), b.slice(i, b.length - j))
    return { add: midB - lcs, del: midA - lcs }
  }
  return { add: Math.max(0, midB), del: Math.max(0, midA) }
}

export function aggregateDiffStats(
  diffs: {
    before?: string | null
    after?: string | null
    lineAdd?: number
    lineDel?: number
  }[]
): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const d of diffs) {
    if (typeof d.lineAdd === 'number' && typeof d.lineDel === 'number') {
      add += d.lineAdd
      del += d.lineDel
      continue
    }
    const s = lineDiffStats(d.before, d.after)
    add += s.add
    del += s.del
  }
  return { add, del }
}

function lcsLength(a: string[], b: string[]): number {
  const n = a.length
  const m = b.length
  // 滚动数组 O(min(n,m))
  if (n === 0 || m === 0) return 0
  let prev = new Array<number>(m + 1).fill(0)
  let cur = new Array<number>(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) cur[j] = prev[j - 1] + 1
      else cur[j] = Math.max(prev[j], cur[j - 1])
    }
    ;[prev, cur] = [cur, prev]
    cur.fill(0)
  }
  return prev[m]
}
