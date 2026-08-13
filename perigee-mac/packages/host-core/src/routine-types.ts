/**
 * Routines 数据模型（T018）
 * 契约字段名钉死；派生字段 nextRunAt 仅 list 返回，不持久化。
 */

export type RoutineTriggerKind = 'daily' | 'weekly' | 'interval' | 'cron'

export interface RoutineTrigger {
  kind: RoutineTriggerKind
  /** 'HH:mm'，daily/weekly 用 */
  time?: string
  /** 0–6（周日=0），weekly 用 */
  weekday?: number
  /** interval 用，分钟 */
  everyMinutes?: number
  /** cron 用：5 字段（分 时 日 月 周） */
  expr?: string
}

export type RoutineRunStatus = 'ok' | 'fail'

export interface RoutineRun {
  id: string
  /** 产生的会话，可跳转 */
  sessionId: string
  startedAt: number
  durationMs: number
  status: RoutineRunStatus
  /** 一行结果摘要 */
  summary?: string
}

export interface Routine {
  id: string
  name: string
  /** 派活指令（首条 prompt） */
  instruction: string
  enabled: boolean
  /** 工作区绝对路径 */
  workspace: string
  model: string
  effort?: string
  triggers: RoutineTrigger[]
  /** 允许使用的 MCP 连接器名单 */
  mcpServers: string[]
  /** 跑完是否系统通知 */
  notify: boolean
  createdAt: number
  /** 运行记录，新在前，最多 50 条 */
  runs: RoutineRun[]
}

/** list / 推送用：含派生 nextRunAt */
export type RoutineView = Routine & {
  nextRunAt?: number
}

export type RoutineCreateInput = Omit<Routine, 'id' | 'createdAt' | 'runs'>
export type RoutinePatch = Partial<Omit<Routine, 'id' | 'createdAt' | 'runs'>>

export const ROUTINE_RUNS_MAX = 50
