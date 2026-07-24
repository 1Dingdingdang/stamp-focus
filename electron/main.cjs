const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { pathToFileURL } = require('url')

const MAX_PDF_BYTES = 1024 * 1024 * 1024

const trustedEntryUrl = () => {
  if (process.env.VITE_DEV_SERVER_URL) return process.env.VITE_DEV_SERVER_URL
  if (!app.isPackaged) return 'http://127.0.0.1:5173'
  return pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
}

const isTrustedRendererUrl = (candidate) => {
  try {
    const trusted = new URL(trustedEntryUrl())
    const current = new URL(candidate)
    if (trusted.protocol === 'file:') return current.href === trusted.href
    return current.origin === trusted.origin
  } catch {
    return false
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f4f1e9',
    title: '章准 · Stamp Focus',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else if (!app.isPackaged) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.handle('save-pdf', async (event, bytes, suggestedName) => {
  if (!isTrustedRendererUrl(event.senderFrame.url)) throw new Error('拒绝非本应用页面的导出请求')
  if (!bytes || typeof bytes.byteLength !== 'number') throw new Error('导出数据格式无效')

  const pdfBytes = Buffer.from(bytes)
  if (
    pdfBytes.length === 0 ||
    pdfBytes.length > MAX_PDF_BYTES ||
    pdfBytes.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('导出数据不是有效的 PDF 文件')
  }

  const requestedName =
    typeof suggestedName === 'string' && suggestedName.trim()
      ? path.basename(suggestedName.trim())
      : '已签章.pdf'
  const safeName = requestedName.toLowerCase().endsWith('.pdf')
    ? requestedName
    : `${requestedName}.pdf`
  const result = await dialog.showSaveDialog({
    title: '导出已盖章 PDF',
    defaultPath: safeName,
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  await fs.writeFile(result.filePath, pdfBytes)
  return { canceled: false, filePath: result.filePath }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
