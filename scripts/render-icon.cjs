// Renders build/icon.svg to build/icon.png (1024×1024), which electron-builder
// turns into the Windows .ico, macOS .icns and Linux icons.
// Usage: npm run icon [-- other/output.png]
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 1024
const svgPath = path.join(__dirname, '../build/icon.svg')
// Electron's argv also holds its own switches and this script's path: take the first *.png.
const out = process.argv.slice(2).find((a) => a.endsWith('.png')) ?? path.join(__dirname, '../build/icon.png')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  const svg = fs.readFileSync(svgPath, 'utf8')
  const html = `<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}">
  </body></html>`
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  fs.writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG())
  console.log('wrote', out)
  app.quit()
})
