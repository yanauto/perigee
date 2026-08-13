/** 引擎是否在「本地回声」——缺 CLI 或实际跑 Stub，界面必须说清楚。 */
export function engineEchoing(
  info: { engineModeActual?: string; grokAvailable?: boolean } | null | undefined
): boolean {
  if (!info) return false
  return info.engineModeActual === 'stub' || info.grokAvailable === false
}
