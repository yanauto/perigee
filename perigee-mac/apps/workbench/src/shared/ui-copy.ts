/** 侧栏 / 钥匙 / 自动化短文案。只给窗上看，不进 types。 */

export const UI = {
  newChat: '新对话',
  openFolder: '打开文件夹',
  noFolder: '还没打开文件夹',
  localLabel: '本机窗',
  localEmpty: '从这里开新对话',
  cliLabel: '以前在终端里的',
  cliLoading: '正在读取以前的终端会话…',
  cliEmpty: '还没有终端会话',
  keysTitle: '模型与钥匙',
  keysLead: '模型从本机 grok models 里选。档位在下面点。技能和插件默认收着。',
  keysNow: '现在',
  keysModel: '模型',
  keysMode: '档位',
  keysPlaceLabel: '钥匙',
  keysPlace: '本机 ~/.grok',
  keysPlaceHint: '登录态和配置在这儿',
  grokComIn: '已登录 grok.com',
  grokComOut: '还没登录 grok.com',
  grokComUnknown: '还看不出 grok.com 登录态',
  grokLogin: '登录 grok.com',
  grokLogout: '退出 grok.com',
  grokLoginHint: '会打开系统浏览器。点完后再读一次。藏着的开发窗也能从这里或 workbench grok login 触发。',
  modelUnknown: '还没读到 grok models',
  inspectLoading: '正在看本机 Grok…',
  inspectMiss: '这边没读到发现结果。模型以 grok models 为准。',
  refresh: '再读一次',
  refreshing: '正在读…',
  found: '发现',
  foundNone: '还没读到技能和插件',
  autoPerigee: '到点用本机 Grok 开一轮。不是终端 /loop。',
  autoCli: '在终端里跑；这里不调度、不和上面混。',
  autoEmpty: '还没有。上面存一条就行。',
  autoSave: '存一条',
  autoDetailHint: '本机定时，不是终端 /loop。',
  worktreeLead: '列表来自官方 grok worktree list。新开隔离会话 = 终端 grok -w。分叉 = --fork-session。',
  worktreeEmpty: '还没有隔离目录。官方 grok worktree list 也是空的。'
} as const

export function modelDisplay(name: string | null | undefined): string {
  const t = name?.trim() ?? ''
  if (!t || /^(unknown|n\/a|—|-)$/i.test(t)) return UI.modelUnknown
  return t
}
