import { describe, expect, it } from 'vitest'
import { isPowerShellPath, shellCommandArgs } from './shell-detect.js'

describe('shell-detect', () => {
  it('识别 pwsh / powershell 路径', () => {
    expect(isPowerShellPath('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe(true)
    expect(isPowerShellPath('/usr/bin/pwsh')).toBe(true)
    expect(isPowerShellPath('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(
      true
    )
    expect(isPowerShellPath('C:\\Windows\\System32\\cmd.exe')).toBe(false)
    expect(isPowerShellPath('/bin/zsh')).toBe(false)
  })

  it('shellCommandArgs：Unix 用 -c', () => {
    if (process.platform === 'win32') return
    expect(shellCommandArgs('/bin/zsh', 'echo hi')).toEqual(['-c', 'echo hi'])
  })

  it('shellCommandArgs：Win cmd 用 /d /s /c', () => {
    if (process.platform !== 'win32') {
      // 函数内部看 process.platform；在非 win 上强制测 cmd 分支不可行，只测 PowerShell 形态在 win 外不触发
      expect(shellCommandArgs('/bin/zsh', 'x')).toEqual(['-c', 'x'])
      return
    }
    expect(shellCommandArgs('C:\\Windows\\System32\\cmd.exe', 'echo hi')).toEqual([
      '/d',
      '/s',
      '/c',
      'echo hi'
    ])
    expect(shellCommandArgs('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'echo hi')).toEqual([
      '-NoProfile',
      '-Command',
      'echo hi'
    ])
  })
})
