export const PAGE_IDS = [
  'agents-home',
  'chat',
  'settings-models',
  'welcome',
  'sign-in',
  'sign-up',
  'verify-email',
  'auth-welcome',
  'auth-signup',
  'auth-signin',
  'auth-verify-code',
  'auth-set-password',
  'agent-task',
  'automations',
  'automations-gallery',
  'automations-detail',
  'dashboard-overview',
  'settings-general',
  'settings-cloud-agents',
  'settings-integrations',
  'settings-usage',
  'settings-billing',
  'onboarding-download',
  'onboarding-team',
  'auth-github',
  'agents-setup',
  'agents-setup-done',
  'agent-secrets',
  'agent-git',
  'agent-desktop',
  'agent-terminal',
  'settings-repos',
  'settings-api-keys',
  'settings-bugbot',
  'settings-bugbot-repos',
  'settings-bugbot-rules',
  'settings-bugbot-rule-edit',
  'settings-plugins',
  'settings-plugins-detail',
  'settings-members',
  'settings-members-invite',
  'settings-spending',
  'settings-plan',
  'settings-contact',
  'settings-docs',
  'settings-deactivate',
  'workbench',
  'search',
  'scm',
  'extensions',
  'terminal',
  'problems',
  'debug',
  'output',
  'review-diff',
  'settings-app-general',
  'settings-app-agents',
  'settings-app-tab',
  'settings-app-mcp',
  'settings-app-rules',
  'settings-app-indexing',
  'settings-app-network',
  'settings-app-beta',
  'settings-keyboard',
  'worktrees'
] as const

export type PageId = (typeof PAGE_IDS)[number]

export type PageWave = 'first' | 'second' | 'later'

export type PageMeta = {
  id: PageId
  title: string
  hint: string
  wave: PageWave
}

