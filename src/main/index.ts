import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFileAccess } from './files'
import { loadWindowState, trackWindowState } from './windowState'

// Lets tests run against a throwaway profile instead of the user's.
if (process.env.PDF_RENAME_USER_DATA) app.setPath('userData', process.env.PDF_RENAME_USER_DATA)

// One window only: starting the app again brings the existing window to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

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
  const stateFile = join(app.getPath('userData'), 'window-state.json')
  const state = loadWindowState(stateFile)
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    ...state.bounds,
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

  if (state.maximized) win.maximize()
  trackWindowState(win, stateFile)

  // Zoom belongs to the PDF preview only, never to the whole window.
  win.webContents.setVisualZoomLevelLimits(1, 1)

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

// No menu on Windows/Linux: its accelerators (Ctrl+R, Ctrl+Plus, …) would fight the
// app's own shortcuts. macOS needs the Edit menu for copy/paste to work.
function setMenu(): void {
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null
  )
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(() => {
  setMenu()
  serveRenderer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
