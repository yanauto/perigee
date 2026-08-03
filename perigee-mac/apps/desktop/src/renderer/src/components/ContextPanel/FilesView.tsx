import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import type { DirEntry } from '../../lib/perigee-api'
import type { Workbench } from '../../state/useWorkbench'
import {
  afterSuccessfulSave,
  applyDiskContent,
  applyLocalEdit,
  createEmptyBuffer,
  prepareSave,
  type FileBufferState
} from '../../lib/file-buffer'
import { buildTree, type TreeNode } from '../../lib/filetree'
import { renderMarkdown } from '../../lib/markdown'
import { useT } from '../../i18n'
import { Button, EmptyState, Icon, IconButton } from '../ui'
import { FileEditor } from '../editor/FileEditor'

const MD_RE = /\.mdx?$/i

/**
 * 文件页（单实例）：默认文件树；wb.activeFilePath 有值时切为单文件视图。
 * 从树、对话路径 chip、diff 进入都复用此视图（activeFilePath 是唯一来源）。
 * .md/.mdx 默认渲染 markdown，可切 CodeMirror 源码编辑；保存走 file-buffer 状态机。
 */
export function FilesView({ wb }: { wb: Workbench }): JSX.Element {
  const t = useT()
  const path = wb.activeFilePath
  const [buf, setBuf] = useState<FileBufferState | null>(null)
  const [saving, setSaving] = useState(false)
  const [mdEditing, setMdEditing] = useState(false)

  /* inspector(kind:file/md) 携带的路径同步进唯一文件视图 */
  useEffect(() => {
    const ins = wb.inspector
    if ((ins.kind === 'file' || ins.kind === 'md') && ins.path !== wb.activeFilePath) {
      wb.setActiveFilePath(ins.path.replace(/^\.\//, ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb.inspector])

  /* 换文件回到 md 渲染态 */
  useEffect(() => setMdEditing(false), [path])

  /* 读盘；fileVersion 信号重读（dirty 且磁盘≠baseline → 冲突，不覆盖本地编辑） */
  useEffect(() => {
    if (!path) {
      setBuf(null)
      return
    }
    let alive = true
    void window.perigee.fs
      .read(path)
      .then((r) => {
        if (!alive) return
        setBuf((prev) => {
          const base = prev && prev.path === path ? prev : createEmptyBuffer(path)
          return applyDiskContent(base, { content: r.content, truncated: r.truncated })
        })
      })
      .catch((e) => {
        if (!alive) return
        setBuf({
          ...createEmptyBuffer(path),
          loadError: e instanceof Error ? e.message : String(e)
        })
      })
    return () => {
      alive = false
    }
  }, [path, wb.fileVersion])

  const save = useCallback(
    async (force = false) => {
      if (!path || !buf || buf.loadError) return
      setSaving(true)
      try {
        const latest = await window.perigee.fs.read(path)
        const prep = prepareSave(buf, latest.content, force)
        if (!prep.ok) {
          if (prep.reason === 'conflict') setBuf((s) => (s ? { ...s, conflict: true } : s))
          return
        }
        await window.perigee.fs.write(path, prep.content)
        setBuf((s) => (s ? afterSuccessfulSave(s, prep.content) : s))
      } catch (e) {
        setBuf((s) =>
          s ? { ...s, loadError: e instanceof Error ? e.message : String(e) } : s
        )
      } finally {
        setSaving(false)
      }
    },
    [path, buf]
  )

  const reloadDisk = useCallback(() => {
    if (!path) return
    void window.perigee.fs.read(path).then((r) => {
      setBuf((prev) => {
        const base = prev && prev.path === path ? prev : createEmptyBuffer(path)
        return applyDiskContent(
          base,
          { content: r.content, truncated: r.truncated },
          { force: true }
        )
      })
    })
  }, [path])

  const isMd = !!path && MD_RE.test(path)
  const mdHtml = useMemo(
    () => (isMd && buf && !buf.loadError ? renderMarkdown(buf.content) : ''),
    [isMd, buf]
  )

  if (!wb.currentWorkspace) {
    return (
      <EmptyState icon="folder" title="未打开工作区" sub="打开文件夹后可浏览与编辑文件。" />
    )
  }

  if (!path) {
    return <FileTree active={null} onOpen={(rel) => wb.setActiveFilePath(rel)} />
  }

  /* 路径条操作（复制/reveal）需要绝对路径；上方守卫已确保工作区非空。
     T027：path 可能已经是工作区外的绝对路径，绝对化时不再无脑拼工作区根。 */
  const wsRoot = wb.currentWorkspace
  const absPath = path.startsWith('/') ? path : `${wsRoot}/${path}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="editor-bar">
        <IconButton tip="返回文件树" onClick={() => wb.setActiveFilePath(null)}>
          <Icon name="chevron" style={{ rotate: '180deg' }} />
        </IconButton>
        <span className="eb-path" style={{ minWidth: 0 }} title={path}>
          {path}
        </span>
        {buf?.dirty ? <span className="dirty-dot" data-tip="未保存" /> : null}
        <span style={{ marginLeft: 'auto' }} />
        {buf?.truncated ? <span style={{ fontSize: 11, flex: 'none' }}>已截断</span> : null}
        {buf?.conflict ? (
          <span style={{ fontSize: 11, color: 'var(--warn)', flex: 'none' }}>磁盘已变</span>
        ) : null}
        {buf?.conflict ? (
          <>
            <button type="button" className="btn" onClick={reloadDisk}>
              重载磁盘
            </button>
            <button
              type="button"
              className="btn"
              disabled={!buf.dirty || saving}
              data-tip="忽略磁盘变更，用当前缓冲覆盖"
              onClick={() => void save(true)}
            >
              强制覆盖
            </button>
          </>
        ) : null}
        {isMd ? (
          <button type="button" className="btn" onClick={() => setMdEditing((v) => !v)}>
            {mdEditing ? '预览' : '编辑'}
          </button>
        ) : null}
        {/* 路径条操作小图标（ccd-10/11 chrome）：复制路径 / Finder 中显示 */}
        <IconButton
          tip="复制路径"
          icon="copy"
          onClick={() => void window.perigee.clipboard.write(path)}
        />
        <IconButton
          tip="在 Finder 中显示"
          icon="folder-open"
          onClick={() => void window.perigee.workspace.reveal(absPath)}
        />
        <IconButton
          tip="保存（⌘S）"
          icon="save"
          disabled={!buf?.dirty || saving}
          onClick={() => void save(false)}
        />
      </div>
      {buf?.loadError ? (
        /* T027：读取失败不再是死胡同——给系统默认应用打开 / Finder 显示两个真实出口 */
        <EmptyState icon="alert" title={t('读取失败')} sub={buf.loadError}>
          <Button
            variant="primary"
            icon="external"
            onClick={() => wb.openWithSystem(absPath)}
          >
            {t('用系统默认应用打开')}
          </Button>
          <Button icon="folder-open" onClick={() => wb.revealInFinder(absPath)}>
            {t('在 Finder 中显示')}
          </Button>
        </EmptyState>
      ) : buf == null ? (
        <EmptyState icon="file" title="加载中…" />
      ) : isMd && !mdEditing ? (
        <div
          className="md-body"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}
          onClick={(e) => {
            // 代码块「复制」按钮委托（markdown.ts codeBlock 结构）
            const btn = (e.target as HTMLElement).closest('[data-copy]')
            if (!btn) return
            const code = btn.closest('.codeblock')?.querySelector('code')?.textContent ?? ''
            void window.perigee.clipboard.write(code)
          }}
          dangerouslySetInnerHTML={{ __html: mdHtml }}
        />
      ) : (
        // .cm-host 无样式：grid 行拉满，给 .cm-editor height:100% 一条确定高度链
        <div
          className="editor-wrap"
          style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}
        >
          <FileEditor
            path={path}
            value={buf.content}
            onChange={(next) => setBuf((s) => (s ? applyLocalEdit(s, next) : s))}
            onSave={() => void save(false)}
          />
        </div>
      )}
    </div>
  )
}

/* ---------- 文件树（fs.list 懒加载目录） ---------- */

function FileTree({
  active,
  onOpen
}: {
  active: string | null
  onOpen: (rel: string) => void
}): JSX.Element {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<DirEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void window.perigee.fs
      .list('.', 2)
      .then((l) => {
        if (!alive) return
        setEntries(l)
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const all = useMemo(() => {
    const map = new Map<string, DirEntry>()
    for (const e of [...entries, ...extra]) map.set(e.relativePath, e)
    return [...map.values()]
  }, [entries, extra])

  const tree = useMemo(() => buildTree(all), [all])

  const toggle = (rel: string, isDir: boolean) => {
    const wasCollapsed = collapsed.has(rel)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
    /* 展开时懒加载下一层 */
    if (isDir && wasCollapsed) {
      void window.perigee.fs
        .list(rel, 1)
        .then((kids) => {
          setExtra((prev) => {
            const map = new Map(prev.map((e) => [e.relativePath, e]))
            for (const k of kids) map.set(k.relativePath, k)
            return [...map.values()]
          })
        })
        .catch(() => {})
    }
  }

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((n) => {
      const pad = 8 + depth * 14
      if (n.isDir) {
        const isCollapsed = collapsed.has(n.rel)
        return (
          <div key={n.rel}>
            <button
              type="button"
              className="ftree-row"
              style={{ paddingLeft: pad }}
              onClick={() => toggle(n.rel, true)}
            >
              <Icon
                name="chevron"
                size={11}
                style={{
                  rotate: isCollapsed ? '0deg' : '90deg',
                  transition: 'rotate var(--dur) var(--ease)',
                  opacity: 0.6
                }}
              />
              <Icon name={isCollapsed ? 'folder' : 'folder-open'} size={13} />
              <span className="fr-name">{n.name}</span>
            </button>
            {!isCollapsed && renderNodes(n.children, depth + 1)}
          </div>
        )
      }
      return (
        <button
          key={n.rel}
          type="button"
          className={`ftree-row${active === n.rel ? ' is-active' : ''}`}
          style={{ paddingLeft: pad + 14 }}
          title={n.rel}
          onClick={() => onOpen(n.rel)}
        >
          <Icon name={MD_RE.test(n.name) ? 'file-text' : 'file'} size={13} />
          <span className="fr-name">{n.name}</span>
        </button>
      )
    })

  return (
    <div className="ftree">
      {loaded && tree.length === 0 ? (
        <EmptyState icon="folder" title="工作区为空" sub="该文件夹还没有可显示的文件。" />
      ) : (
        renderNodes(tree, 0)
      )}
    </div>
  )
}
