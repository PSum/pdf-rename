import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '@shared/types'

const api: Api = {
  pathForFile: (file) => webUtils.getPathForFile(file),
  expandPaths: (paths) => ipcRenderer.invoke('expand-paths', paths),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  rename: (from, newBase, overwrite) => ipcRenderer.invoke('rename', from, newBase, overwrite),
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
