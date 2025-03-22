import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import electronRenderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    electronRenderer(),
  ],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/web/client/index.html',
      },
    },
  },
  server: {
    port: 3000,
  },
})
