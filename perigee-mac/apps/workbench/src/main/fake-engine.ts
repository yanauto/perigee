export function titleFrom(userText: string): string {
  const line = userText.trim().split(/\s+/).join(' ')
  if (!line) return '未命名'
  return line.length > 28 ? `${line.slice(0, 27)}…` : line
}
