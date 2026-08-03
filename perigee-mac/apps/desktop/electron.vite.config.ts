import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const workspaceSrc = {
  '@perigee/event-schema': resolve(__dirname, '../../packages/event-schema/src/index.ts'),
  '@perigee/engine-protocol': resolve(
    __dirname,
    '../../packages/engine-protocol/src/index.ts'
  ),
  '@perigee/engine-grok-build': resolve(
    __dirname,
    '../../packages/engine-grok-build/src/index.ts'
  ),
  '@perigee/engine-grok-acp': resolve(
    __dirname,
    '../../packages/engine-grok-acp/src/index.ts'
  ),
  '@perigee/host-core': resolve(__dirname, '../../packages/host-core/src/index.ts'),
  '@perigee/md-core': resolve(__dirname, '../../packages/md-core/src/index.ts')
}

const workspaceExclude = Object.keys(workspaceSrc)

export default defineConfig({
  main: {
    resolve: { alias: workspaceSrc },
    plugins: [externalizeDepsPlugin({ exclude: workspaceExclude })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias: workspaceSrc },
    // sandbox preload 必须是 CJS：ESM(.mjs) 会报 Cannot use import statement outside a module → 全黑屏
    plugins: [externalizeDepsPlugin({ exclude: workspaceExclude })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        ...workspaceSrc,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
