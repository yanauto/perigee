import { describe, expect, it } from 'vitest'
import {
  buildAcpPromptBlocks,
  classifyMediaPath,
  mimeFromPath,
  parsePromptCapabilities
} from './prompt-blocks.js'

describe('parsePromptCapabilities', () => {
  it('读 agentCapabilities.promptCapabilities', () => {
    expect(
      parsePromptCapabilities({
        agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true } }
      })
    ).toEqual({ image: true, audio: false, embeddedContext: true })
  })

  it('缺省全 false', () => {
    expect(parsePromptCapabilities({})).toEqual({
      image: false,
      audio: false,
      embeddedContext: false
    })
  })
})

describe('buildAcpPromptBlocks', () => {
  const img = {
    kind: 'image' as const,
    name: 'a.png',
    mimeType: 'image/png',
    uri: 'file:///tmp/a.png',
    dataBase64: 'AAA'
  }

  it('有 image 能力时发 image block', () => {
    const { blocks, warnings } = buildAcpPromptBlocks('看图', [img], {
      image: true,
      audio: false,
      embeddedContext: false
    })
    expect(blocks[0]).toEqual({ type: 'text', text: '看图' })
    expect(blocks[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: 'AAA' })
    expect(warnings).toHaveLength(0)
  })

  it('无 image 能力降级 resource_link 并警告', () => {
    const { blocks, warnings } = buildAcpPromptBlocks('看图', [img], {
      image: false,
      audio: false,
      embeddedContext: false
    })
    expect(blocks.some((b) => b.type === 'resource_link')).toBe(true)
    expect(warnings[0]).toMatch(/resource_link/)
  })

  it('pdf + embeddedContext → resource blob', () => {
    const { blocks } = buildAcpPromptBlocks(
      '读 pdf',
      [
        {
          kind: 'pdf',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          uri: 'file:///tmp/a.pdf',
          dataBase64: 'BBB'
        }
      ],
      { image: false, audio: false, embeddedContext: true }
    )
    expect(blocks[1]).toMatchObject({
      type: 'resource',
      resource: { mimeType: 'application/pdf', blob: 'BBB' }
    })
  })
})

describe('mimeFromPath / classifyMediaPath', () => {
  it('识别扩展名', () => {
    expect(mimeFromPath('x.PNG')).toBe('image/png')
    expect(classifyMediaPath('a.pdf')).toBe('pdf')
    expect(classifyMediaPath('a.ts')).toBe('file')
  })
})
