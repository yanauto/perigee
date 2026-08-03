import type { ReactNode } from 'react'
import { createElement, Fragment } from 'react'

/**
 * 从文本中识别工作区相对/绝对路径，渲染为可点击 chip。
 * 绝对路径（/a/b/c）与相对路径（src/a.ts、docs/x.md）两类。
 */
const PATH_RE =
  /(?:^|[\s`"'(])((?:\/[\w.@-]+)+(?:\.[\w]+)?)|(?:^|[\s`"'(])((?:[\w.@-]+\/)+[\w.@-]+\.[\w]+)/g

/** 判断一段文本是否像文件路径（供 markdown code 元素点击委托用） */
export function looksLikePath(text: string): boolean {
  const t = text.trim()
  if (t.length < 3 || t.length > 260) return false
  if (/^(\/[\w.@-]+)+\.[\w]+$/.test(t)) return true
  if (/^(?:[\w.@-]+\/)+[\w.@-]+\.[\w]+$/.test(t)) return true
  return false
}

export type TextSegment = string | { path: string }

export function splitPaths(text: string): TextSegment[] {
  const segs: TextSegment[] = []
  const re = new RegExp(PATH_RE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const full = m[1] || m[2]
    if (!full) continue
    const start = m.index + (m[0].length - full.length)
    if (start > last) segs.push(text.slice(last, start))
    segs.push({ path: full })
    last = start + full.length
  }
  if (last < text.length) segs.push(text.slice(last))
  return segs
}

/** 把纯文本渲染成「路径可点」的 React 节点（用户消息、工具参数等） */
export function linkify(text: string, onOpenPath: (p: string) => void): ReactNode {
  const segs = splitPaths(text)
  if (!segs.some((s) => typeof s !== 'string')) return text
  return segs.map((s, i) =>
    typeof s === 'string'
      ? createElement(Fragment, { key: `t${i}` }, s)
      : createElement(
          'button',
          {
            key: `p${i}`,
            type: 'button',
            className: 'path-chip',
            title: '打开文件',
            onClick: () => onOpenPath(s.path.replace(/^\.\//, ''))
          },
          s.path
        )
  )
}