export const PAGES: PageMeta[] = [
  { id: 'agents-home', title: '智能体首页', hint: '打开就是这里，不用登录', wave: 'first' },
  { id: 'chat', title: '对话主舞台', hint: '当前对话（来回气泡）', wave: 'first' },
  { id: 'settings-models', title: '模型与钥匙', hint: '本机有没有 CLI，ACP 能不能握手', wave: 'first' },
  { id: 'welcome', title: '欢迎', hint: '宣传进门', wave: 'second' },
  { id: 'sign-in', title: '登录', hint: '邮箱登录', wave: 'second' },
  { id: 'sign-up', title: '注册', hint: '邮箱注册', wave: 'second' },
  { id: 'verify-email', title: '邮箱验证码', hint: '六位码进首页', wave: 'second' },
  { id: 'auth-welcome', title: '欢迎登录', hint: '空壳', wave: 'second' },
  { id: 'auth-signup', title: '注册', hint: '空壳', wave: 'second' },
  { id: 'auth-signin', title: '邮箱密码登录', hint: '空壳', wave: 'second' },
  { id: 'auth-verify-code', title: '邮箱验证码', hint: '空壳', wave: 'second' },
  { id: 'auth-set-password', title: '设新密码', hint: '空壳', wave: 'second' },
  { id: 'agent-task', title: '任务详情', hint: '环境好了 / Review，不是纯聊天', wave: 'second' },
  { id: 'automations', title: '自动化', hint: '两组：Perigee 定时 vs CLI /loop·workflow', wave: 'first' },
  { id: 'automations-gallery', title: '自动化模板墙', hint: '已收起，不是 CLI /loop', wave: 'first' },
  { id: 'automations-detail', title: '自动化详情', hint: 'Perigee 定时的停用 / 删除 / 跑过', wave: 'first' },
  { id: 'dashboard-overview', title: '账户概览', hint: '套餐、热力、集成', wave: 'second' },
  { id: 'settings-general', title: '通用设置', hint: '隐私、姓名、主题、会话', wave: 'second' },
  { id: 'settings-cloud-agents', title: '云端智能体设置', hint: '环境、密钥、空态或已配', wave: 'second' },
  { id: 'settings-integrations', title: '集成', hint: '连接卡 + User API Keys', wave: 'second' },
  { id: 'settings-usage', title: '用量', hint: '用量图和明细', wave: 'second' },
  { id: 'settings-billing', title: '账单与发票', hint: '套餐、付款、发票', wave: 'second' },
  { id: 'onboarding-download', title: '就绪去下载', hint: '验证后先到这里', wave: 'second' },
  { id: 'onboarding-team', title: '建立团队', hint: '队名、席位、年付/月付', wave: 'second' },
  { id: 'auth-github', title: 'GitHub 授权', hint: '空壳', wave: 'later' },
  { id: 'agents-setup', title: '完成云端设置', hint: '进行中 / 可保存 / 完成', wave: 'second' },
  { id: 'agents-setup-done', title: '环境就绪', hint: 'setup 完成清单', wave: 'second' },
  { id: 'agent-secrets', title: '任务·密钥', hint: '任务右栏 Secrets', wave: 'second' },
  { id: 'agent-git', title: '任务·Git', hint: '任务右栏 Git', wave: 'second' },
  { id: 'agent-desktop', title: '任务·桌面', hint: '虚拟桌面预览', wave: 'second' },
  { id: 'agent-terminal', title: '任务·终端', hint: '任务右栏 Terminal', wave: 'second' },
  { id: 'settings-repos', title: '打开仓库', hint: '空壳', wave: 'later' },
  { id: 'settings-api-keys', title: '用户 API Key', hint: '空壳', wave: 'later' },
  { id: 'settings-bugbot', title: 'Bugbot', hint: '总览 / 空态或一条 Review', wave: 'second' },
  { id: 'settings-bugbot-repos', title: 'Bugbot 仓库开关', hint: '空壳', wave: 'later' },
  { id: 'settings-bugbot-rules', title: 'Bugbot 仓库规则', hint: '空态 / 一条规则 / 加规则弹窗', wave: 'second' },
  { id: 'settings-bugbot-rule-edit', title: 'Bugbot 规则编辑', hint: '改一条仓库规则', wave: 'second' },
  { id: 'settings-plugins', title: '插件', hint: '空态 / 建议 / 搜索', wave: 'second' },
  { id: 'settings-plugins-detail', title: '插件详情', hint: '未装 Add to Perigee / 已装 Uninstall', wave: 'second' },
  { id: 'settings-members', title: '成员', hint: '个人 Pro 升级 Teams 墙', wave: 'second' },
  { id: 'settings-members-invite', title: '邀请成员', hint: '空壳', wave: 'later' },
  { id: 'settings-spending', title: '支出上限', hint: '套餐和月度上限', wave: 'second' },
  { id: 'settings-plan', title: '改套餐', hint: '四档弹窗；start=独立劝升级', wave: 'second' },
  { id: 'settings-contact', title: '联系我们', hint: '空壳', wave: 'later' },
  { id: 'settings-docs', title: '文档', hint: '空壳', wave: 'later' },
  { id: 'settings-deactivate', title: '停用账号', hint: '挂在通用设置上的弹窗', wave: 'second' },
  { id: 'workbench', title: '编辑器主窗', hint: '空壳', wave: 'later' },
  { id: 'search', title: '全局搜索', hint: '空壳', wave: 'later' },
  { id: 'scm', title: '源码管理', hint: '空壳', wave: 'later' },
  { id: 'extensions', title: '扩展', hint: '空壳', wave: 'later' },
  { id: 'terminal', title: '面板终端', hint: '空壳', wave: 'later' },
  { id: 'problems', title: '问题', hint: '空壳', wave: 'later' },
  { id: 'debug', title: '调试', hint: '空壳', wave: 'later' },
  { id: 'output', title: '输出', hint: '空壳', wave: 'later' },
  { id: 'review-diff', title: '审改', hint: '任务右栏 Git / diff', wave: 'second' },
  { id: 'settings-app-general', title: '应用设置·通用', hint: '空壳', wave: 'later' },
  { id: 'settings-app-agents', title: '应用设置·智能体', hint: '空壳', wave: 'later' },
  { id: 'settings-app-tab', title: '应用设置·Tab 补全', hint: '空壳', wave: 'later' },
  { id: 'settings-app-mcp', title: '应用设置·工具与 MCP', hint: '空壳', wave: 'later' },
  { id: 'settings-app-rules', title: '应用设置·规则', hint: '空壳', wave: 'later' },
  { id: 'settings-app-indexing', title: '应用设置·索引与文档', hint: '空壳', wave: 'later' },
  { id: 'settings-app-network', title: '应用设置·网络', hint: '空壳', wave: 'later' },
  { id: 'settings-app-beta', title: '应用设置·试验', hint: '空壳', wave: 'later' },
  { id: 'settings-keyboard', title: '键盘快捷键', hint: '空壳', wave: 'later' },
  { id: 'worktrees', title: '隔离目录', hint: '官方 grok worktree 列表；-w 开会话；fork 分叉', wave: 'first' }
]

