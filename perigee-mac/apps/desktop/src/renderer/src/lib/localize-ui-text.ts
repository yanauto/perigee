/**
 * 将 reducer / 纯函数产出的中文 UI 源串在 EN 下本地化。
 * - 精确命中 EN 表
 * - 前缀模板（动态后缀如 taskId 保留）
 * - 片段替换（失败/完成等短词）
 * 源串保持中文；不猜未知串。
 */
import { EN } from '../i18n/en'

/** 前缀：源串以 zh 开头时替换为 en，后缀原样保留 */
const PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['后台任务完成 · ', 'Background task completed · '],
  ['后台任务 已后台化 · ', 'Background task backgrounded · '],
  ['Monitor 已后台化 · ', 'Monitor backgrounded · '],
  ['子代理已启动 · ', 'Subagent started · '],
  ['子代理失败', 'Subagent failed'],
  ['子代理已取消', 'Subagent cancelled'],
  ['子代理完成', 'Subagent completed'],
  ['权限模式热切失败：', 'Permission mode hot-switch failed: '],
  ['权限模式已热切 → ', 'Permission mode hot-switched → '],
  ['权限拒绝（', 'Permission denied ('],
  ['模型热切失败：', 'Model hot-switch failed: '],
  ['模型已热切 → ', 'Model hot-switched → '],
  ['MCP 热更失败：', 'MCP hot-reload failed: '],
  ['MCP 已热更（', 'MCP hot-reloaded ('],
  ['引擎事件：', 'Engine event: '],
  ['无法打开：', "Can't open: "],
  ['已在系统浏览器打开 ', 'Opened in system browser '],
  ['本地回声 · 未连接 Grok。', 'Local echo · Grok is not connected.'],
  ['你说：', 'You said: '],
  ['等待审批 · ', 'Waiting for approval · '],
  ['你：', 'You: '],
  ['警告：已有 ', 'Warning: '],
  ['系统打开失败：', 'Could not open in system app: '],
  ['权限热切失败：', 'Permission hot-switch failed: '],
  ['模型热切失败：', 'Model hot-switch failed: '],
  ['MCP 热更失败：', 'MCP hot-reload failed: '],
  ['命令执行失败：', 'Command failed: '],
  ['命令暂不支持：', 'Command not supported: '],
  ['跨会话投递失败：', 'Cross-session send failed: ']
]

/** 片段：动态串中间仍可能残留的中文词 */
const FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['已达最大回合数（max_turns），引擎停止', 'Hit max turns (max_turns); engine stopped'],
  ['未知错误', 'Unknown error'],
  ['（Host 分类器仍生效）', ' (Host classifier still active)'],
  ['（可在设置「重建引擎」）', ' (rebuild engine in Settings)'],
  ['（可重建会话）', ' (recreate session)'],
  [' 项）', ' items)'],
  ['未知', 'unknown'],
  ['操作', 'action'],
  ['你说：', 'You said: '],
  [
    '请安装并登录本机 Grok CLI 后，才能发真消息。',
    'Install and sign in to the local Grok CLI to send real messages.'
  ],
  [' 个会话共享工作区「', ' session(s) share workspace "'],
  [
    '」且未隔离 worktree。并行写文件可能互相覆盖。',
    '" without worktree isolation. Parallel writes may overwrite each other.'
  ]
]

export function localizeUiText(text: string, lang: 'zh' | 'en'): string {
  if (lang !== 'en' || !text) return text
  const exact = EN[text]
  if (exact != null) return exact

  let out = text
  for (const [zh, en] of PREFIXES) {
    if (out.startsWith(zh)) {
      out = en + out.slice(zh.length)
      break
    }
  }
  for (const [zh, en] of FRAGMENTS) {
    if (out.includes(zh)) out = out.split(zh).join(en)
  }
  return out
}
