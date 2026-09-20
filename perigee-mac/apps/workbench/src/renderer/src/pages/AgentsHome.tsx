import { UI } from '../../../shared/ui-copy'
import { Composer } from '../components/Composer'
import { IconChevron } from '../components/Icons'
import { useWorkbench } from '../state'

const PILLS = ['仓库概览', '查潜在问题', '补测试']

export function AgentsHome() {
  const { submit, openWorkspace, goto, state } = useWorkbench()
  const engineLabel = state?.grok.cli ? 'Grok' : '未接 Grok'
  const folder = state?.workspace.name
  const hasFolder = Boolean(state?.workspace.path)

  return (
    <div className="stage-home">
      <header className="crumb">
        <button type="button" className="crumb-btn" onClick={() => void openWorkspace()}>
          {folder ?? UI.openFolder} <IconChevron />
        </button>
      </header>
      <div className="home-center">
        {!hasFolder ? (
          <>
            <p className="home-ws-hint">先打开一个文件夹，再开始对话。</p>
            <button type="button" className="btn-solid" onClick={() => void openWorkspace()}>
              {UI.openFolder}
            </button>
          </>
        ) : null}
        <Composer
          variant="hero"
          placeholder={hasFolder ? '计划、搜索、做一件事…' : '先打开一个文件夹…'}
          engineLabel={engineLabel}
          disabled={!hasFolder}
          onSubmit={submit}
        />
        {hasFolder ? (
          <div className="pills">
            {PILLS.map((label) => (
              <button key={label} type="button" className="pill" onClick={() => void submit(label)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="home-wt-link" onClick={() => void goto('worktrees')}>
          隔离目录
        </button>
      </div>
    </div>
  )
}
