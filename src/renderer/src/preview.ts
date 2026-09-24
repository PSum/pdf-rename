import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { baseName } from '@shared/filename'

GlobalWorkerOptions.workerSrc = workerUrl

const ASSETS = new URL('./pdfjs/', document.baseURI).href

export interface Preview {
  /** Show the PDF at `path` (or nothing). Returns immediately; rendering is lazy. */
  show(path: string | null): void
  /** Scroll by roughly one screen. */
  scroll(direction: 1 | -1): void
}

/**
 * Scrollable pdf.js preview. Only the most recent `show()` ever paints: earlier
 * loads that finish late are discarded. Pages render as they scroll into view.
 */
export function createPreview(
  container: HTMLElement,
  readFile: (path: string) => Promise<Uint8Array>
): Preview {
  let generation = 0
  let doc: PDFDocumentProxy | null = null
  let observer: IntersectionObserver | null = null

  function reset(): void {
    observer?.disconnect()
    observer = null
    doc?.loadingTask.destroy()
    doc = null
    container.replaceChildren()
    container.scrollTop = 0
  }

  function message(text: string): void {
    const div = document.createElement('div')
    div.className = 'preview-msg'
    div.textContent = text
    container.replaceChildren(div)
  }

  async function load(path: string, gen: number): Promise<void> {
    const stale = (): boolean => gen !== generation

    let loaded: PDFDocumentProxy
    try {
      const data = await readFile(path)
      if (stale()) return
      loaded = await getDocument({
        data,
        cMapUrl: ASSETS + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: ASSETS + 'standard_fonts/',
        wasmUrl: ASSETS + 'wasm/',
        iccUrl: ASSETS + 'iccs/'
      }).promise
    } catch (e) {
      // Errors from main arrive as "Error invoking remote method 'x': Error: <text>".
      const text = (e as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
      if (!stale()) message(`Could not display ${baseName(path)}\n${text}`)
      return
    }
    if (stale()) {
      loaded.loadingTask.destroy()
      return
    }
    doc = loaded

    // Placeholders sized like page 1 keep the scrollbar stable before pages render.
    const first = (await loaded.getPage(1)).getViewport({ scale: 1 })
    if (stale()) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io.unobserve(entry.target)
          renderPage(loaded, entry.target as HTMLElement, stale)
        }
      },
      { root: container, rootMargin: '100% 0px' }
    )
    observer = io
    for (let n = 1; n <= loaded.numPages; n++) {
      const div = document.createElement('div')
      div.className = 'page'
      div.dataset.page = String(n)
      div.style.aspectRatio = `${first.width} / ${first.height}`
      container.append(div)
      io.observe(div)
    }
  }

  async function renderPage(pdf: PDFDocumentProxy, div: HTMLElement, stale: () => boolean): Promise<void> {
    try {
      const page = await pdf.getPage(Number(div.dataset.page))
      if (stale()) return
      const base = page.getViewport({ scale: 1 })
      div.style.aspectRatio = `${base.width} / ${base.height}`
      const viewport = page.getViewport({ scale: (div.clientWidth * devicePixelRatio) / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise
      if (!stale()) div.replaceChildren(canvas)
    } catch {
      // The document was replaced mid-render; nothing to paint.
    }
  }

  return {
    show(path) {
      const gen = ++generation
      reset()
      if (path) load(path, gen)
    },
    scroll(direction) {
      container.scrollBy({ top: direction * 0.9 * container.clientHeight, behavior: 'smooth' })
    }
  }
}
