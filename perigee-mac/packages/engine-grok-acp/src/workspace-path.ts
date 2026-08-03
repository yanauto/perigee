/**
 * path-guard：与 host-core 同实现。
 * 引擎包依赖 host-core 仅复用路径语义，避免再抄一份（审计架构债）。
 */
export { resolveInWorkspace } from '@perigee/host-core'
