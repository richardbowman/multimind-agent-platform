import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    electron({
      entry: 'src/main.electron.ts',
      vite: {
        build: {
          outDir: 'dist/main',
          rollupOptions: {
            external: ['electron', 'node-llama-cpp', '@node-llama-cpp'],
          },
        },
      },
    }),
    renderer(),
    tsconfigPaths(),
  ],
  build: {
    emptyOutDir: false,
  },
})
