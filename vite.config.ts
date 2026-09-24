import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// pdf.js loads fonts, cmaps, colour profiles and wasm decoders at runtime by URL.
// Copy them from node_modules into the public folder.
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

export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: { '@shared': resolve('src/shared') } },
  plugins: [copyPdfjsAssets()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: resolve('out'), emptyOutDir: true, target: 'es2022' }
})
