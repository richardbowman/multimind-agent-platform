import { defineConfig } from 'vite'
import electronConfig from './vite.electron.config'
import rendererConfig from './vite.renderer.config'

export default defineConfig(({ mode }) => {
  if (mode === 'electron') {
    return electronConfig
  }
  return rendererConfig
})
