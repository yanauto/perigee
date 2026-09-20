import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

const workspaceSrc = {
  '@perigee/event-schema': resolve(__dirname, '../../packages/event-schema/src/index.ts'),
  '@perigee/engine-protocol': resolve(
    __dirname,
    '../../packages/engine-protocol/src/index.ts'
  ),
  '@perigee/engine-grok-acp': resolve(
    __dirname,
    '../../packages/engine-grok-acp/src/index.ts'
  ),
  '@perigee/host-core': resolve(__dirname, '../../packages/host-core/src/index.ts')
}

const workspaceExclude = Object.keys(workspaceSrc)

export default defineConfig({
  main: {
    resolve: { alias: { ...workspaceSrc, '@shared': shared } },
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
    plugins: [externalizeDepsPlugin()],
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
        '@shared': shared,
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
