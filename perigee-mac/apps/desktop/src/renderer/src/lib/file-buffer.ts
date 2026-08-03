/** 文件缓冲状态机（纯函数，便于单测） */

export type FileBufferState = {
  path: string
  content: string
  baseline: string
  dirty: boolean
  conflict: boolean
  truncated: boolean
  loadError: string | null
}

export function createEmptyBuffer(path: string): FileBufferState {
  return {
    path,
    content: '',
    baseline: '',
    dirty: false,
    conflict: false,
    truncated: false,
    loadError: null
  }
}

/** 磁盘内容到达：非 dirty 直接采用；dirty 且磁盘≠baseline → 冲突 */
export function applyDiskContent(
  state: FileBufferState,
  disk: { content: string; truncated?: boolean },
  opts?: { force?: boolean }
): FileBufferState {
  if (opts?.force || !state.dirty) {
    return {
      ...state,
      content: disk.content,
      baseline: disk.content,
      dirty: false,
      conflict: false,
      truncated: !!disk.truncated,
      loadError: null
    }
  }
  if (disk.content !== state.baseline) {
    return {
      ...state,
      conflict: true,
      truncated: !!disk.truncated,
      loadError: null
    }
  }
  return { ...state, truncated: !!disk.truncated, loadError: null, conflict: false }
}

export function applyLocalEdit(state: FileBufferState, content: string): FileBufferState {
  return {
    ...state,
    content,
    dirty: content !== state.baseline,
    // 编辑不自动清冲突（仍可能与磁盘分叉）
  }
}

/** 保存前检查：磁盘已变且非强制 → conflict */
export function prepareSave(
  state: FileBufferState,
  diskContent: string,
  force: boolean
): { ok: true; content: string } | { ok: false; reason: 'conflict' | 'clean' | 'error' } {
  if (state.loadError) return { ok: false, reason: 'error' }
  if (!state.dirty && !force) return { ok: false, reason: 'clean' }
  if (!force && diskContent !== state.baseline) return { ok: false, reason: 'conflict' }
  return { ok: true, content: state.content }
}

export function afterSuccessfulSave(state: FileBufferState, saved: string): FileBufferState {
  return {
    ...state,
    content: saved,
    baseline: saved,
    dirty: false,
    conflict: false
  }
}
