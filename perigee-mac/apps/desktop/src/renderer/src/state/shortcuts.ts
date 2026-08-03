/**
 * 快捷键总表（T017：ShortcutsModal 与设置「快捷键」页共用一份，避免两处漂移）。
 * 全局键在 state/keymap；Composer 局部键（/ · @ · ↑ · ⇧⇥ · Enter）由 Composer 自处理；
 * A / D 审批键在 Chat/ChatStream（输入框聚焦时不生效）。
 * 文案是中文源串，渲染时过 t()。
 */

export type ShortcutRow = { keys: string[]; action: string; note?: string }

const SHORTCUT_ROWS_MAC: ShortcutRow[] = [
  { keys: ['⌘K'], action: '命令面板（壳命令 · slash · 会话 · 文件）' },
  { keys: ['⌘N'], action: '新会话（去首页并聚焦输入框）' },
  { keys: ['⌘1…9'], action: '切到第 N 个会话' },
  { keys: ['⌘B'], action: '侧栏收起/展开（收起时悬停图标出浮窗）' },
  { keys: ['⌘I'], action: '上下文面板（右栏）' },
  { keys: ['⌘`'], action: '终端抽屉' },
  { keys: ['⌘U'], action: '添加文件到输入框' },
  { keys: ['⌘M'], action: '模型切换（≤2 步完成）' },
  { keys: ['⌘,'], action: '设置' },
  { keys: ['/'], action: 'slash 菜单', note: 'Composer 内' },
  { keys: ['@'], action: '引用文件', note: 'Composer 内' },
  { keys: ['↑'], action: '提示词历史', note: 'Composer 空输入时' },
  { keys: ['⇧Tab'], action: '权限模式循环' },
  { keys: ['A', 'D'], action: '允许 · 拒绝当前审批', note: '输入框未聚焦时' },
  { keys: ['⌘V', '拖放'], action: '贴图 / 拖入图片附件' },
  { keys: ['Enter', '⇧Enter'], action: '发送 · 换行' },
  { keys: ['Esc'], action: '逐层关闭（弹层 → 面板/弹窗 → 右栏 → 取消流式）' }
]

/** 将 mac 修饰符文案映射为非 darwin 显示（⌘→Ctrl，⇧→Shift+） */
export function localizeShortcutKey(key: string, platform: string): string {
  if (platform === 'darwin') return key
  return key.replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+')
}

export function shortcutRowsForPlatform(platform: string): ShortcutRow[] {
  if (platform === 'darwin') return SHORTCUT_ROWS_MAC
  return SHORTCUT_ROWS_MAC.map((r) => ({
    ...r,
    keys: r.keys.map((k) => localizeShortcutKey(k, platform))
  }))
}

/** 默认按 mac 展示（旧引用兼容）；UI 应优先 shortcutRowsForPlatform */
export const SHORTCUT_ROWS = SHORTCUT_ROWS_MAC
