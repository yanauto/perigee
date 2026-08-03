import { describe, expect, it } from 'vitest'
import type { ChatBlock } from './types'
import {
  canonicalFilePath,
  classifyTool,
  dedupeFilePaths,
  describeToolSegment,
  emptyTally,
  tallyToolBlocks
} from './turn-aggregate'

const tool = (name: string, over: Partial<Extract<ChatBlock, { kind: 'tool' }>> = {}): ChatBlock => ({
  kind: 'tool',
  id: `t-${name}-${Math.random()}`,
  callId: `c-${Math.random()}`,
  name,
  args: {},
  status: 'done',
  ts: '2026-08-02T10:00:00.000Z',
  ...over
})

describe('classifyTool', () => {
  it('按关键词归类', () => {
    expect(classifyTool('Grep')).toBe('search')
    expect(classifyTool('Glob')).toBe('search')
    expect(classifyTool('Bash')).toBe('command')
    expect(classifyTool('Write')).toBe('edit')
    expect(classifyTool('Edit')).toBe('edit')
    expect(classifyTool('Read')).toBe('read')
    expect(classifyTool('WebFetch')).toBe('web')
    expect(classifyTool('SomethingWeird')).toBe('other')
  })

  it('kind 字段参与判定；大小写不敏感', () => {
    expect(classifyTool('x', 'search')).toBe('search')
    expect(classifyTool('BASH')).toBe('command')
  })

  it('edit 关键词优先于 read（write_file 不该算读）', () => {
    expect(classifyTool('write_file')).toBe('edit')
    expect(classifyTool('search_replace')).toBe('edit')
    expect(classifyTool('StrReplace')).toBe('edit')
  })
})

describe('tallyToolBlocks', () => {
  it('只数工具块，思考/计划不计', () => {
    const blocks: ChatBlock[] = [
      { kind: 'thought', id: 'th', text: '想', ts: '' },
      tool('Grep'),
      tool('Grep'),
      tool('Bash'),
      { kind: 'plan', id: 'p', entries: [], ts: '' }
    ]
    const s = tallyToolBlocks(blocks)
    expect(s.total).toBe(3)
    expect(s.tally.search).toBe(2)
    expect(s.tally.command).toBe(1)
  })

  it('统计运行中与失败（流式实时累加的基础）', () => {
    const s = tallyToolBlocks([
      tool('Grep', { status: 'running' }),
      tool('Bash', { status: 'error' }),
      tool('Read')
    ])
    expect(s.running).toBe(1)
    expect(s.failed).toBe(1)
    expect(s.total).toBe(3)
  })

  it('空段给零', () => {
    expect(tallyToolBlocks([]).total).toBe(0)
    expect(tallyToolBlocks([]).tally).toEqual(emptyTally())
  })
})

describe('describeToolSegment（聚合行文案）', () => {
  it('多类别按固定顺序拼接', () => {
    const s = tallyToolBlocks([
      ...Array.from({ length: 12 }, () => tool('Grep')),
      tool('Bash'),
      tool('Bash'),
      tool('Bash'),
      tool('Write'),
      tool('Write')
    ])
    expect(describeToolSegment(s)).toBe('搜索 12 次 · 执行 3 个命令 · 改 2 个文件')
  })

  it('单类别只有一段', () => {
    expect(describeToolSegment(tallyToolBlocks([tool('Read'), tool('Read')]))).toBe('读 2 个文件')
  })

  it('英文文案带复数', () => {
    const s = tallyToolBlocks([tool('Grep'), tool('Grep'), tool('Bash')])
    expect(describeToolSegment(s, 'en')).toBe('2 searches · 1 command')
  })

  it('没有工具调用给空串（调用方据此不渲染聚合行）', () => {
    expect(describeToolSegment(tallyToolBlocks([]))).toBe('')
    expect(describeToolSegment(tallyToolBlocks([{ kind: 'thought', id: 't', text: 'x', ts: '' }]))).toBe('')
  })
})

describe('canonicalFilePath / dedupeFilePaths（治同名 chip 重复）', () => {
  it('归一：./ 前缀、重复斜杠、尾斜杠', () => {
    expect(canonicalFilePath('./src/a.ts')).toBe('src/a.ts')
    expect(canonicalFilePath('src//a.ts')).toBe('src/a.ts')
    expect(canonicalFilePath('src/dir/')).toBe('src/dir')
  })

  it('工作区根下的绝对路径折成相对', () => {
    expect(canonicalFilePath('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
    expect(canonicalFilePath('/repo/src/a.ts', '/repo/')).toBe('src/a.ts')
    expect(canonicalFilePath('/other/x.ts', '/repo')).toBe('/other/x.ts')
  })

  it('同一文件的绝对/相对两种写法只留一条（真机 chip 重复的成因）', () => {
    expect(dedupeFilePaths(['src/a.ts', '/repo/src/a.ts'], null)).toEqual(['src/a.ts'])
    expect(dedupeFilePaths(['/repo/src/a.ts', 'src/a.ts'], '/repo')).toEqual(['src/a.ts'])
    expect(dedupeFilePaths(['./src/a.ts', 'src/a.ts'])).toEqual(['src/a.ts'])
  })

  it('同名但不同目录的文件**不能**被合并', () => {
    expect(dedupeFilePaths(['src/index.ts', 'lib/index.ts'])).toEqual([
      'src/index.ts',
      'lib/index.ts'
    ])
  })

  it('保持首次出现顺序；空值跳过', () => {
    expect(dedupeFilePaths(['b.ts', 'a.ts', 'b.ts', '', '   '])).toEqual(['b.ts', 'a.ts'])
  })
})
