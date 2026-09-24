import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFileAccess } from './files'

const files = createFileAccess()

// The packaged renderer is served from app://bundle/ rather than file:// so that
// pdf.js can start its module worker and fetch its assets from a real origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function serveRenderer(): void {
  const root = join(__dirname, '../renderer')
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname)
    const file = normalize(join(root, rel === '/' ? 'index.html' : rel))
    if (file !== root && !file.startsWith(root + sep)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    title: 'PDF Rename',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  // A file dropped outside the drop zone must not navigate the window away.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadURL('app://bundle/index.html')
  }
}

ipcMain.handle('expand-paths', (_e, paths: string[]) => files.open(paths))
ipcMain.handle('read-file', (_e, path: string) => files.read(path))
ipcMain.handle('rename', (_e, from: string, newBase: string, overwrite: boolean) =>
  files.rename(from, newBase, overwrite)
)
ipcMain.handle('open-dialog', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose PDFs',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf', 'PDF'] }]
  })
  return files.open(res.canceled ? [] : res.filePaths)
})

app.whenReady().then(() => {
  serveRenderer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
