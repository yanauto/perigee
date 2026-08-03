import { describe, expect, it } from 'vitest'
import { canOpenInApp, extOf, fallbackReasonText, needsSystemOpen } from './openable'

describe('extOf', () => {
  it('取小写扩展名', () => {
    expect(extOf('/a/b/c.TS')).toBe('.ts')
    expect(extOf('note.md')).toBe('.md')
    expect(extOf('/x/y/archive.tar.gz')).toBe('.gz')
  })
  it('无扩展名 / 点开头文件给空串', () => {
    expect(extOf('/usr/bin/grok')).toBe('')
    expect(extOf('.gitignore')).toBe('')
    expect(extOf('Makefile')).toBe('')
  })
})

describe('canOpenInApp（应用内查看器是文本/代码/Markdown）', () => {
  it('文本与代码：应用内打开', () => {
    for (const p of [
      '~/Desktop/Text.md',
      '/Users/y/notes.txt',
      'src/App.tsx',
      'a/b/c.ts',
      'config.json',
      'style.css',
      'script.py',
      'Makefile',
      '.gitignore',
      'data.csv',
      'README'
    ]) {
      expect(canOpenInApp(p), p).toBe(true)
    }
  })

  it('二进制 / 富格式：交给系统应用', () => {
    for (const p of [
      'shot.png',
      'photo.JPEG',
      'doc.pdf',
      '报告.docx',
      'table.xlsx',
      'app.dmg',
      'lib.dylib',
      'db.sqlite3',
      'font.woff2',
      'movie.mp4',
      'archive.zip'
    ]) {
      expect(canOpenInApp(p), p).toBe(false)
      expect(needsSystemOpen(p), p).toBe(true)
    }
  })

  it('目录与空值不算可打开', () => {
    expect(canOpenInApp('/a/b/')).toBe(false)
    expect(canOpenInApp('')).toBe(false)
    expect(canOpenInApp('   ')).toBe(false)
  })

  it('判不准的倾向应用内先试（读失败还有系统兜底）', () => {
    expect(canOpenInApp('/tmp/weird.xyz')).toBe(true)
    expect(canOpenInApp('/tmp/no-ext-file')).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(canOpenInApp('A.PNG')).toBe(false)
    expect(canOpenInApp('A.MD')).toBe(true)
  })
})

describe('兜底文案', () => {
  it('两种原因各有文案', () => {
    expect(fallbackReasonText('binary')).toMatch(/不是应用内可读/)
    expect(fallbackReasonText('read_failed')).toMatch(/读取失败/)
  })
})
