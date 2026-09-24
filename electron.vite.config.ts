import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { defineConfig as defineElectronConfig } from 'electron-vite'

const shared = { resolve: { alias: { '@shared': resolve('src/shared') } } }

// pdf.js loads fonts, cmaps, colour profiles and wasm decoders at runtime by URL.
// Copy them from node_modules into the renderer's public folder.
function copyPdfjsAssets(): Plugin {
  return {
    name: 'copy-pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        cpSync(resolve('node_modules/pdfjs-dist', dir), resolve('src/renderer/public/pdfjs', dir), {
          recursive: true
        })
      }
    }
  }
}

export default defineElectronConfig({
  main: shared,
  preload: shared,
  renderer: defineConfig({ ...shared, plugins: [copyPdfjsAssets()] })
})