export function isPageId(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value)
}

export function pageById(id: PageId): PageMeta {
  const found = PAGES.find((p) => p.id === id)
  if (!found) throw new Error(`unknown page: ${id}`)
  return found
}

/** 主路径：侧栏还在用的页。公司页仍可 goto，但不进 pages 主列表。 */
export const PRIMARY_PAGE_IDS = [
  'agents-home',
  'chat',
  'automations',
  'automations-detail',
  'settings-models',
  'worktrees'
] as const

export const PRIMARY_PAGES: PageMeta[] = PRIMARY_PAGE_IDS.map((id) => pageById(id))

export const GATE_PAGE_IDS = [
  'welcome',
  'sign-in',
  'sign-up',
  'verify-email',
  'onboarding-download',
  'onboarding-team'
] as const

export const ACCOUNT_PAGE_IDS = [
  'dashboard-overview',
  'settings-general',
  'settings-cloud-agents',
  'settings-usage',
  'settings-spending',
  'settings-billing',
  'settings-members',
  'settings-plan',
  'settings-deactivate',
  'settings-bugbot',
  'settings-bugbot-rules',
  'settings-bugbot-rule-edit',
  'settings-plugins',
  'settings-plugins-detail',
  'settings-integrations'
] as const

export const BUGBOT_PAGE_IDS = [
  'settings-bugbot',
  'settings-bugbot-rules',
  'settings-bugbot-rule-edit'
] as const

export const PLUGIN_PAGE_IDS = ['settings-plugins', 'settings-plugins-detail'] as const

export const TASK_PAGE_IDS = [
  'agents-setup',
  'agents-setup-done',
  'agent-task',
  'agent-secrets',
  'agent-git',
  'agent-desktop',
  'agent-terminal',
  'review-diff'
] as const

export const AUTO_PAGE_IDS = ['automations', 'automations-gallery', 'automations-detail'] as const

export function isGatePage(id: string): boolean {
  return (GATE_PAGE_IDS as readonly string[]).includes(id)
}

export function isAccountPage(id: string): boolean {
  return (ACCOUNT_PAGE_IDS as readonly string[]).includes(id)
}

export function isTaskPage(id: string): boolean {
  return (TASK_PAGE_IDS as readonly string[]).includes(id)
}

export function isAutoPage(id: string): boolean {
  return (AUTO_PAGE_IDS as readonly string[]).includes(id)
}

export function isBugbotPage(id: string): boolean {
  return (BUGBOT_PAGE_IDS as readonly string[]).includes(id)
}

export function isPluginPage(id: string): boolean {
  return (PLUGIN_PAGE_IDS as readonly string[]).includes(id)
}

export function accountNavId(id: PageId): PageId {
  if (id === 'settings-plan') return 'dashboard-overview'
  if (id === 'settings-deactivate') return 'settings-general'
  if (isBugbotPage(id)) return 'settings-bugbot'
  if (isPluginPage(id)) return 'settings-plugins'
  if (id === 'settings-members') return 'settings-members'
  return id
}
