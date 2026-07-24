const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stampFocus', {
  savePdf: (bytes, suggestedName) => ipcRenderer.invoke('save-pdf', bytes, suggestedName),
})
