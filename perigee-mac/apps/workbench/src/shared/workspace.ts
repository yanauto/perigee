/** 从绝对路径取出文件夹名，给首页/侧栏显示。不碰 fs。 */
export function folderName(absPath: string): string {
  const trimmed = absPath.replace(/[\\/]+$/, '')
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const name = i >= 0 ? trimmed.slice(i + 1) : trimmed
  return name || absPath
}

export const NO_WORKSPACE_TEXT = '还没打开文件夹。先用 workbench workspace <路径>，或在首页点「打开文件夹」。'
